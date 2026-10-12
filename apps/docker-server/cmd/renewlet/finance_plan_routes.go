package main

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"math/big"
	"time"
)

func registerFinancePlanRoutes(app core.App, f *productRouteGroup) {
	f.GET("/plans", financeRoute(app, handleFinancePlans))
	f.POST("/plans", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		in, err := decodeStrictJSON[financePlanInput](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return saveFinancePlan(app, a, l.Id, "", in)
	}))
	f.PATCH("/plans/{id}", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		in, err := decodeStrictJSON[financePlanInput](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return saveFinancePlan(app, a, l.Id, e.Request.PathValue("id"), in)
	}))
	f.POST("/plans/{id}/settle", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		in, err := decodeStrictJSON[financePlanAction](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return settleFinancePlan(app, a, l.Id, e.Request.PathValue("id"), in)
	}))
}
func handleFinancePlans(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	from, to := e.Request.URL.Query().Get("from"), e.Request.URL.Query().Get("to")
	today := todayDateOnly(time.Now(), l.GetString("timeZone"))
	if from == "" {
		from = today[:7] + "-01"
	}
	if to == "" {
		d, _ := time.Parse("2006-01-02", from)
		to = d.AddDate(0, 1, -1).Format("2006-01-02")
	}
	start, err := time.Parse("2006-01-02", from)
	if err != nil {
		return nil, financeFail("INVALID_DATE_RANGE", 400)
	}
	end, err := time.Parse("2006-01-02", to)
	if err != nil || start.After(end) || end.Sub(start) > 366*24*time.Hour {
		return nil, financeFail("INVALID_DATE_RANGE", 400)
	}
	var out any
	err = app.RunInTransaction(func(tx core.App) error {
		if err := syncFinanceSubscriptionPlans(tx, a.User, l.Id); err != nil {
			return err
		}
		rows, err := tx.FindRecordsByFilter("finance_plans", "user = {:user} && ledger = {:ledger}", "nextDue,id", 1001, 0, dbx.Params{"user": a.User, "ledger": l.Id})
		if err != nil {
			return err
		}
		if len(rows) > 1000 {
			return financeFail("PLAN_LIMIT", 409)
		}
		plans := []financePlanDTO{}
		paid := map[string]*big.Int{}
		if err := financeScan(tx, a.User, l.Id, "status = 'posted' && kind = 'expense' && planId != ''", nil, func(r *core.Record) error {
			value := r.GetString("cnyAmount")
			if r.GetString("currency") == "CNY" {
				value = r.GetString("amount")
			}
			if value == "" {
				return nil
			}
			amount, err := financeUnits(value, false)
			if err != nil {
				return err
			}
			id := r.GetString("planId")
			if paid[id] == nil {
				paid[id] = new(big.Int)
			}
			paid[id].Add(paid[id], amount)
			return nil
		}); err != nil {
			return err
		}
		schedule := []map[string]string{}
		paymentRows, err := tx.FindRecordsByFilter("finance_payments", "user = {:user} && ledger = {:ledger}", "-dueOn,-id", 10001, 0, dbx.Params{"user": a.User, "ledger": l.Id})
		if err != nil {
			return err
		}
		if len(paymentRows) > 10000 {
			return financeFail("PLAN_LIMIT", 409)
		}
		settled := map[string]bool{}
		for _, payment := range paymentRows {
			if payment.GetString("status") != "pending" {
				settled[payment.GetString("planId")+":"+payment.GetString("dueOn")] = true
			}
		}
		for _, p := range rows {
			dto := financePlan(p)
			dto.PaidCNY = "0"
			if paid[p.Id] != nil {
				dto.PaidCNY = financeDecimal(paid[p.Id])
			}
			plans = append(plans, dto)
			if p.GetString("status") != "active" {
				continue
			}
			due := p.GetString("nextDue")
			last := p.GetString("endDate")
			// Include the oldest unresolved occurrence even when it precedes the selected month.
			for i := 0; i < 10000 && due <= to && (last == "" || due <= last); i++ {
				if (due >= from || i == 0) && !settled[p.Id+":"+due] {
					status := "scheduled"
					if due <= today {
						status = "pending"
					}
					schedule = append(schedule, map[string]string{"planId": p.Id, "dueOn": due, "status": status})
				}
				next := nextFinanceDue(due, p.GetString("unit"), p.GetInt("interval"), p.GetInt("anchorDay"))
				if next <= due {
					break
				}
				due = next
				if len(schedule) > 5000 {
					return financeFail("PLAN_LIMIT", 409)
				}
			}
		}
		payments := []financePaymentDTO{}
		for _, p := range paymentRows {
			payments = append(payments, financePayment(p))
		}
		out = map[string]any{"items": plans, "schedule": schedule, "payments": payments, "today": today}
		return nil
	})
	return out, err
}
