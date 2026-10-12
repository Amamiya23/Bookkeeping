package main

import (
	"database/sql"
	"errors"
	"math/big"
	"regexp"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type financeTotals struct {
	Income, Expense, Refund *big.Int
	Categories              map[string]*big.Int
	Daily                   map[string]*financeTotals
	Recurring               *big.Int
	Merchants               map[string]*big.Int
}

func newFinanceTotals() *financeTotals {
	return &financeTotals{Income: new(big.Int), Expense: new(big.Int), Refund: new(big.Int), Recurring: new(big.Int), Categories: map[string]*big.Int{}, Merchants: map[string]*big.Int{}, Daily: map[string]*financeTotals{}}
}
func (t *financeTotals) add(r *core.Record) error {
	return t.addAmount(r, r.GetString("amount"))
}
func (t *financeTotals) addAmount(r *core.Record, value string) error {
	amount, err := financeUnits(value, false)
	if err != nil {
		return err
	}
	switch r.GetString("kind") {
	case "income", "transfer", "refund":
		t.Income.Add(t.Income, amount)
	case "expense":
		if r.GetString("planId") != "" {
			t.Recurring.Add(t.Recurring, amount)
		}
		merchant := r.GetString("merchant")
		if merchant != "" {
			if t.Merchants[merchant] == nil {
				t.Merchants[merchant] = new(big.Int)
			}
			t.Merchants[merchant].Add(t.Merchants[merchant], amount)
		}
		category := r.GetString("category")
		if t.Categories[category] == nil {
			t.Categories[category] = new(big.Int)
		}
		t.Expense.Add(t.Expense, amount)
		t.Categories[category].Add(t.Categories[category], amount)
	}
	return nil
}
func (t *financeTotals) data() map[string]any {
	net := new(big.Int).Set(t.Expense)
	balance := new(big.Int).Sub(t.Income, net)
	categories := map[string]string{}
	for k, v := range t.Categories {
		categories[k] = financeDecimal(v)
	}
	daily := map[string]any{}
	merchants := map[string]string{}
	for k, v := range t.Merchants {
		merchants[k] = financeDecimal(v)
	}
	for date, totals := range t.Daily {
		daily[date] = map[string]string{"income": financeDecimal(totals.Income), "expense": financeDecimal(totals.Expense)}
	}
	return map[string]any{"income": financeDecimal(t.Income), "grossExpense": financeDecimal(t.Expense), "refunds": "0", "netExpense": financeDecimal(net), "netIncome": financeDecimal(balance), "categories": categories, "daily": daily, "recurringExpense": financeDecimal(t.Recurring), "merchants": merchants}
}

func financeDefaultDateRange(instant time.Time, timeZone string) (string, string, error) {
	loc, err := time.LoadLocation(timeZone)
	if err != nil {
		return "", "", err
	}
	today := instant.In(loc)
	return today.Format("2006-01") + "-01", today.Format("2006-01-02"), nil
}
func handleFinanceSummary(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	from, to := e.Request.URL.Query().Get("from"), e.Request.URL.Query().Get("to")
	defaultFrom, defaultTo, err := financeDefaultDateRange(time.Now().UTC(), l.GetString("timeZone"))
	if err != nil {
		return nil, err
	}
	if from == "" {
		from = defaultFrom
	}
	if to == "" {
		to = defaultTo
	}
	start, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, financeFail("INVALID_DATE_RANGE", 400)
	}
	end, err := time.Parse("2006-01-02", to)
	if err != nil || start.After(end) || end.Sub(start) > 366*24*time.Hour {
		return nil, financeFail("INVALID_DATE_RANGE", 400)
	}
	totals := map[string]*financeTotals{}
	cny := newFinanceTotals()
	missing := map[string]bool{}
	filter := "status = 'posted' && occurredOn >= {:from} && occurredOn <= {:to}"
	if group := e.Request.URL.Query().Get("group"); group == "recurring" {
		filter += " && planId != ''"
	} else if group == "daily" {
		filter += " && planId = ''"
	}
	err = app.RunInTransaction(func(tx core.App) error {
		return financeScan(tx, a.User, l.Id, filter, dbx.Params{"from": from, "to": to}, func(r *core.Record) error {
			currency := r.GetString("currency")
			if totals[currency] == nil {
				totals[currency] = newFinanceTotals()
			}
			date := r.GetString("occurredOn")
			value := r.GetString("cnyAmount")
			if currency == "CNY" {
				value = r.GetString("amount")
			}
			if value != "" {
				if cny.Daily[date] == nil {
					cny.Daily[date] = newFinanceTotals()
				}
				if err := cny.Daily[date].addAmount(r, value); err != nil {
					return err
				}
				if err := cny.addAmount(r, value); err != nil {
					return err
				}
			} else {
				missing[currency] = true
			}
			if totals[currency].Daily[date] == nil {
				totals[currency].Daily[date] = newFinanceTotals()
			}
			if err := totals[currency].Daily[date].add(r); err != nil {
				return err
			}
			return totals[currency].add(r)
		})
	})
	if err != nil {
		return nil, err
	}
	byCurrency := map[string]any{}
	unconverted := []string{}
	for currency, total := range totals {
		byCurrency[currency] = total.data()
		if missing[currency] {
			unconverted = append(unconverted, currency)
		}
	}
	if _, ok := byCurrency[l.GetString("baseCurrency")]; !ok {
		byCurrency[l.GetString("baseCurrency")] = newFinanceTotals().data()
	}
	return map[string]any{"from": from, "to": to, "timeZone": l.GetString("timeZone"), "basis": "posted-cash-flow", "baseCurrency": l.GetString("baseCurrency"), "byCurrency": byCurrency, "unconvertedCurrencies": unconverted, "cnyTotals": cny.data()}, nil
}

