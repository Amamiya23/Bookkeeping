package main

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

var financeCollections = []string{"ledgers", "accounts", "transactions", "finance_budgets", "finance_audit", "finance_plans", "finance_payments"}

const financeAuditJSONMaxBytes = 65536

func ensureFinanceSchema(app core.App, users *core.Collection) error {
	for _, name := range financeCollections {
		// PocketBase validates self relations against an already saved collection.
		if name == "transactions" {
			if _, err := app.FindCollectionByNameOrId(name); err != nil {
				if err := ensureCollection(app, name, func(c *core.Collection) error { return nil }); err != nil {
					return err
				}
			}
		}
		if err := ensureCollection(app, name, func(c *core.Collection) error {
			// All product writes go through the transactional finance service.
			c.ListRule, c.ViewRule, c.CreateRule, c.UpdateRule, c.DeleteRule = nil, nil, nil, nil, nil
			fields := []core.Field{userRelation(users)}
			if name != "ledgers" {
				fields = append(fields, &core.RelationField{Name: "ledger", CollectionId: financeCollectionID(app, "ledgers"), Required: true, MaxSelect: 1, CascadeDelete: true})
			}
			if name != "finance_audit" {
				fields = append(fields, &core.NumberField{Name: "version", OnlyInt: true, Min: types.Pointer(1.0)})
			}
			switch name {
			case "ledgers":
				fields = append(fields, &core.JSONField{Name: "categories", MaxSize: 32768})
				fields = append(fields, &core.TextField{Name: "restoredHash", Max: 64})
				fields = append(fields, &core.TextField{Name: "name", Required: true, Max: 120}, &core.TextField{Name: "baseCurrency", Required: true, Pattern: `^[A-Z]{3}$`}, &core.TextField{Name: "timeZone", Required: true, Max: 128})
				c.AddIndex("idx_ledgers_default_user", true, "user", "")
			case "accounts":
				fields = append(fields, &core.TextField{Name: "name", Required: true, Max: 120}, &core.TextField{Name: "currency", Required: true, Pattern: `^[A-Z]{3}$`}, &core.TextField{Name: "openingBalance", Required: true, Max: 24}, &core.TextField{Name: "openingDate", Required: true, Max: 10}, &core.BoolField{Name: "archived"})
				c.AddIndex("idx_accounts_ledger", false, "user, ledger, id", "")
			case "transactions":
				fields = append(fields, &core.TextField{Name: "cnyAmount", Max: 24}, &core.TextField{Name: "planId", Max: 15}, &core.TextField{Name: "dueOn", Max: 10})
				for _, key := range []string{"account", "counterAccount", "refundOf"} {
					target := "accounts"
					if key == "refundOf" {
						target = "transactions"
					}
					id := financeCollectionID(app, target)
					if target == "transactions" {
						id = c.Id
					}
					fields = append(fields, &core.RelationField{Name: key, CollectionId: id, MaxSelect: 1, CascadeDelete: true})
				}
				fields = append(fields, &core.SelectField{Name: "kind", Required: true, Values: []string{"expense", "income", "transfer", "refund"}}, &core.TextField{Name: "amount", Required: true, Max: 24}, &core.TextField{Name: "currency", Required: true, Pattern: `^[A-Z]{3}$`}, &core.TextField{Name: "occurredOn", Required: true, Max: 10}, &core.TextField{Name: "category", Max: 93}, &core.TextField{Name: "merchant", Max: 120}, &core.TextField{Name: "notes", Max: 5000}, &core.JSONField{Name: "tags", MaxSize: 16384}, &core.SelectField{Name: "status", Required: true, Values: []string{"posted", "void"}}, &core.TextField{Name: "source", Max: 32}, &core.TextField{Name: "externalSource", Max: 120}, &core.TextField{Name: "externalId", Max: 120}, &core.TextField{Name: "voidReason", Max: 500})
				c.AddIndex("idx_transactions_ledger_date", false, "user, ledger, occurredOn, id", "")
				c.AddIndex("idx_transactions_refund", false, "refundOf, status", "")
				c.AddIndex("idx_transactions_account", false, "user, ledger, account, status", "")
				c.AddIndex("idx_transactions_counter_account", false, "user, ledger, counterAccount, status", "")
				c.AddIndex("idx_transactions_external", true, "user, ledger, externalSource, externalId", "externalSource != '' AND externalId != ''")
			case "finance_budgets":
				fields = append(fields, &core.TextField{Name: "month", Required: true, Max: 7}, &core.TextField{Name: "currency", Required: true, Pattern: `^[A-Z]{3}$`}, &core.TextField{Name: "amount", Required: true, Max: 24}, &core.TextField{Name: "category", Max: 80})
				c.AddIndex("idx_finance_budget_month", true, "ledger, month, currency, category", "")
			case "finance_audit":
				fields = append(fields, &core.TextField{Name: "actor", Required: true, Max: 120}, &core.TextField{Name: "action", Required: true, Max: 80}, &core.TextField{Name: "target", Max: 120}, &core.TextField{Name: "requestId", Max: 120}, &core.TextField{Name: "sourceIP", Max: 64}, &core.JSONField{Name: "before", MaxSize: financeAuditJSONMaxBytes}, &core.JSONField{Name: "after", MaxSize: financeAuditJSONMaxBytes})
				c.AddIndex("idx_finance_audit_user", false, "user, created, id", "")
			case "finance_plans":
				fields = append(fields, &core.TextField{Name: "name", Required: true, Max: 120}, &core.TextField{Name: "type", Required: true, Max: 20}, &core.TextField{Name: "amount", Required: true, Max: 24}, &core.TextField{Name: "currency", Required: true, Pattern: `^[A-Z]{3}$`}, &core.TextField{Name: "category", Max: 93}, &core.TextField{Name: "unit", Required: true, Max: 10}, &core.NumberField{Name: "interval", OnlyInt: true}, &core.NumberField{Name: "anchorDay", OnlyInt: true}, &core.TextField{Name: "nextDue", Required: true, Max: 10}, &core.TextField{Name: "endDate", Max: 10}, &core.TextField{Name: "status", Required: true, Max: 20}, &core.TextField{Name: "subscriptionId", Max: 15}, &core.TextField{Name: "sourceSignature", Max: 64})
				c.AddIndex("idx_finance_plans_subscription", true, "user, subscriptionId", "subscriptionId != ''")
				c.AddIndex("idx_finance_plans_due", false, "user, ledger, status, nextDue", "")
			case "finance_payments":
				fields = append(fields, &core.TextField{Name: "planId", Required: true, Max: 15}, &core.TextField{Name: "dueOn", Required: true, Max: 10}, &core.TextField{Name: "transactionId", Max: 15}, &core.TextField{Name: "status", Required: true, Max: 20}, &core.TextField{Name: "reason", Max: 500})
				c.AddIndex("idx_finance_payments_occurrence", true, "user, ledger, planId, dueOn", "")
			}
			for _, field := range fields {
				if err := upsertField(c, field); err != nil {
					return err
				}
			}
			return ensureAutodates(c)
		}); err != nil {
			return err
		}
	}
	return nil
}

