package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type financePlanInput struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
	Category string `json:"category"`
	Unit     string `json:"unit"`
	Interval int    `json:"interval"`
	NextDue  string `json:"nextDue"`
	EndDate  string `json:"endDate"`
	Status   string `json:"status"`
	Version  int    `json:"version"`
}
type financePlanDTO struct {
	PaidCNY        string `json:"paidCny"`
	ID             string `json:"id"`
	Ledger         string `json:"ledger"`
	SubscriptionID string `json:"subscriptionId"`
	AnchorDay      int    `json:"anchorDay"`
	financePlanInput
}
type financePaymentDTO struct {
	ID            string `json:"id"`
	PlanID        string `json:"planId"`
	DueOn         string `json:"dueOn"`
	TransactionID string `json:"transactionId"`
	Status        string `json:"status"`
	Reason        string `json:"reason"`
}

func financePlan(r *core.Record) financePlanDTO {
	return financePlanDTO{PaidCNY: "0", ID: r.Id, Ledger: r.GetString("ledger"), SubscriptionID: r.GetString("subscriptionId"), AnchorDay: r.GetInt("anchorDay"), financePlanInput: financePlanInput{Name: r.GetString("name"), Type: r.GetString("type"), Amount: r.GetString("amount"), Currency: r.GetString("currency"), Category: r.GetString("category"), Unit: r.GetString("unit"), Interval: r.GetInt("interval"), NextDue: r.GetString("nextDue"), EndDate: r.GetString("endDate"), Status: r.GetString("status"), Version: r.GetInt("version")}}
}
func financePayment(r *core.Record) financePaymentDTO {
	return financePaymentDTO{r.Id, r.GetString("planId"), r.GetString("dueOn"), r.GetString("transactionId"), r.GetString("status"), r.GetString("reason")}
}
func validateFinancePlan(in *financePlanInput) error {
	amount, err := financeUnits(in.Amount, false)
	if err != nil || amount.Sign() < 0 {
		return financeFail("INVALID_AMOUNT", 400)
	}
	in.Amount = financeDecimal(amount)
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || !financeTextFits(in.Name, 120) || !financeTextFits(in.Category, 80) || !financeCurrencyPattern.MatchString(in.Currency) || !isValidDateOnly(in.NextDue) || (in.EndDate != "" && (!isValidDateOnly(in.EndDate) || in.Status == "active" && in.EndDate < in.NextDue)) || in.Interval < 1 || in.Interval > 365 {
		return financeFail("INVALID_PLAN", 400)
	}
	if in.Type != "subscription" && in.Type != "bill" && in.Type != "other" {
		return financeFail("INVALID_PLAN", 400)
	}
	if in.Unit != "day" && in.Unit != "week" && in.Unit != "month" && in.Unit != "year" {
		return financeFail("INVALID_PLAN", 400)
	}
	if in.Status != "active" && in.Status != "paused" && in.Status != "cancelled" {
		return financeFail("INVALID_PLAN", 400)
	}
	return nil
}