var financeMonthPattern = regexp.MustCompile(`^[0-9]{4}-(0[1-9]|1[0-2])$`)

type financeBudgetInput struct {
	Month    string `json:"month"`
	Currency string `json:"currency"`
	Category string `json:"category"`
	Amount   string `json:"amount"`
	Version  int    `json:"version"`
}

func handleFinanceBudgetSave(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	body, err := decodeStrictJSON[financeBudgetInput](e.Request, requestLocale(e.Request))
	if err != nil {
		return nil, financeFail("INVALID_REQUEST", 400)
	}
	amount, err := financeUnits(body.Amount, false)
	if err != nil || amount.Sign() <= 0 || !financeMonthPattern.MatchString(body.Month) || !financeCurrencyPattern.MatchString(body.Currency) || !financeTextFits(body.Category, 80) {
		return nil, financeFail("INVALID_BUDGET", 400)
	}
	body.Amount = financeDecimal(amount)
	var result any
	err = app.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindFirstRecordByFilter("finance_budgets", "user = {:user} && ledger = {:ledger} && month = {:month} && currency = {:currency} && category = {:category}", dbx.Params{"user": a.User, "ledger": l.Id, "month": body.Month, "currency": body.Currency, "category": body.Category})
		var before any
		if errors.Is(err, sql.ErrNoRows) {
			count, countErr := tx.CountRecords("finance_budgets", dbx.HashExp{"user": a.User, "ledger": l.Id})
			if countErr != nil {
				return countErr
			}
			if count >= 500 {
				return financeFail("BUDGET_LIMIT", 409)
			}
			if body.Version != 0 {
				return financeFail("VERSION_CONFLICT", 409)
			}
			r, err = financeNewRecord(tx, "finance_budgets", a.User, l.Id)
		} else if err == nil {
			if r.GetInt("version") != body.Version {
				return financeFail("VERSION_CONFLICT", 409)
			}
			before = r.PublicExport()
			r.Set("version", body.Version+1)
		}
		if err != nil {
			return err
		}
		r.Set("month", body.Month)
		r.Set("currency", body.Currency)
		r.Set("category", body.Category)
		r.Set("amount", body.Amount)
		if err := tx.Save(r); err != nil {
			return err
		}
		result = map[string]any{"id": r.Id, "month": body.Month, "currency": body.Currency, "category": body.Category, "amount": body.Amount, "version": r.GetInt("version")}
		return financeAudit(tx, a, l.Id, "budget.save", r.Id, before, result)
	})
	return result, err
}
func handleFinanceBudgetsRead(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	month := e.Request.URL.Query().Get("month")
	if !financeMonthPattern.MatchString(month) {
		return nil, financeFail("INVALID_MONTH", 400)
	}
	items := []map[string]any{}
	err := app.RunInTransaction(func(tx core.App) error {
		rows, err := tx.FindRecordsByFilter("finance_budgets", "user = {:user} && ledger = {:ledger} && month = {:month}", "id", 500, 0, dbx.Params{"user": a.User, "ledger": l.Id, "month": month})
		if err != nil {
			return err
		}
		for _, r := range rows {
			total := newFinanceTotals()
			filter := "status = 'posted' && occurredOn >= {:from} && occurredOn <= {:to} && currency = {:currency}"
			if r.GetString("category") != "" {
				filter += " && category = {:category}"
			}
			if err := financeScan(tx, a.User, l.Id, filter, dbx.Params{"from": month + "-01", "to": month + "-31", "currency": r.GetString("currency"), "category": r.GetString("category")}, total.add); err != nil {
				return err
			}
			net := new(big.Int).Sub(total.Expense, total.Refund)
			amount, err := financeUnits(r.GetString("amount"), false)
			if err != nil {
				return err
			}
			items = append(items, map[string]any{"id": r.Id, "month": month, "currency": r.GetString("currency"), "category": r.GetString("category"), "amount": r.GetString("amount"), "version": r.GetInt("version"), "spent": financeDecimal(net), "remaining": financeDecimal(new(big.Int).Sub(amount, net))})
		}
		return nil
	})
	return map[string]any{"items": items}, err
}
