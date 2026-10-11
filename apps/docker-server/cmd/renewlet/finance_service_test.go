package main

import (
	"encoding/json"
	"math/big"
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func financeTestSetup(t *testing.T) (core.App, financeActor, string, string, string) {
	t.Helper()
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, _ := createRouteTestUser(t, app, "finance")
	l, err := ensureDefaultLedger(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	a := financeActor{User: user.Id, Actor: "test", RequestID: "test"}
	first, err := saveFinanceAccount(app, a, l.Id, "", financeAccountInput{Name: "Cash", Currency: "CNY", OpeningBalance: "100", OpeningDate: "2026-01-01"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := saveFinanceAccount(app, a, l.Id, "", financeAccountInput{Name: "Bank", Currency: "CNY", OpeningBalance: "-10", OpeningDate: "2026-01-01"})
	if err != nil {
		t.Fatal(err)
	}
	return app, a, l.Id, first.ID, second.ID
}
func financeTestPost(t *testing.T, app core.App, a financeActor, l, account, kind, amount string) financeTransactionDTO {
	t.Helper()
	r, err := saveFinanceTransaction(app, a, l, "", "test", financeTransactionInput{Account: account, Kind: kind, Amount: amount, Currency: "CNY", OccurredOn: "2026-10-11", Category: "Food"})
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func financeTestBalance(t *testing.T, app core.App, a financeActor, l, account string) string {
	t.Helper()
	r, err := financeOwned(app, "accounts", a.User, l, account)
	if err != nil {
		t.Fatal(err)
	}
	v, err := financeBalance(app, a.User, l, r)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
func TestFinanceExactMoney(t *testing.T) {
	for _, value := range []string{"1e3", "01", "-1", "0.0000001", "9223372036854775807", "1000000000.000001", "NaN", "1.", " 1", "+1"} {
		if _, err := financeUnits(value, false); err == nil {
			t.Fatalf("accepted %q", value)
		}
	}
	a, _ := financeUnits("0.1", false)
	b, _ := financeUnits("0.2", false)
	if got := financeDecimal(new(big.Int).Add(a, b)); got != "0.3" {
		t.Fatal(got)
	}
	v, _ := financeUnits("-123.000001", true)
	if financeDecimal(v) != "-123.000001" {
		t.Fatal(v)
	}
	large := new(big.Int)
	large.SetString("100000000000000000000001", 10)
	if financeDecimal(large) != "100000000000000000.000001" {
		t.Fatal(financeDecimal(large))
	}
}
func TestFinanceCashFlowAndRefundConstraints(t *testing.T) {
	app, a, l, cash, bank := financeTestSetup(t)
	financeTestPost(t, app, a, l, cash, "income", "5000")
	financeTestPost(t, app, a, l, cash, "expense", "32")
	transfer := financeTransactionInput{Account: cash, CounterAccount: bank, Kind: "transfer", Amount: "1000", Currency: "CNY", OccurredOn: "2026-10-11"}
	if _, err := saveFinanceTransaction(app, a, l, "", "test", transfer); err != nil {
		t.Fatal(err)
	}
	expense := financeTestPost(t, app, a, l, cash, "expense", "86")
	refund := financeTransactionInput{Account: bank, RefundOf: expense.ID, Kind: "refund", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-11"}
	r, err := saveFinanceTransaction(app, a, l, "", "test", refund)
	if err != nil {
		t.Fatal(err)
	}
	if r.Category != "Food" {
		t.Fatal("refund lost original category")
	}
	if got := financeTestBalance(t, app, a, l, cash); got != "3982" {
		t.Fatal(got)
	}
	if got := financeTestBalance(t, app, a, l, bank); got != "1010" {
		t.Fatal(got)
	}
	refund.Amount = "67"
	if _, err := saveFinanceTransaction(app, a, l, "", "test", refund); err == nil {
		t.Fatal("over refund accepted")
	}
	if _, err := voidFinanceTransaction(app, a, l, expense.ID, expense.Version, "wrong"); err == nil {
		t.Fatal("void with active refund accepted")
	}
	input := expense.financeTransactionInput
	input.Amount = "19"
	if _, err := saveFinanceTransaction(app, a, l, expense.ID, "test", input); err == nil {
		t.Fatal("expense below refunds accepted")
	}
	if _, err := voidFinanceTransaction(app, a, l, r.ID, r.Version, "returned in error"); err != nil {
		t.Fatal(err)
	}
	if _, err := voidFinanceTransaction(app, a, l, expense.ID, expense.Version, "wrong"); err != nil {
		t.Fatal(err)
	}
	if got := financeTestBalance(t, app, a, l, cash); got != "4068" {
		t.Fatal(got)
	}
	if got := financeTestBalance(t, app, a, l, bank); got != "990" {
		t.Fatal(got)
	}
}
func TestFinanceIsolationVersionAndRollback(t *testing.T) {
	app, a, l, cash, bank := financeTestSetup(t)
	tx := financeTestPost(t, app, a, l, cash, "expense", "0.1")
	input := tx.financeTransactionInput
	input.Amount = "0.2"
	updated, err := saveFinanceTransaction(app, a, l, tx.ID, "test", input)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 {
		t.Fatal(updated.Version)
	}
	if _, err := saveFinanceTransaction(app, a, l, tx.ID, "test", input); err == nil {
		t.Fatal("stale write accepted")
	}
	if _, err := financeOwned(app, "transactions", "other", l, tx.ID); err == nil {
		t.Fatal("cross-user read")
	}
	input = tx.financeTransactionInput
	input.Version = 0
	input.Kind = "transfer"
	input.CounterAccount = cash
	if _, err := saveFinanceTransaction(app, a, l, "", "test", input); err == nil {
		t.Fatal("self transfer accepted")
	}
	input.Account = bank
	input.CounterAccount = cash
	input.Currency = "USD"
	if _, err := saveFinanceTransaction(app, a, l, "", "test", input); err == nil {
		t.Fatal("currency mismatch")
	}
	input.Currency = "CNY"
	input.OccurredOn = "2025-12-31"
	if _, err := saveFinanceTransaction(app, a, l, "", "test", input); err == nil {
		t.Fatal("pre opening transaction accepted")
	}
	count, err := app.CountRecords("transactions", dbx.HashExp{"user": a.User})
	if err != nil || count != 1 {
		t.Fatalf("partial writes: %d %v", count, err)
	}
	// A required audit failure rolls the monetary change back.
	err = app.RunInTransaction(func(txApp core.App) error {
		if _, err := saveFinanceTransaction(txApp, a, l, "", "test", financeTransactionInput{Account: cash, Kind: "income", Amount: "20", Currency: "CNY", OccurredOn: "2026-10-11"}); err != nil {
			return err
		}
		return financeFail("injected", 500)
	})
	if err == nil || financeTestBalance(t, app, a, l, cash) != "99.8" {
		t.Fatal("rollback failed", err)
	}
}
func TestFinanceMigrationAndRoutes(t *testing.T) {
	app := newSchemaTestApp(t)
	if err := ensureSchema(app); err != nil {
		t.Fatal(err)
	}
	registerRecordHooks(app)
	user, token := createRouteTestUser(t, app, "finance-route")
	for i := 0; i < 2; i++ {
		if err := migrateDefaultFinanceLedgers(app); err != nil {
			t.Fatal(err)
		}
	}
	count, err := app.CountRecords("ledgers", dbx.HashExp{"user": user.Id})
	if err != nil || count != 1 {
		t.Fatalf("default ledger count %d %v", count, err)
	}
	create := serveTestRequest(t, app, http.MethodPost, "/api/app/finance/accounts", `{"name":"Cash","currency":"CNY","openingBalance":"0","openingDate":"2026-01-01"}`, token)
	if create.Code != 201 {
		t.Fatalf("%d %s", create.Code, create.Body.String())
	}
	account := decodeAPISuccessDataForTest[financeAccountDTO](t, create.Body.Bytes())
	payload, _ := json.Marshal(financeTransactionInput{Account: account.ID, Kind: "expense", Amount: "32", Currency: "CNY", OccurredOn: "2026-10-11"})
	post := serveTestRequest(t, app, http.MethodPost, "/api/app/finance/transactions", string(payload), token)
	if post.Code != 201 {
		t.Fatalf("%d %s", post.Code, post.Body.String())
	}
	r := decodeAPISuccessDataForTest[financeTransactionDTO](t, post.Body.Bytes())
	patch := serveTestRequest(t, app, http.MethodPatch, "/api/app/finance/transactions/"+r.ID, `{"amount":"31","version":1}`, token)
	if patch.Code != 200 {
		t.Fatalf("%d %s", patch.Code, patch.Body.String())
	}
	stale := serveTestRequest(t, app, http.MethodPatch, "/api/app/finance/transactions/"+r.ID, `{"amount":"30","version":1}`, token)
	if stale.Code != 409 {
		t.Fatal(stale.Code, stale.Body.String())
	}
	report := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/reports/summary?from=2026-10-01&to=2026-10-31", "", token)
	if report.Code != 200 {
		t.Fatal(report.Code, report.Body.String())
	}
	var summary struct {
		ByCurrency map[string]map[string]any `json:"byCurrency"`
	}
	summary = decodeAPISuccessDataForTest[struct {
		ByCurrency map[string]map[string]any `json:"byCurrency"`
	}](t, report.Body.Bytes())
	if summary.ByCurrency["CNY"]["netExpense"] != "31" {
		t.Fatal("incorrect posted report", summary)
	}
	budget := serveTestRequest(t, app, http.MethodPut, "/api/app/finance/budgets", `{"month":"2026-10","currency":"CNY","category":"","amount":"100","version":0}`, token)
	if budget.Code != 200 {
		t.Fatal(budget.Code, budget.Body.String())
	}
	budgetRead := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/budgets?month=2026-10", "", token)
	if budgetRead.Code != 200 {
		t.Fatal(budgetRead.Code, budgetRead.Body.String())
	}
	var budgetResult struct {
		Items []struct {
			Remaining string `json:"remaining"`
			Spent     string `json:"spent"`
		} `json:"items"`
	}
	budgetResult = decodeAPISuccessDataForTest[struct {
		Items []struct {
			Remaining string `json:"remaining"`
			Spent     string `json:"spent"`
		} `json:"items"`
	}](t, budgetRead.Body.Bytes())
	if len(budgetResult.Items) != 1 || budgetResult.Items[0].Remaining != "69" || budgetResult.Items[0].Spent != "31" {
		t.Fatal(budgetResult)
	}
	staleBudget := serveTestRequest(t, app, http.MethodPut, "/api/app/finance/budgets", `{"month":"2026-10","currency":"CNY","category":"","amount":"200","version":0}`, token)
	if staleBudget.Code != 409 {
		t.Fatal("budget lost version constraint", staleBudget.Body.String())
	}
	audit := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/audit", "", token)
	if audit.Code != 200 || !json.Valid(audit.Body.Bytes()) {
		t.Fatal("invalid audit JSON", audit.Code, audit.Body.String())
	}
	exported := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/export", "", token)
	if exported.Code != 200 {
		t.Fatal(exported.Code, exported.Body.String())
	}
	snapshot := decodeAPISuccessDataForTest[financeSnapshot](t, exported.Body.Bytes())
	if err := validateFinanceSnapshot(&snapshot); err != nil {
		t.Fatal(err)
	}
	for _, collection := range financeCollections {
		c, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Fatal(err)
		}
		if c.ListRule != nil || c.ViewRule != nil || c.CreateRule != nil || c.UpdateRule != nil || c.DeleteRule != nil {
			t.Fatalf("finance REST bypass: %s", collection)
		}
	}
	if serveTestRequest(t, app, http.MethodGet, "/api/app/finance/accounts", "", "").Code != 401 {
		t.Fatal("unauthenticated read")
	}
}
