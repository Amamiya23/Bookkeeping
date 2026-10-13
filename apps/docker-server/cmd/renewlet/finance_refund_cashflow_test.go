package main

import (
	"net/http"
	"testing"
)

func TestFinanceAccountlessRefundNetSpendingAndRestore(t *testing.T) {
	app, _, _, _, _ := financeTestSetup(t)
	user, token := createRouteTestUser(t, app, "refund-cashflow")
	ledger, err := ensureDefaultLedger(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	actor := financeActor{User: user.Id, Actor: "test"}
	expense, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", financeTransactionInput{Kind: "expense", Amount: "100", Currency: "CNY", OccurredOn: "2026-10-11", Category: "Food", Merchant: "Shop"})
	if err != nil {
		t.Fatal(err)
	}
	input := financeTransactionInput{Kind: "refund", Amount: "30", Currency: "CNY", OccurredOn: "2026-10-12", RefundOf: expense.ID}
	refund, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", input)
	if err != nil || refund.Category != "Food" || refund.Merchant != "Shop" {
		t.Fatalf("refund failed: %+v %v", refund, err)
	}
	input.Amount = "71"
	if _, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", input); err == nil {
		t.Fatal("over-refund accepted")
	}
	if _, err := voidFinanceTransaction(app, actor, ledger.Id, expense.ID, expense.Version, "wrong"); err == nil {
		t.Fatal("expense with refund could be voided")
	}
	read := func(query string) map[string]any {
		response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/reports/summary?from=2026-10-01&to=2026-10-31"+query, "", token)
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
		result := decodeAPISuccessDataForTest[struct {
			Totals map[string]any `json:"cnyTotals"`
		}](t, response.Body.Bytes())
		return result.Totals
	}
	total := read("")
	if total["income"] != "0" || total["grossExpense"] != "100" || total["refunds"] != "30" || total["netExpense"] != "70" || total["netIncome"] != "-70" {
		t.Fatal(total)
	}
	if total["categories"].(map[string]any)["Food"] != "70" || total["merchants"].(map[string]any)["Shop"] != "70" {
		t.Fatal(total)
	}
	// A subscription refund follows its original payment for both reports and lists.
	original, _ := app.FindRecordById("transactions", expense.ID)
	plan, err := financeNewRecord(app, "finance_plans", actor.User, ledger.Id)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]any{"name": "Service", "type": "subscription", "amount": "100", "currency": "CNY", "category": "Food", "unit": "month", "interval": 1, "nextDue": "2026-11-11", "anchorDay": 11, "status": "active"} {
		plan.Set(key, value)
	}
	if err := app.Save(plan); err != nil {
		t.Fatal(err)
	}
	original.Set("planId", plan.Id)
	if err := app.Save(original); err != nil {
		t.Fatal(err)
	}
	if read("")["subscriptionExpense"] != "70" {
		t.Fatal("subscription spending must follow its plan, not the category name")
	}
	if read("&group=recurring")["netExpense"] != "70" || read("&group=daily")["netExpense"] != "0" {
		t.Fatal("refund source grouping drifted")
	}
	for _, query := range []string{"group=recurring", "planId=" + plan.Id} {
		response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/transactions?"+query, "", token)
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
		result := decodeAPISuccessDataForTest[struct {
			Items []financeTransactionDTO `json:"items"`
		}](t, response.Body.Bytes())
		if len(result.Items) != 2 {
			t.Fatalf("refund missing from linked bills: %s", response.Body.String())
		}
	}
	original.Set("planId", "")
	if err := app.Save(original); err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(plan); err != nil {
		t.Fatal(err)
	}
	snapshot, err := exportFinanceSnapshot(app, actor.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "refund-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Transactions) != 2 {
		t.Fatalf("refund restore failed: %v", err)
	}
	if _, err := voidFinanceTransaction(app, actor, ledger.Id, refund.ID, refund.Version, "wrong refund"); err != nil {
		t.Fatal(err)
	}
	if read("")["netExpense"] != "100" {
		t.Fatal("voided refund still deducted")
	}
	// Older unlinked refunds are separated from income without rewriting records.
	if _, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", financeTransactionInput{Kind: "income", Category: "builtin:refund", Amount: "5", Currency: "CNY", OccurredOn: "2026-10-12"}); err != nil {
		t.Fatal(err)
	}
	if read("")["income"] != "0" || read("")["netExpense"] != "95" {
		t.Fatal("legacy refund counted as income")
	}
}
