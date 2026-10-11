package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

func TestFinanceContractFixtures(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/shared/data/finance-contract-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Accounts []struct {
			Ref string `json:"ref"`
			financeAccountInput
		} `json:"accounts"`
		Transactions []struct {
			Ref string `json:"ref"`
			financeTransactionInput
		} `json:"transactions"`
		ExpectedBalances       map[string]string `json:"expectedBalances"`
		ExpectedSummary        map[string]string `json:"expectedSummary"`
		InvalidUnsignedAmounts []string          `json:"invalidUnsignedAmounts"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, _ := createRouteTestUser(t, app, "finance-fixture")
	ledger, err := ensureDefaultLedger(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	actor := financeActor{User: user.Id, Actor: "test", RequestID: "fixture"}
	accounts := map[string]string{}
	transactions := map[string]string{}
	for _, a := range fixture.Accounts {
		r, err := saveFinanceAccount(app, actor, ledger.Id, "", a.financeAccountInput)
		if err != nil {
			t.Fatal(err)
		}
		accounts[a.Ref] = r.ID
	}
	for _, item := range fixture.Transactions {
		input := item.financeTransactionInput
		input.Account = accounts[input.Account]
		input.CounterAccount = accounts[input.CounterAccount]
		input.RefundOf = transactions[input.RefundOf]
		r, err := saveFinanceTransaction(app, actor, ledger.Id, "", "test", input)
		if err != nil {
			t.Fatal(err)
		}
		transactions[item.Ref] = r.ID
	}
	for ref, want := range fixture.ExpectedBalances {
		if got := financeTestBalance(t, app, actor, ledger.Id, accounts[ref]); got != want {
			t.Fatalf("%s: got %s want %s", ref, got, want)
		}
	}
	total := newFinanceTotals()
	if err := financeScan(app, user.Id, ledger.Id, "status = 'posted'", nil, total.add); err != nil {
		t.Fatal(err)
	}
	for key, want := range fixture.ExpectedSummary {
		if got := total.data()[key]; got != want {
			t.Fatalf("%s: got %v want %s", key, got, want)
		}
	}
	for _, value := range fixture.InvalidUnsignedAmounts {
		if _, err := financeUnits(value, false); err == nil {
			t.Fatalf("accepted %s", value)
		}
	}
}

func TestFinanceOldInstanceUpgradeCreatesNoPayments(t *testing.T) {
	app := newSchemaTestApp(t)
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	if err := ensureUsersCollectionSchema(app, users); err != nil {
		t.Fatal(err)
	}
	if err := ensureSubscriptionsCollection(app, users); err != nil {
		t.Fatal(err)
	}
	user, err := createUser(app, "Legacy", "finance-legacy@example.com", "password123", "user")
	if err != nil {
		t.Fatal(err)
	}
	c, err := app.FindCollectionByNameOrId("subscriptions")
	if err != nil {
		t.Fatal(err)
	}
	subscription := core.NewRecord(c)
	for key, value := range map[string]any{"user": user.Id, "name": "Legacy subscription", "price": "68", "currency": "CNY", "category": "Software", "status": "active", "billingCycle": "monthly", "nextBillingDate": "2026-10-11", "autoRenew": true} {
		subscription.Set(key, value)
	}
	if err := app.Save(subscription); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := ensureSchema(app); err != nil {
			t.Fatal(err)
		}
	}
	count, err := app.CountRecords("transactions")
	if err != nil || count != 0 {
		t.Fatalf("upgrade fabricated payments: %d %v", count, err)
	}
	if _, err := ensureDefaultLedger(app, user.Id); err != nil {
		t.Fatal(err)
	}
	count, err = app.CountRecords("ledgers")
	if err != nil || count != 1 {
		t.Fatalf("duplicate default ledger: %d %v", count, err)
	}
	saved, err := app.FindRecordById("subscriptions", subscription.Id)
	if err != nil || saved.GetString("price") != "68" {
		t.Fatal("legacy subscription changed", err)
	}
}
