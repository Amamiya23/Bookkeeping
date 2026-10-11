package main

import (
	"encoding/json"
	"sync"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func TestFinanceSnapshotRoundtrip(t *testing.T) {
	app, actor, ledger, cash, bank := financeTestSetup(t)
	expense := financeTestPost(t, app, actor, ledger, cash, "expense", "86")
	input := expense.financeTransactionInput
	input.Amount = "90"
	updated, err := saveFinanceTransaction(app, actor, ledger, expense.ID, "test", input)
	if err != nil {
		t.Fatal(err)
	}
	refund, err := saveFinanceTransaction(app, actor, ledger, "", "test", financeTransactionInput{Account: bank, Kind: "refund", RefundOf: updated.ID, Amount: "20", Currency: "CNY", OccurredOn: "2026-10-12"})
	if err != nil {
		t.Fatal(err)
	}
	if refund.Category != "Food" {
		t.Fatal(refund)
	}
	snapshot, err := exportFinanceSnapshot(app, actor.User)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateFinanceSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}
	target, _ := createRouteTestUser(t, app, "finance-restore-target")
	targetActor := financeActor{User: target.Id, Actor: "test", RequestID: "restore"}
	for i := 0; i < 2; i++ {
		if err := restoreFinanceSnapshot(app, targetActor, snapshot); err != nil {
			t.Fatal(err)
		}
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(restored.Accounts) != 2 || len(restored.Transactions) != 2 {
		t.Fatal("restoration duplicated data")
	}
	if restored.Ledger.ID == snapshot.Ledger.ID {
		t.Fatal("restoration reused source ledger")
	}
	var restoredExpense, restoredRefund financeTransactionDTO
	for _, r := range restored.Transactions {
		if r.Kind == "expense" {
			restoredExpense = r
		} else {
			restoredRefund = r
		}
		if r.Ledger != restored.Ledger.ID {
			t.Fatal("wrong ledger")
		}
	}
	if restoredExpense.Version != updated.Version || restoredRefund.RefundOf != restoredExpense.ID {
		t.Fatal("version/refund relation lost")
	}
	for i, a := range restored.Accounts {
		if a.Balance != snapshot.Accounts[i].Balance {
			t.Fatal("balance changed", a)
		}
	}
	// A legacy import has no finance section and must leave all existing facts.
	if err := applyImportPayload(app, target, importPayload{Source: "renewlet", Subscriptions: []importSubscription{}}, "skip", nil); err != nil {
		t.Fatal(err)
	}
	count, _ := app.CountRecords("transactions", dbx.HashExp{"user": target.Id})
	if count != 2 {
		t.Fatal(count)
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	var tampered financeSnapshot
	if err := json.Unmarshal(data, &tampered); err != nil {
		t.Fatal(err)
	}
	tampered.Transactions[0].Amount = "999"
	if err := validateFinanceSnapshot(&tampered); err == nil {
		t.Fatal("tampered snapshot accepted")
	}
	if err := restoreFinanceSnapshot(app, actor, snapshot); err == nil {
		t.Fatal("restoration overwrote live ledger")
	}
}

func TestFinanceRefundConcurrencyAndAuditAtomicity(t *testing.T) {
	app, a, l, cash, _ := financeTestSetup(t)
	expense := financeTestPost(t, app, a, l, cash, "expense", "50")
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := saveFinanceTransaction(app, a, l, "", "test", financeTransactionInput{Account: cash, Kind: "refund", Amount: "40", Currency: "CNY", OccurredOn: "2026-10-11", RefundOf: expense.ID})
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else {
			code, _ := financeErrorCode(err)
			if code != "REFUND_LIMIT_EXCEEDED" {
				t.Fatal(err)
			}
		}
	}
	if success != 1 {
		t.Fatal(success)
	}
	if financeTestBalance(t, app, a, l, cash) != "90" {
		t.Fatal("concurrent refund changed balance")
	}
	app.OnRecordCreate("finance_audit").BindFunc(func(e *core.RecordEvent) error { return financeFail("audit unavailable", 500) })
	_, err := saveFinanceTransaction(app, a, l, "", "test", financeTransactionInput{Account: cash, Kind: "income", Amount: "10", Currency: "CNY", OccurredOn: "2026-10-11"})
	if err == nil {
		t.Fatal("missing required audit accepted")
	}
	if financeTestBalance(t, app, a, l, cash) != "90" {
		t.Fatal("audit failure left posted transaction")
	}
}