// Month arithmetic retains the original day through short months (Jan 31 → Feb 28 → Mar 31).
func nextFinanceDue(date, unit string, interval, anchor int) string {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return ""
	}
	switch unit {
	case "day":
		d = d.AddDate(0, 0, interval)
	case "week":
		d = d.AddDate(0, 0, interval*7)
	default:
		months := interval
		if unit == "year" {
			months *= 12
		}
		first := time.Date(d.Year(), d.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
		last := first.AddDate(0, 1, -1).Day()
		if anchor < 1 {
			anchor = d.Day()
		}
		if anchor > last {
			anchor = last
		}
		d = first.AddDate(0, 0, anchor-1)
	}
	return d.Format("2006-01-02")
}
func financeSubscriptionCategory(category string) string {
	switch category {
	case "entertainment", "streaming", "music", "gaming":
		return "builtin:entertainment"
	case "education", "news_media":
		return "builtin:learning"
	case "communication":
		return "builtin:telecom"
	case "utilities":
		return "builtin:utilities"
	case "health_fitness":
		return "builtin:wellness"
	case "food_dining":
		return "builtin:meals"
	case "travel":
		return "builtin:travel"
	case "shopping":
		return "builtin:shopping"
	default:
		return "builtin:work"
	}
}
func financeSubscriptionSignature(s *core.Record) string {
	values := []any{s.GetString("name"), s.GetString("price"), s.GetString("currency"), s.GetString("billingCycle"), s.GetInt("customDays"), s.GetString("customCycleUnit"), s.GetString("nextBillingDate"), s.GetString("status"), s.GetString("category")}
	data, _ := json.Marshal(values)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// Existing services become plans from their next known due date. Past dates never imply past payments.
func syncFinanceSubscriptionPlans(app core.App, user, ledger string) error {
	return app.RunInTransaction(func(tx core.App) error {
		for offset := 0; ; offset += 500 {
			subs, err := tx.FindRecordsByFilter("subscriptions", "user = {:user}", "id", 500, offset, dbx.Params{"user": user})
			if err != nil {
				return err
			}
			for _, s := range subs {
				p, err := tx.FindFirstRecordByFilter("finance_plans", "user = {:user} && subscriptionId = {:id}", dbx.Params{"user": user, "id": s.Id})
				if s.GetString("billingCycle") == "one-time" {
					if err == nil && p.GetString("status") != "cancelled" {
						p.Set("status", "cancelled")
						p.Set("version", p.GetInt("version")+1)
						if err = tx.Save(p); err != nil {
							return err
						}
					}
					continue
				}
				fresh := errors.Is(err, sql.ErrNoRows)
				if fresh {
					p, err = financeNewRecord(tx, "finance_plans", user, ledger)
				}
				if err != nil {
					return err
				}
				signature := financeSubscriptionSignature(s)
				if !fresh && p.GetString("sourceSignature") == signature {
					continue
				}
				unit, interval := "month", 1
				switch s.GetString("billingCycle") {
				case "weekly":
					unit = "week"
				case "quarterly":
					interval = 3
				case "semi-annual":
					interval = 6
				case "annual":
					unit = "year"
				case "custom":
					unit = s.GetString("customCycleUnit")
					if unit == "" {
						unit = "day"
					}
					interval = s.GetInt("customDays")
				}
				if interval < 1 {
					interval = 1
				}
				due := s.GetString("nextBillingDate")
				if !isValidDateOnly(due) {
					continue
				}
				if fresh || p.GetString("nextDue") != due {
					day, _ := strconv.Atoi(due[8:])
					p.Set("anchorDay", day)
				}
				status := s.GetString("status")
				if status == "expired" {
					status = "cancelled"
				}
				if status != "paused" && status != "cancelled" {
					status = "active"
				}
				amount := s.GetString("price")
				if amount == "" {
					amount = "0"
				}
				p.Set("name", s.GetString("name"))
				p.Set("type", "subscription")
				p.Set("amount", amount)
				p.Set("currency", s.GetString("currency"))
				p.Set("unit", unit)
				p.Set("interval", interval)
				p.Set("nextDue", due)
				p.Set("status", status)
				p.Set("subscriptionId", s.Id)
				p.Set("sourceSignature", signature)
				if fresh {
					p.Set("category", financeSubscriptionCategory(s.GetString("category")))
				} else {
					p.Set("version", p.GetInt("version")+1)
				}
				if err := tx.Save(p); err != nil {
					return err
				}
			}
			if len(subs) < 500 {
				break
			}
		}
		plans, err := tx.FindRecordsByFilter("finance_plans", "user = {:user} && subscriptionId != '' && status != 'cancelled'", "id", 10000, 0, dbx.Params{"user": user})
		if err != nil {
			return err
		}
		for _, p := range plans {
			_, err := tx.FindFirstRecordByFilter("subscriptions", "user = {:user} && id = {:id}", dbx.Params{"user": user, "id": p.GetString("subscriptionId")})
			if errors.Is(err, sql.ErrNoRows) {
				p.Set("status", "cancelled")
				p.Set("version", p.GetInt("version")+1)
				if err = tx.Save(p); err != nil {
					return err
				}
			} else if err != nil {
				return err
			}
		}
		return nil
	})
}
func saveFinancePlan(app core.App, a financeActor, ledger, id string, in financePlanInput) (financePlanDTO, error) {
	var out financePlanDTO
	err := app.RunInTransaction(func(tx core.App) error {
		if err := validateFinancePlan(&in); err != nil {
			return err
		}
		if err := syncFinanceSubscriptionPlans(tx, a.User, ledger); err != nil {
			return err
		}
		var p *core.Record
		var before any
		var err error
		if id == "" {
			if in.Version != 0 {
				return financeFail("VERSION_CONFLICT", 409)
			}
			count, countErr := tx.CountRecords("finance_plans", dbx.HashExp{"user": a.User, "ledger": ledger})
			if countErr != nil {
				return countErr
			}
			if count >= 1000 {
				return financeFail("PLAN_LIMIT", 409)
			}
			p, err = financeNewRecord(tx, "finance_plans", a.User, ledger)
		} else {
			p, err = financeOwned(tx, "finance_plans", a.User, ledger, id)
			if err != nil {
				return err
			}
			if p.GetInt("version") != in.Version {
				return financeFail("VERSION_CONFLICT", 409)
			}
			before = financePlan(p)
			if p.GetString("subscriptionId") != "" && in.Type != "subscription" {
				return financeFail("INVALID_PLAN", 400)
			}
			p.Set("version", in.Version+1)
		}
		if err != nil {
			return err
		}
		if p.GetString("nextDue") != in.NextDue {
			day, _ := strconv.Atoi(in.NextDue[8:])
			p.Set("anchorDay", day)
		}
		fields := map[string]any{"name": in.Name, "type": in.Type, "amount": in.Amount, "currency": in.Currency, "category": in.Category, "unit": in.Unit, "interval": in.Interval, "nextDue": in.NextDue, "endDate": in.EndDate, "status": in.Status}
		for key, value := range fields {
			p.Set(key, value)
		}
		if err := syncFinancePlanToSubscription(tx, p, false); err != nil {
			return err
		}
		if err := tx.Save(p); err != nil {
			return err
		}
		out = financePlan(p)
		return financeAudit(tx, a, ledger, "plan.save", p.Id, before, out)
	})
	return out, err
}
func syncFinancePlanToSubscription(app core.App, p *core.Record, confirmedPayment bool) error {
	id := p.GetString("subscriptionId")
	if id == "" {
		return nil
	}
	s, err := app.FindFirstRecordByFilter("subscriptions", "id = {:id} && user = {:user}", dbx.Params{"id": id, "user": p.GetString("user")})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			p.Set("subscriptionId", "")
			p.Set("sourceSignature", "")
			return nil
		}
		return err
	}
	s.Set("name", p.GetString("name"))
	s.Set("price", p.GetString("amount"))
	s.Set("currency", p.GetString("currency"))
	s.Set("nextBillingDate", p.GetString("nextDue"))
	s.Set("autoCalculateNextBillingDate", false)
	status := p.GetString("status")
	if status == "active" && s.GetString("status") == "trial" && !confirmedPayment {
		status = "trial"
	}
	s.Set("status", status)
	cycle := "custom"
	switch {
	case p.GetString("unit") == "week" && p.GetInt("interval") == 1:
		cycle = "weekly"
	case p.GetString("unit") == "month" && p.GetInt("interval") == 1:
		cycle = "monthly"
	case p.GetString("unit") == "month" && p.GetInt("interval") == 3:
		cycle = "quarterly"
	case p.GetString("unit") == "month" && p.GetInt("interval") == 6:
		cycle = "semi-annual"
	case p.GetString("unit") == "year" && p.GetInt("interval") == 1:
		cycle = "annual"
	}
	s.Set("billingCycle", cycle)
	s.Set("customDays", 0)
	s.Set("customCycleUnit", "")
	if cycle == "custom" {
		s.Set("customDays", p.GetInt("interval"))
		s.Set("customCycleUnit", p.GetString("unit"))
	}
	if err := app.Save(s); err != nil {
		return err
	}
	p.Set("sourceSignature", financeSubscriptionSignature(s))
	return nil
}

