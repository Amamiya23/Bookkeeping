package main

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
)

func TestFinanceDateBoundariesAndRefundMonth(t *testing.T) {
	instant, err := time.Parse(time.RFC3339, "2026-09-30T16:30:00Z")
	if err != nil {
		t.Fatal(err)
	}
	from, to, err := financeDefaultDateRange(instant, "Asia/Shanghai")
	if err != nil || from != "2026-10-01" || to != "2026-10-01" {
		t.Fatal(from, to, err)
	}
	from, to, err = financeDefaultDateRange(instant, "America/New_York")
	if err != nil || from != "2026-09-01" || to != "2026-09-30" {
		t.Fatal(from, to, err)
	}
	app, a, l, cash, bank := financeTestSetup(t)
	expense, err := saveFinanceTransaction(app, a, l, "", "test", financeTransactionInput{Account: cash, Kind: "expense", Amount: "86", Currency: "CNY", OccurredOn: "2026-09-30", Category: "Food"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = saveFinanceTransaction(app, a, l, "", "test", financeTransactionInput{Account: bank, Kind: "refund", RefundOf: expense.ID, Amount: "20", Currency: "CNY", OccurredOn: "2026-10-01"})
	if err != nil {
		t.Fatal(err)
	}
	total := newFinanceTotals()
	if err := financeScan(app, a.User, l, "status = 'posted' && occurredOn >= {:from} && occurredOn <= {:to}", dbx.Params{"from": "2026-10-01", "to": "2026-10-31"}, total.add); err != nil {
		t.Fatal(err)
	}
	if total.data()["income"] != "0" || total.data()["refunds"] != "20" || total.data()["netExpense"] != "-20" || total.data()["grossExpense"] != "0" {
		t.Fatal(total.data())
	}
	other, _ := createRouteTestUser(t, app, "finance-other-ledger")
	otherLedger, err := ensureDefaultLedger(app, other.Id)
	if err != nil {
		t.Fatal(err)
	}
	_, err = saveFinanceAccount(app, a, otherLedger.Id, "", financeAccountInput{Name: "Wrong owner", Currency: "CNY", OpeningBalance: "0", OpeningDate: "2026-01-01"})
	if err == nil {
		t.Fatal("domain service accepted another owner's ledger")
	}
}
