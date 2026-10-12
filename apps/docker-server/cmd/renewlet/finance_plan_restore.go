package main

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func restoreFinanceSubscriptionLink(app core.App, user string, p *core.Record) error {
	candidates, err := app.FindRecordsByFilter("subscriptions", "user = {:user} && name = {:name} && currency = {:currency} && billingCycle != 'one-time'", "id", 1000, 0, dbx.Params{"user": user, "name": p.GetString("name"), "currency": p.GetString("currency")})
	if err != nil {
		return err
	}
	var s *core.Record
	for _, candidate := range candidates {
		linked, err := app.CountRecords("finance_plans", dbx.HashExp{"user": user, "subscriptionId": candidate.Id})
		if err != nil {
			return err
		}
		if linked == 0 {
			s = candidate
			if candidate.GetString("price") == p.GetString("amount") && candidate.GetString("nextBillingDate") == p.GetString("nextDue") {
				break
			}
		}
	}
	if s == nil {
		c, err := app.FindCollectionByNameOrId("subscriptions")
		if err != nil {
			return err
		}
		s = core.NewRecord(c)
		s.Set("user", user)
		s.Set("name", p.GetString("name"))
		s.Set("price", p.GetString("amount"))
		s.Set("currency", p.GetString("currency"))
		s.Set("category", "other")
		s.Set("billingCycle", "custom")
		s.Set("customDays", p.GetInt("interval"))
		s.Set("customCycleUnit", p.GetString("unit"))
		s.Set("nextBillingDate", p.GetString("nextDue"))
		s.Set("status", p.GetString("status"))
		s.Set("reminderDays", -1)
		if err := app.Save(s); err != nil {
			return err
		}
	}
	p.Set("subscriptionId", s.Id)
	p.Set("sourceSignature", financeSubscriptionSignature(s))
	return nil
}
