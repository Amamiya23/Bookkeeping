package main

import (
	"github.com/pocketbase/dbx"
	"net/http"
	"testing"
)

func TestFinancePlanPaymentLifecycle(t *testing.T) {
	app, a, l, _, _ := financeTestSetup(t)
	plan, err := saveFinancePlan(app, a, l, "", financePlanInput{Name: "Rent", Type: "bill", Amount: "2000", Currency: "CNY", Category: "builtin:housing", Unit: "month", Interval: 1, NextDue: "2026-01-31", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	action := financePlanAction{DueOn: plan.NextDue, Version: plan.Version, Action: "pay", Transaction: financeTransactionInput{Kind: "expense", Amount: "2100", Currency: "CNY", Category: plan.Category, OccurredOn: "2026-02-02", Merchant: plan.Name}}
	payment, err := settleFinancePlan(app, a, l, plan.ID, action)
	if err != nil {
		t.Fatal(err)
	}
	again, err := settleFinancePlan(app, a, l, plan.ID, action)
	if err != nil || again.TransactionID != payment.TransactionID {
		t.Fatalf("retry duplicated payment: %+v %v", again, err)
	}
	count, _ := app.CountRecords("transactions", dbx.HashExp{"user": a.User, "planId": plan.ID})
	if count != 1 {
		t.Fatal(count)
	}
	row, _ := financeOwned(app, "finance_plans", a.User, l, plan.ID)
	if row.GetString("nextDue") != "2026-02-28" {
		t.Fatal(row.GetString("nextDue"))
	}
	skipped, err := settleFinancePlan(app, a, l, plan.ID, financePlanAction{DueOn: "2026-02-28", Version: row.GetInt("version"), Action: "skip", Reason: "Waived"})
	if err != nil || skipped.Status != "skipped" {
		t.Fatal(err)
	}
	row, _ = financeOwned(app, "finance_plans", a.User, l, plan.ID)
	if row.GetString("nextDue") != "2026-03-31" {
		t.Fatal(row.GetString("nextDue"))
	}
	// Voiding an old payment reopens that date. Reconfirmation skips already resolved later periods.
	posted, _ := financeOwned(app, "transactions", a.User, l, payment.TransactionID)
	if _, err := voidFinanceTransaction(app, a, l, posted.Id, posted.GetInt("version"), "Correction"); err != nil {
		t.Fatal(err)
	}
	row, _ = financeOwned(app, "finance_plans", a.User, l, plan.ID)
	if row.GetString("nextDue") != "2026-01-31" {
		t.Fatal(row.GetString("nextDue"))
	}
	action.Version = row.GetInt("version")
	repayment, err := settleFinancePlan(app, a, l, plan.ID, action)
	if err != nil || repayment.TransactionID == payment.TransactionID {
		t.Fatal(err)
	}
	row, _ = financeOwned(app, "finance_plans", a.User, l, plan.ID)
	if row.GetString("nextDue") != "2026-03-31" {
		t.Fatal(row.GetString("nextDue"))
	}
	snapshot, err := exportFinanceSnapshot(app, a.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "plan-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Plans) != 1 || len(restored.Payments) != 2 || len(restored.Transactions) != 2 {
		t.Fatalf("restore lost links: %v %+v", err, restored)
	}
	for _, transaction := range restored.Transactions {
		if transaction.PlanID != restored.Plans[0].ID || transaction.CNYAmount != "2100" {
			t.Fatalf("incorrect restored link: %+v", transaction)
		}
	}
}
func TestFinancePlanLinkVersionAndOwnership(t *testing.T) {
	app, a, l, _, _ := financeTestSetup(t)
	plan, err := saveFinancePlan(app, a, l, "", financePlanInput{Name: "Utilities", Type: "bill", Amount: "0", Currency: "CNY", Category: "builtin:utilities", Unit: "month", Interval: 1, NextDue: "2026-10-15", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	transaction := financeTestPost(t, app, a, l, "", "expense", "180")
	action := financePlanAction{DueOn: plan.NextDue, Version: plan.Version, Action: "link", TransactionID: transaction.ID, TransactionVersion: transaction.Version}
	wrong := action
	wrong.Version++
	if _, err := settleFinancePlan(app, a, l, plan.ID, wrong); err == nil {
		t.Fatal("stale plan accepted")
	}
	other, _ := createRouteTestUser(t, app, "plan-other")
	otherLedger, _ := ensureDefaultLedger(app, other.Id)
	if _, err := settleFinancePlan(app, financeActor{User: other.Id}, otherLedger.Id, plan.ID, action); err == nil {
		t.Fatal("cross-user payment accepted")
	}
	paid, err := settleFinancePlan(app, a, l, plan.ID, action)
	if err != nil || paid.TransactionID != transaction.ID {
		t.Fatal(err)
	}
	count, _ := app.CountRecords("transactions", dbx.HashExp{"user": a.User})
	if count != 1 {
		t.Fatal("link created a new expense")
	}
	second, err := saveFinancePlan(app, a, l, "", financePlanInput{Name: "Other", Type: "other", Amount: "180", Currency: "CNY", Category: "builtin:utilities", Unit: "month", Interval: 1, NextDue: "2026-10-15", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	action.Version = second.Version
	if _, err := settleFinancePlan(app, a, l, second.ID, action); err == nil {
		t.Fatal("one expense linked to two plans")
	}
}
func TestFinanceForeignCurrencySavedAmounts(t *testing.T) {
	app, a, l, _, _ := financeTestSetup(t)
	user, token := createRouteTestUser(t, app, "fx-report")
	ledger, _ := ensureDefaultLedger(app, user.Id)
	a.User = user.Id
	l = ledger.Id
	input := financeTransactionInput{Kind: "expense", Amount: "20", Currency: "USD", CNYAmount: "146.8", OccurredOn: "2026-10-11", Category: "builtin:work", Merchant: "Tool"}
	if _, err := saveFinanceTransaction(app, a, l, "", "test", input); err != nil {
		t.Fatal(err)
	}
	input.CNYAmount = ""
	if _, err := saveFinanceTransaction(app, a, l, "", "test", input); err == nil {
		t.Fatal("foreign expense without conversion accepted")
	}
	response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/reports/summary?from=2026-10-01&to=2026-10-31", "", token)
	data := decodeAPISuccessDataForTest[struct {
		CNYTotals struct {
			Expense   string            `json:"grossExpense"`
			Merchants map[string]string `json:"merchants"`
		} `json:"cnyTotals"`
		Unconverted []string `json:"unconvertedCurrencies"`
	}](t, response.Body.Bytes())
	if data.CNYTotals.Expense != "146.8" || data.CNYTotals.Merchants["Tool"] != "146.8" || len(data.Unconverted) != 0 {
		t.Fatalf("wrong fixed total: %+v", data)
	}
	snapshot, err := exportFinanceSnapshot(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Transactions[0].Currency != "USD" || snapshot.Transactions[0].Amount != "20" || snapshot.Transactions[0].CNYAmount != "146.8" {
		t.Fatal("original or saved amount lost")
	}
	target, _ := createRouteTestUser(t, app, "fx-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
}
func TestFinanceSubscriptionPlanSync(t *testing.T) {
	app, a, l, _, _ := financeTestSetup(t)
	s := createRouteTestSubscription(t, app, a.User, map[string]interface{}{"name": "Video", "price": "59", "currency": "CNY", "billingCycle": "monthly", "nextBillingDate": "2026-10-15", "status": "trial", "autoRenew": true})
	if err := syncFinanceSubscriptionPlans(app, a.User, l); err != nil {
		t.Fatal(err)
	}
	p, err := app.FindFirstRecordByFilter("finance_plans", "user = {:user} && subscriptionId = {:id}", dbx.Params{"user": a.User, "id": s.Id})
	if err != nil {
		t.Fatal(err)
	}
	action := financePlanAction{DueOn: "2026-10-15", Version: p.GetInt("version"), Action: "pay", Transaction: financeTransactionInput{Kind: "expense", Amount: "59", Currency: "CNY", Category: "builtin:entertainment", OccurredOn: "2026-10-18"}}
	if _, err := settleFinancePlan(app, a, l, p.Id, action); err != nil {
		t.Fatal(err)
	}
	s, _ = app.FindRecordById("subscriptions", s.Id)
	if s.GetString("nextBillingDate") != "2026-11-15" || s.GetString("billingCycle") != "monthly" || s.GetString("status") != "active" {
		t.Fatal(s.GetString("nextBillingDate"))
	}
	s.Set("price", "69")
	s.Set("status", "paused")
	if err := app.Save(s); err != nil {
		t.Fatal(err)
	}
	if err := syncFinanceSubscriptionPlans(app, a.User, l); err != nil {
		t.Fatal(err)
	}
	p, _ = app.FindRecordById("finance_plans", p.Id)
	if p.GetString("amount") != "69" || p.GetString("status") != "paused" {
		t.Fatal("subscription changes not synchronized")
	}
	action.DueOn = "2026-11-15"
	action.Version = p.GetInt("version")
	if _, err := settleFinancePlan(app, a, l, p.Id, action); err == nil {
		t.Fatal("paused plan accepted")
	}
	snapshot, err := exportFinanceSnapshot(app, a.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "service-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Plans) != 1 || restored.Plans[0].SubscriptionID == "" || len(restored.Payments) != 1 {
		t.Fatalf("subscription restore: %v %+v", err, restored)
	}
	if err := app.Delete(target); err != nil {
		t.Fatalf("delete restored user: %v", err)
	}
}
func TestFinanceCalendarAnchors(t *testing.T) {
	for _, test := range []struct {
		date, unit       string
		interval, anchor int
		want             string
	}{{"2026-01-31", "month", 1, 31, "2026-02-28"}, {"2026-02-28", "month", 1, 31, "2026-03-31"}, {"2024-02-29", "year", 1, 29, "2025-02-28"}, {"2026-12-31", "week", 1, 31, "2027-01-07"}} {
		if got := nextFinanceDue(test.date, test.unit, test.interval, test.anchor); got != test.want {
			t.Fatalf("%+v got %s", test, got)
		}
	}
}

func TestFinanceRestoreDuplicateSubscriptionNames(t *testing.T) {
	app, a, _, _, _ := financeTestSetup(t)
	for _, price := range []string{"29", "39"} {
		createRouteTestSubscription(t, app, a.User, map[string]interface{}{"name": "Video", "price": price, "currency": "CNY", "billingCycle": "monthly", "nextBillingDate": "2026-10-15", "status": "active"})
	}
	snapshot, err := exportFinanceSnapshot(app, a.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "duplicate-name-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Plans) != 2 || restored.Plans[0].SubscriptionID == restored.Plans[1].SubscriptionID {
		t.Fatalf("duplicate service names lost independent links: %v %+v", err, restored)
	}
}
