package main

import (
	"net/http"
	"testing"
)

func TestFinanceAccountlessCashFlowAndRestore(t *testing.T) {
	app, _, _, _, _ := financeTestSetup(t)
	user, token := createRouteTestUser(t, app, "simple-finance")
	ledger, err := ensureDefaultLedger(app, user.Id)
	if err != nil {
		t.Fatal(err)
	}
	actor := financeActor{User: user.Id, Actor: "test", RequestID: "simple"}
	expense := financeTestPost(t, app, actor, ledger.Id, "", "expense", "50")
	income := financeTestPost(t, app, actor, ledger.Id, "", "income", "120")
	input := expense.financeTransactionInput
	input.Amount = "60"
	updated, err := saveFinanceTransaction(app, actor, ledger.Id, expense.ID, "test", input)
	if err != nil || updated.Account != "" {
		t.Fatalf("accountless edit failed: %v", err)
	}
	report := serveTestRequest(t, app, http.MethodGet, "/api/app/finance/reports/summary?from=2026-10-01&to=2026-10-12", "", token)
	if report.Code != 200 {
		t.Fatal(report.Body.String())
	}
	summary := decodeAPISuccessDataForTest[struct {
		ByCurrency map[string]struct {
			Income  string                       `json:"income"`
			Expense string                       `json:"grossExpense"`
			Balance string                       `json:"netIncome"`
			Daily   map[string]map[string]string `json:"daily"`
		} `json:"byCurrency"`
	}](t, report.Body.Bytes())
	totals := summary.ByCurrency["CNY"]
	if totals.Income != "120" || totals.Expense != "60" || totals.Balance != "60" || totals.Daily["2026-10-11"]["expense"] != "60" {
		t.Fatalf("incorrect cash flow: %+v", totals)
	}
	snapshot, err := exportFinanceSnapshot(app, actor.User)
	if err != nil || len(snapshot.Accounts) != 0 || len(snapshot.Transactions) != 2 {
		t.Fatalf("accountless export failed: %v", err)
	}
	target, _ := createRouteTestUser(t, app, "simple-finance-target")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil || len(restored.Transactions) != 2 || restored.Transactions[0].Account != "" {
		t.Fatalf("accountless restore failed: %v", err)
	}
	if _, err := voidFinanceTransaction(app, actor, ledger.Id, income.ID, income.Version, "duplicate"); err != nil {
		t.Fatal(err)
	}
}
