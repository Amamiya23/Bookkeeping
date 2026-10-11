package main

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
)

func TestFinanceDemoResetOnlyClearsDemoLedger(t *testing.T) {
	t.Setenv(demoModeEnvName, "true")
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	demo, err := demoModePolicy.EnsureUser(app)
	if err != nil {
		t.Fatal(err)
	}
	ledger, err := ensureDefaultLedger(app, demo.Id)
	if err != nil {
		t.Fatal(err)
	}
	actor := financeActor{User: demo.Id, Actor: "test", RequestID: "demo"}
	account, err := saveFinanceAccount(app, actor, ledger.Id, "", financeAccountInput{Name: "Demo cash", Currency: "CNY", OpeningBalance: "100", OpeningDate: "2026-01-01"})
	if err != nil {
		t.Fatal(err)
	}
	expense := financeTestPost(t, app, actor, ledger.Id, account.ID, "expense", "32")
	if _, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", financeTransactionInput{Account: account.ID, Kind: "refund", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-11", RefundOf: expense.ID}); err != nil {
		t.Fatal(err)
	}
	other, err := createUser(app, "Other", "other-finance-demo@example.com", "password123", "user")
	if err != nil {
		t.Fatal(err)
	}
	otherLedger, err := ensureDefaultLedger(app, other.Id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := saveFinanceAccount(app, financeActor{User: other.Id, Actor: "test", RequestID: "other"}, otherLedger.Id, "", financeAccountInput{Name: "Keep", Currency: "CNY", OpeningBalance: "50", OpeningDate: "2026-01-01"}); err != nil {
		t.Fatal(err)
	}
	if err := demoModePolicy.ResetUserData(app, demo, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	for _, collection := range []string{"accounts", "transactions", "finance_budgets", "finance_audit"} {
		count, err := app.CountRecords(collection, dbx.HashExp{"user": demo.Id})
		if err != nil || count != 0 {
			t.Fatalf("demo %s not cleared: %d %v", collection, count, err)
		}
	}
	count, err := app.CountRecords("ledgers", dbx.HashExp{"user": demo.Id})
	if err != nil || count != 1 {
		t.Fatal("default demo ledger not recreated", count, err)
	}
	count, err = app.CountRecords("accounts", dbx.HashExp{"user": other.Id})
	if err != nil || count != 1 {
		t.Fatal("other user data lost", count, err)
	}
}
