package main

import (
	"net/http"
	"testing"
)

func TestFinanceSubscriptionDrilldownMatchesActualSpending(t *testing.T) {
	app, _, _, _, _ := financeTestSetup(t)
	user, token := createRouteTestUser(t, app, "drilldown")
	ledger, err := ensureDefaultLedger(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	actor := financeActor{User: user.Id, Actor: "test"}
	create := func(kind, amount, refundOf string) financeTransactionDTO {
		t.Helper()
		record, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", financeTransactionInput{Kind: kind, Amount: amount, Currency: "CNY", OccurredOn: "2026-10-12", Category: "builtin:meals", RefundOf: refundOf})
		if err != nil {
			t.Fatal(err)
		}
		return record
	}
	link := func(record financeTransactionDTO, kind string) {
		t.Helper()
		plan, err := financeNewRecord(app, "finance_plans", user.Id, ledger.Id)
		if err != nil {
			t.Fatal(err)
		}
		for key, value := range map[string]any{"name": kind, "type": kind, "amount": record.Amount, "currency": "CNY", "unit": "month", "interval": 1, "nextDue": "2026-11-12", "anchorDay": 12, "status": "active"} {
			plan.Set(key, value)
		}
		if err := app.Save(plan); err != nil {
			t.Fatal(err)
		}
		original, err := app.FindRecordById("transactions", record.ID)
		if err != nil {
			t.Fatal(err)
		}
		original.Set("planId", plan.Id)
		if err := app.Save(original); err != nil {
			t.Fatal(err)
		}
	}
	expense := create("expense", "100", "")
	link(expense, "subscription")
	refund := create("refund", "30", expense.ID)
	rent := create("expense", "3500", "")
	link(rent, "bill")
	create("expense", "20", "")
	voided := create("expense", "50", "")
	if _, err := voidFinanceTransaction(app, actor, ledger.Id, voided.ID, voided.Version, "duplicate"); err != nil {
		t.Fatal(err)
	}
	link(voided, "subscription")
	list := func(query, auth string) []financeTransactionDTO {
		t.Helper()
		response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/transactions?"+query, "", auth)
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
		return decodeAPISuccessDataForTest[struct {
			Items []financeTransactionDTO `json:"items"`
		}](t, response.Body.Bytes()).Items
	}
	items := list("group=subscription&status=posted&from=2026-10-01&to=2026-10-31", token)
	if len(items) != 2 {
		t.Fatalf("expected subscription expense and refund only: %+v", items)
	}
	found := map[string]bool{}
	for _, item := range items {
		found[item.ID] = true
	}
	if !found[expense.ID] || !found[refund.ID] {
		t.Fatal("subscription refund or category-mismatched expense missing")
	}
	response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/reports/summary?from=2026-10-01&to=2026-10-31&group=recurring", "", token)
	totals := decodeAPISuccessDataForTest[struct {
		Totals map[string]any `json:"cnyTotals"`
	}](t, response.Body.Bytes()).Totals
	if totals["subscriptionExpense"] != "70" {
		t.Fatalf("summary/list discrepancy: %+v", totals)
	}
	exact := list("id="+refund.ID, token)
	if len(exact) != 1 || exact[0].ID != refund.ID {
		t.Fatal("saved-entry link did not isolate record")
	}
	_, otherToken := createRouteTestUser(t, app, "drilldown-other")
	if len(list("group=subscription", otherToken)) != 0 || len(list("id="+expense.ID, otherToken)) != 0 {
		t.Fatal("drilldown crossed user boundary")
	}
}