func financeCollectionID(app core.App, name string) string {
	c, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return ""
	}
	return c.Id
}

func ensureDefaultLedger(app core.App, userID string) (*core.Record, error) {
	var ledger *core.Record
	err := app.RunInTransaction(func(tx core.App) error {
		var err error
		ledger, err = tx.FindFirstRecordByFilter("ledgers", "user = {:user}", dbx.Params{"user": userID})
		if err == nil {
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err = tx.FindRecordById("users", userID); err != nil {
			return err
		}
		_, settings, err := settingsRecordOrDefault(tx, userID)
		if err != nil {
			return err
		}
		c, err := tx.FindCollectionByNameOrId("ledgers")
		if err != nil {
			return err
		}
		ledger = core.NewRecord(c)
		ledger.Set("user", userID)
		ledger.Set("name", "Personal")
		ledger.Set("baseCurrency", settings.DefaultCurrency)
		ledger.Set("timeZone", settings.Timezone)
		ledger.Set("version", 1)
		return tx.Save(ledger)
	})
	return ledger, err
}

func migrateDefaultFinanceLedgers(app core.App) error {
	return app.RunInTransaction(func(tx core.App) error {
		for offset := 0; ; offset += 500 {
			users, err := tx.FindRecordsByFilter("users", "id != ''", "id", 500, offset)
			if err != nil {
				return err
			}
			for _, user := range users {
				if _, err := ensureDefaultLedger(tx, user.Id); err != nil {
					return err
				}
			}
			if len(users) < 500 {
				return nil
			}
		}
	})
}