type financePlanAction struct {
	DueOn              string                  `json:"dueOn"`
	Version            int                     `json:"version"`
	Action             string                  `json:"action"`
	Reason             string                  `json:"reason"`
	TransactionID      string                  `json:"transactionId"`
	TransactionVersion int                     `json:"transactionVersion"`
	Transaction        financeTransactionInput `json:"transaction"`
}

func settleFinancePlan(app core.App, a financeActor, ledger, id string, in financePlanAction) (financePaymentDTO, error) {
	var out financePaymentDTO
	err := app.RunInTransaction(func(tx core.App) error {
		if err := syncFinanceSubscriptionPlans(tx, a.User, ledger); err != nil {
			return err
		}
		p, err := financeOwned(tx, "finance_plans", a.User, ledger, id)
		if err != nil {
			return err
		}
		payment, err := tx.FindFirstRecordByFilter("finance_payments", "user = {:user} && ledger = {:ledger} && planId = {:id} && dueOn = {:due}", dbx.Params{"user": a.User, "ledger": ledger, "id": id, "due": in.DueOn})
		if err == nil && payment.GetString("status") != "pending" {
			out = financePayment(payment)
			return nil
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if p.GetInt("version") != in.Version {
			return financeFail("VERSION_CONFLICT", 409)
		}
		if p.GetString("status") != "active" || in.DueOn != p.GetString("nextDue") || !isValidDateOnly(in.DueOn) || (p.GetString("endDate") != "" && in.DueOn > p.GetString("endDate")) {
			return financeFail("INVALID_PLAN_PAYMENT", 409)
		}
		if payment == nil {
			payment, err = financeNewRecord(tx, "finance_payments", a.User, ledger)
			if err != nil {
				return err
			}
			payment.Set("planId", id)
			payment.Set("dueOn", in.DueOn)
		}
		before := financePlan(p)
		switch in.Action {
		case "skip":
			if strings.TrimSpace(in.Reason) == "" || !financeTextFits(in.Reason, 500) {
				return financeFail("VOID_REASON_REQUIRED", 400)
			}
			payment.Set("status", "skipped")
			payment.Set("reason", strings.TrimSpace(in.Reason))
		case "pay", "link":
			var record *core.Record
			if in.Action == "link" {
				record, err = financeOwned(tx, "transactions", a.User, ledger, in.TransactionID)
				if err != nil {
					return err
				}
				if record.GetInt("version") != in.TransactionVersion {
					return financeFail("VERSION_CONFLICT", 409)
				}
				if record.GetString("status") != "posted" || record.GetString("kind") != "expense" || record.GetString("planId") != "" {
					return financeFail("INVALID_PLAN_PAYMENT", 409)
				}
				record.Set("version", record.GetInt("version")+1)
			} else {
				if in.Transaction.Kind != "expense" || in.Transaction.Account != "" || in.Transaction.Version != 0 || in.Transaction.ExternalID != "" {
					return financeFail("INVALID_PLAN_PAYMENT", 400)
				}
				posted, err := saveFinanceTransaction(tx, a, ledger, "", "recurring", in.Transaction)
				if err != nil {
					return err
				}
				record, err = financeOwned(tx, "transactions", a.User, ledger, posted.ID)
				if err != nil {
					return err
				}
			}
			record.Set("planId", id)
			record.Set("dueOn", in.DueOn)
			if err := tx.Save(record); err != nil {
				return err
			}
			payment.Set("transactionId", record.Id)
			payment.Set("status", "paid")
			payment.Set("reason", "")
		default:
			return financeFail("INVALID_REQUEST", 400)
		}
		payment.Set("version", payment.GetInt("version")+1)
		if err := tx.Save(payment); err != nil {
			return err
		}
		next := nextFinanceDue(in.DueOn, p.GetString("unit"), p.GetInt("interval"), p.GetInt("anchorDay"))
		// Reopened old payments must not duplicate already settled later periods.
		for i := 0; i < 10000; i++ {
			existing, err := tx.FindFirstRecordByFilter("finance_payments", "user = {:user} && ledger = {:ledger} && planId = {:id} && dueOn = {:due} && status != 'pending'", dbx.Params{"user": a.User, "ledger": ledger, "id": id, "due": next})
			if errors.Is(err, sql.ErrNoRows) {
				break
			}
			if err != nil {
				return err
			}
			next = nextFinanceDue(existing.GetString("dueOn"), p.GetString("unit"), p.GetInt("interval"), p.GetInt("anchorDay"))
		}
		p.Set("nextDue", next)
		p.Set("version", p.GetInt("version")+1)
		if p.GetString("endDate") != "" && next > p.GetString("endDate") {
			p.Set("status", "cancelled")
		}
		if err := syncFinancePlanToSubscription(tx, p, in.Action != "skip"); err != nil {
			return err
		}
		if err := tx.Save(p); err != nil {
			return err
		}
		out = financePayment(payment)
		return financeAudit(tx, a, ledger, "plan."+in.Action, id, before, out)
	})
	return out, err
}
func reopenFinancePayment(app core.App, a financeActor, ledger string, t *core.Record) error {
	if t.GetString("planId") == "" {
		return nil
	}
	payment, err := app.FindFirstRecordByFilter("finance_payments", "user = {:user} && ledger = {:ledger} && transactionId = {:id}", dbx.Params{"user": a.User, "ledger": ledger, "id": t.Id})
	if err != nil {
		return err
	}
	payment.Set("status", "pending")
	payment.Set("transactionId", "")
	payment.Set("version", payment.GetInt("version")+1)
	if err := app.Save(payment); err != nil {
		return err
	}
	p, err := financeOwned(app, "finance_plans", a.User, ledger, payment.GetString("planId"))
	if err != nil {
		return err
	}
	completed := p.GetString("endDate") != "" && p.GetString("nextDue") > p.GetString("endDate")
	if payment.GetString("dueOn") < p.GetString("nextDue") {
		p.Set("nextDue", payment.GetString("dueOn"))
	}
	p.Set("version", p.GetInt("version")+1)
	if completed && p.GetString("nextDue") <= p.GetString("endDate") && p.GetString("status") == "cancelled" {
		p.Set("status", "active")
	}
	if err := syncFinancePlanToSubscription(app, p, false); err != nil {
		return err
	}
	return app.Save(p)
}
