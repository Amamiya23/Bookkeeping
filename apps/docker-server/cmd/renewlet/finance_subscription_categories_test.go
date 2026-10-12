package main

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
)

func TestFinanceSubscriptionCategoryPaymentHistory(t *testing.T) {
	app, a, ledger, _, _ := financeTestSetup(t)
	s := createRouteTestSubscription(t, app, a.User, map[string]interface{}{"name": "Tool", "price": "20", "currency": "CNY", "category": "productivity", "billingCycle": "monthly", "nextBillingDate": "2026-10-15", "status": "active"})
	if err := syncFinanceSubscriptionPlans(app, a.User, ledger); err != nil {
		t.Fatal(err)
	}
	p, err := app.FindFirstRecordByFilter("finance_plans", "subscriptionId = {:id}", dbx.Params{"id": s.Id})
	if err != nil {
		t.Fatal(err)
	}
	if p.GetString("category") != "subscription:productivity" {
		t.Fatal(p.GetString("category"))
	}
	// Upgrade old plans even when the source signature has not changed.
	p.Set("category", "builtin:work")
	if err := app.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := syncFinanceSubscriptionPlans(app, a.User, ledger); err != nil {
		t.Fatal(err)
	}
	p, _ = app.FindRecordById("finance_plans", p.Id)
	if p.GetString("category") != "subscription:productivity" {
		t.Fatal("legacy default not replaced")
	}
	action := financePlanAction{Action: "pay", DueOn: p.GetString("nextDue"), Version: p.GetInt("version"), Transaction: financeTransactionInput{Kind: "expense", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-15"}}
	first, err := settleFinancePlan(app, a, ledger, p.Id, action)
	if err != nil {
		t.Fatal(err)
	}
	s, _ = app.FindRecordById("subscriptions", s.Id)
	s.Set("category", "streaming")
	if err := app.Save(s); err != nil {
		t.Fatal(err)
	}
	if err := syncFinanceSubscriptionPlans(app, a.User, ledger); err != nil {
		t.Fatal(err)
	}
	p, _ = app.FindRecordById("finance_plans", p.Id)
	if p.GetString("category") != "subscription:streaming" {
		t.Fatal("new subscription category not synchronized")
	}
	old, _ := app.FindRecordById("transactions", first.TransactionID)
	if old.GetString("category") != "subscription:productivity" {
		t.Fatal("historical bill was reclassified")
	}
	action.DueOn, action.Version = p.GetString("nextDue"), p.GetInt("version")
	action.Transaction.OccurredOn = "2026-11-15"
	second, err := settleFinancePlan(app, a, ledger, p.Id, action)
	if err != nil {
		t.Fatal(err)
	}
	newBill, _ := app.FindRecordById("transactions", second.TransactionID)
	if newBill.GetString("category") != "subscription:streaming" {
		t.Fatal("new bill did not inherit category")
	}
	// Snapshot round trips preserve the category of each historical payment.
	snapshot, err := exportFinanceSnapshot(app, a.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "category-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Transactions) != 2 || restored.Transactions[0].Category != snapshot.Transactions[0].Category || restored.Transactions[1].Category != snapshot.Transactions[1].Category {
		t.Fatalf("categories lost in restore: %v %+v", err, restored)
	}
}

func TestFinanceSubscriptionCategoryFilter(t *testing.T) {
	app, _, _, _, _ := financeTestSetup(t)
	user, token := createRouteTestUser(t, app, "category-filter")
	ledger, _ := ensureDefaultLedger(app, user.Id)
	a := financeActor{User: user.Id, Actor: "test"}
	for _, category := range []string{"subscription:productivity", "subscription:streaming", "subscription:my_custom", "builtin:subscriptions", "builtin:housing", "other-subscription:fake"} {
		if _, err := saveFinanceTransaction(app, a, ledger.Id, "", "test", financeTransactionInput{Kind: "expense", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-15", Category: category}); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct {
		category string
		count    int
	}{{"subscription:", 4}, {"subscription:productivity", 1}, {"builtin:housing", 1}} {
		response := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/transactions?category="+url.QueryEscape(test.category), "", token)
		data := decodeAPISuccessDataForTest[struct {
			Items []financeTransactionDTO `json:"items"`
		}](t, response.Body.Bytes())
		if len(data.Items) != test.count {
			t.Fatalf("%s: wanted %d bills, got %+v", test.category, test.count, data)
		}
		for _, bill := range data.Items {
			if bill.PlanID != "" {
				t.Fatal("manual subscription category linked a plan")
			}
		}
	}
	if financeSubscriptionCategory("") != "subscription:other" || financeSubscriptionCategory("my_custom") != "subscription:my_custom" {
		t.Fatal("missing or custom category not preserved")
	}
}

func TestFinanceLongSubscriptionCategory(t *testing.T) {
	app, a, ledger, _, _ := financeTestSetup(t)
	category := strings.Repeat("a", 80)
	s := createRouteTestSubscription(t, app, a.User, map[string]interface{}{"name": "Custom", "price": "20", "currency": "CNY", "category": category, "billingCycle": "monthly", "nextBillingDate": "2026-10-15", "status": "active"})
	if err := syncFinanceSubscriptionPlans(app, a.User, ledger); err != nil {
		t.Fatal(err)
	}
	p, err := app.FindFirstRecordByFilter("finance_plans", "subscriptionId = {:id}", dbx.Params{"id": s.Id})
	if err != nil {
		t.Fatal(err)
	}
	paid, err := settleFinancePlan(app, a, ledger, p.Id, financePlanAction{Action: "pay", DueOn: p.GetString("nextDue"), Version: p.GetInt("version"), Transaction: financeTransactionInput{Kind: "expense", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-15"}})
	if err != nil {
		t.Fatal(err)
	}
	bill, _ := app.FindRecordById("transactions", paid.TransactionID)
	if bill.GetString("category") != "subscription:"+category {
		t.Fatal("custom category truncated")
	}
	snapshot, err := exportFinanceSnapshot(app, a.User)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "long-category-restore")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
}
