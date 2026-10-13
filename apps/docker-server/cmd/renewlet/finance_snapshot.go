package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type financeAuditDTO struct {
	ID        string          `json:"id"`
	Actor     string          `json:"actor"`
	Action    string          `json:"action"`
	Target    string          `json:"target"`
	RequestID string          `json:"requestId"`
	Created   string          `json:"created"`
	Before    json.RawMessage `json:"before"`
	After     json.RawMessage `json:"after"`
}
type financeBudgetDTO struct {
	ID string `json:"id"`
	financeBudgetInput
}
type financeSnapshot struct {
	SchemaVersion int                     `json:"schemaVersion"`
	Ledger        financeLedgerDTO        `json:"ledger"`
	Accounts      []financeAccountDTO     `json:"accounts"`
	Transactions  []financeTransactionDTO `json:"transactions"`
	Budgets       []financeBudgetDTO      `json:"budgets"`
	Audit         []financeAuditDTO       `json:"audit"`
	Plans         []financePlanDTO        `json:"plans"`
	Payments      []financePaymentDTO     `json:"payments"`
}

func exportFinanceSnapshot(app core.App, user string) (*financeSnapshot, error) {
	var result *financeSnapshot
	err := app.RunInTransaction(func(tx core.App) error {
		ledger, err := ensureDefaultLedger(tx, user)
		if err != nil {
			return err
		}
		if err := syncFinanceSubscriptionPlans(tx, user, ledger.Id); err != nil {
			return err
		}
		result = &financeSnapshot{SchemaVersion: 1, Ledger: financeLedger(ledger), Accounts: []financeAccountDTO{}, Transactions: []financeTransactionDTO{}, Budgets: []financeBudgetDTO{}, Audit: []financeAuditDTO{}}
		result.Plans = []financePlanDTO{}
		result.Payments = []financePaymentDTO{}
		for _, collection := range []string{"accounts", "transactions", "finance_budgets", "finance_audit", "finance_plans", "finance_payments"} {
			count, err := tx.CountRecords(collection, dbx.HashExp{"user": user, "ledger": ledger.Id})
			if err != nil {
				return err
			}
			if count > 10000 {
				return financeFail("FINANCE_EXPORT_LIMIT", 413)
			}
			rows, err := tx.FindRecordsByFilter(collection, "user = {:user} && ledger = {:ledger}", "created,id", 10000, 0, dbx.Params{"user": user, "ledger": ledger.Id})
			if err != nil {
				return err
			}
			for _, r := range rows {
				switch collection {
				case "finance_plans":
					result.Plans = append(result.Plans, financePlan(r))
				case "finance_payments":
					result.Payments = append(result.Payments, financePayment(r))
				case "accounts":
					balance, err := financeBalance(tx, user, ledger.Id, r)
					if err != nil {
						return err
					}
					result.Accounts = append(result.Accounts, financeAccount(r, balance))
				case "transactions":
					result.Transactions = append(result.Transactions, financeTransaction(r))
				case "finance_budgets":
					result.Budgets = append(result.Budgets, financeBudgetDTO{r.Id, financeBudgetInput{r.GetString("month"), r.GetString("currency"), r.GetString("category"), r.GetString("amount"), r.GetInt("version")}})
				case "finance_audit":
					before, err := jsonBytesFromValue(r.Get("before"))
					if err != nil {
						return err
					}
					after, err := jsonBytesFromValue(r.Get("after"))
					if err != nil {
						return err
					}
					if len(before) == 0 {
						before = []byte("null")
					}
					if len(after) == 0 {
						after = []byte("null")
					}
					result.Audit = append(result.Audit, financeAuditDTO{r.Id, r.GetString("actor"), r.GetString("action"), r.GetString("target"), r.GetString("requestId"), recordTimeString(r, "created"), before, after})
				}
			}
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			return err
		}
		if int64(len(encoded)) > maxImportJSONBodyBytes {
			return financeFail("FINANCE_EXPORT_LIMIT", 413)
		}
		return nil
	})
	return result, err
}

var financeIDPattern = regexp.MustCompile(`^[a-z0-9]{15}$`)

func validateFinanceSnapshot(s *financeSnapshot) error {
	if s == nil {
		return nil
	}
	invalid := func() error { return financeFail("INVALID_FINANCE_SNAPSHOT", 400) }
	if s.Accounts == nil || s.Transactions == nil || s.Budgets == nil || s.Audit == nil {
		return invalid()
	}
	if s.SchemaVersion != 1 || !financeIDPattern.MatchString(s.Ledger.ID) || s.Ledger.Version < 1 || strings.TrimSpace(s.Ledger.Name) == "" || !financeTextFits(s.Ledger.Name, 120) || !financeCurrencyPattern.MatchString(s.Ledger.BaseCurrency) {
		return invalid()
	}
	if _, err := time.LoadLocation(s.Ledger.TimeZone); err != nil {
		return invalid()
	}
	if err := validateFinanceCategories(s.Ledger.Categories); err != nil {
		return invalid()
	}
	if len(s.Accounts) > 500 || len(s.Transactions) > 10000 || len(s.Budgets) > 500 || len(s.Audit) > 10000 || len(s.Plans) > 1000 || len(s.Payments) > 10000 {
		return financeFail("FINANCE_IMPORT_LIMIT", 413)
	}
	accounts := map[string]financeAccountDTO{}
	balances := map[string]*big.Int{}
	transactions := map[string]financeTransactionDTO{}
	refunded := map[string]*big.Int{}
	for _, a := range s.Accounts {
		units, err := financeUnits(a.OpeningBalance, true)
		if err != nil || !financeIDPattern.MatchString(a.ID) || accounts[a.ID].ID != "" || a.Ledger != s.Ledger.ID || a.Version < 1 || a.Name == "" || !financeTextFits(a.Name, 120) || !isValidDateOnly(a.OpeningDate) || !financeCurrencyPattern.MatchString(a.Currency) {
			return invalid()
		}
		accounts[a.ID] = a
		balances[a.ID] = units
	}
	external := map[string]bool{}
	plans := map[string]financePlanDTO{}
	for _, p := range s.Plans {
		in := p.financePlanInput
		if !financeIDPattern.MatchString(p.ID) || p.Ledger != s.Ledger.ID || p.Version < 1 || plans[p.ID].ID != "" || p.AnchorDay < 1 || p.AnchorDay > 31 || (p.SubscriptionID != "" && !financeIDPattern.MatchString(p.SubscriptionID)) || validateFinancePlan(&in) != nil {
			return invalid()
		}
		plans[p.ID] = p
	}
	for _, t := range s.Transactions {
		if !financeIDPattern.MatchString(t.ID) || transactions[t.ID].ID != "" || t.Ledger != s.Ledger.ID || t.Version < 1 || (t.Status != "posted" && t.Status != "void") || !isValidDateOnly(t.OccurredOn) {
			return invalid()
		}
		if _, err := time.Parse(time.RFC3339Nano, t.Created); err != nil {
			return invalid()
		}
		amount, err := financeUnits(t.Amount, false)
		if err != nil || amount.Sign() <= 0 {
			return invalid()
		}
		if t.CNYAmount != "" {
			cny, err := financeUnits(t.CNYAmount, false)
			if err != nil || cny.Sign() <= 0 || (t.Currency == "CNY" && cny.Cmp(amount) != 0) {
				return invalid()
			}
		}
		if t.PlanID != "" && (plans[t.PlanID].ID == "" || !isValidDateOnly(t.DueOn) || t.Kind != "expense") {
			return invalid()
		}
		a := accounts[t.Account]
		if !financeCurrencyPattern.MatchString(t.Currency) || (t.Account != "" && (a.ID == "" || a.Currency != t.Currency || t.OccurredOn < a.OpeningDate)) || (t.Account == "" && t.Kind != "income" && t.Kind != "expense" && t.Kind != "refund") {
			return invalid()
		}
		if !financeCategoryValueFits(t.Category) || !financeTextFits(t.Merchant, 120) || !financeTextFits(t.Notes, 5000) || len(t.Tags) > 50 || !financeTextFits(t.VoidReason, 500) || !financeTextFits(t.Source, 32) || !financeTextFits(t.ExternalID, 120) || !financeTextFits(t.ExternalSource, 120) {
			return invalid()
		}
		for _, tag := range t.Tags {
			if strings.TrimSpace(tag) == "" || !financeTextFits(tag, 40) {
				return invalid()
			}
		}
		if (t.ExternalID == "") != (t.ExternalSource == "") {
			return invalid()
		}
		if t.ExternalID != "" {
			key := t.ExternalSource + "\x00" + t.ExternalID
			if external[key] {
				return invalid()
			}
			external[key] = true
		}
		if t.Kind == "transfer" {
			b := accounts[t.CounterAccount]
			if b.ID == "" || b.ID == a.ID || b.Currency != a.Currency || t.OccurredOn < b.OpeningDate {
				return invalid()
			}
		} else if t.CounterAccount != "" {
			return invalid()
		}
		if t.Kind != "refund" && t.RefundOf != "" {
			return invalid()
		}
		switch t.Kind {
		case "income", "refund", "expense", "transfer":
		default:
			return invalid()
		}
		transactions[t.ID] = t
		if t.Status == "posted" && t.Account != "" {
			if t.Kind == "expense" || t.Kind == "transfer" {
				balances[t.Account].Sub(balances[t.Account], amount)
			} else {
				balances[t.Account].Add(balances[t.Account], amount)
			}
			if t.Kind == "transfer" {
				balances[t.CounterAccount].Add(balances[t.CounterAccount], amount)
			}
		}
	}
	seenPayments := map[string]bool{}
	seenPaymentIDs := map[string]bool{}
	for _, p := range s.Payments {
		key := p.PlanID + ":" + p.DueOn
		if !financeIDPattern.MatchString(p.ID) || seenPayments[key] || seenPaymentIDs[p.ID] || plans[p.PlanID].ID == "" || !isValidDateOnly(p.DueOn) || !financeTextFits(p.Reason, 500) {
			return invalid()
		}
		seenPayments[key], seenPaymentIDs[p.ID] = true, true
		if p.Status == "paid" {
			t := transactions[p.TransactionID]
			if t.ID == "" || t.Status != "posted" || t.PlanID != p.PlanID || t.DueOn != p.DueOn {
				return invalid()
			}
		} else if (p.Status != "skipped" && p.Status != "pending") || p.TransactionID != "" {
			return invalid()
		}
	}
	for _, t := range s.Transactions {
		if t.Kind == "refund" {
			original := transactions[t.RefundOf]
			if original.ID == "" || original.Kind != "expense" || original.Currency != t.Currency || original.Category != t.Category || original.OccurredOn > t.OccurredOn || (t.Status == "posted" && original.Status != "posted") {
				return invalid()
			}
			if t.Status == "posted" {
				if refunded[original.ID] == nil {
					refunded[original.ID] = new(big.Int)
				}
				v, _ := financeUnits(t.Amount, false)
				refunded[original.ID].Add(refunded[original.ID], v)
				limit, _ := financeUnits(original.Amount, false)
				if refunded[original.ID].Cmp(limit) > 0 {
					return invalid()
				}
			}
		}
	}
	for _, a := range s.Accounts {
		if financeDecimal(balances[a.ID]) != a.Balance {
			return invalid()
		}
	}
	budgetKeys := map[string]bool{}
	for _, b := range s.Budgets {
		units, err := financeUnits(b.Amount, false)
		key := b.Month + "|" + b.Currency + "|" + b.Category
		if err != nil || units.Sign() <= 0 || !financeIDPattern.MatchString(b.ID) || b.Version < 1 || !financeMonthPattern.MatchString(b.Month) || !financeCurrencyPattern.MatchString(b.Currency) || !financeTextFits(b.Category, 80) || budgetKeys[key] {
			return invalid()
		}
		budgetKeys[key] = true
	}
	for _, event := range s.Audit {
		if !financeIDPattern.MatchString(event.ID) || !financeTextFits(event.Actor, 120) || event.Action == "" || !financeTextFits(event.Action, 80) || !financeTextFits(event.Target, 120) || !financeTextFits(event.RequestID, 120) || len(event.Before) > financeAuditJSONMaxBytes || len(event.After) > financeAuditJSONMaxBytes {
			return invalid()
		}
		if _, err := time.Parse(time.RFC3339Nano, event.Created); err != nil {
			return invalid()
		}
	}
	return nil
}

func financeSnapshotHash(s *financeSnapshot) string {
	data, _ := json.Marshal(s)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}
func checkFinanceRestore(app core.App, user string, s *financeSnapshot) error {
	if err := validateFinanceSnapshot(s); err != nil {
		return err
	}
	if s == nil {
		return nil
	}
	l, err := ensureDefaultLedger(app, user)
	if err != nil {
		return err
	}
	if l.GetString("restoredHash") == financeSnapshotHash(s) {
		return nil
	}
	for _, name := range []string{"accounts", "transactions", "finance_budgets", "finance_plans", "finance_payments"} {
		count, err := app.CountRecords(name, dbx.HashExp{"user": user, "ledger": l.Id})
		if err != nil {
			return err
		}
		if count > 0 {
			return financeFail("FINANCE_RESTORE_REQUIRES_EMPTY_LEDGER", 409)
		}
	}
	return nil
}

// Restoration validates the entire final state before creating any rows. IDs are
// remapped into the authenticated user's ledger; source IDs never confer access.
func restoreFinanceSnapshot(app core.App, actor financeActor, s *financeSnapshot) error {
	if s == nil {
		return nil
	}
	return app.RunInTransaction(func(tx core.App) error {
		if err := checkFinanceRestore(tx, actor.User, s); err != nil {
			return err
		}
		l, err := ensureDefaultLedger(tx, actor.User)
		if err != nil {
			return err
		}
		hash := financeSnapshotHash(s)
		if l.GetString("restoredHash") == hash {
			return nil
		}
		accountIDs := map[string]string{}
		transactionIDs := map[string]string{}
		budgetIDs := map[string]string{}
		planIDs := map[string]string{}
		for _, p := range s.Plans {
			r, err := financeNewRecord(tx, "finance_plans", actor.User, l.Id)
			if err != nil {
				return err
			}
			fields := map[string]any{"name": p.Name, "type": p.Type, "amount": p.Amount, "currency": p.Currency, "category": p.Category, "unit": p.Unit, "interval": p.Interval, "nextDue": p.NextDue, "endDate": p.EndDate, "status": p.Status, "anchorDay": p.AnchorDay, "version": p.Version}
			for k, v := range fields {
				r.Set(k, v)
			}
			if p.Type == "subscription" {
				if err := restoreFinanceSubscriptionLink(tx, actor.User, r); err != nil {
					return err
				}
			}
			if err := tx.Save(r); err != nil {
				return err
			}
			planIDs[p.ID] = r.Id
		}
		for _, a := range s.Accounts {
			r, err := financeNewRecord(tx, "accounts", actor.User, l.Id)
			if err != nil {
				return err
			}
			r.Set("name", a.Name)
			r.Set("currency", a.Currency)
			r.Set("openingBalance", a.OpeningBalance)
			r.Set("openingDate", a.OpeningDate)
			r.Set("archived", a.Archived)
			r.Set("version", a.Version)
			if err := tx.Save(r); err != nil {
				return err
			}
			accountIDs[a.ID] = r.Id
		}
		// Save non-refunds first so all refund references can use real relations.
		for _, refunds := range []bool{false, true} {
			for _, t := range s.Transactions {
				if (t.Kind == "refund") != refunds {
					continue
				}
				r, err := financeNewRecord(tx, "transactions", actor.User, l.Id)
				if err != nil {
					return err
				}
				r.Set("kind", t.Kind)
				r.Set("amount", t.Amount)
				r.Set("currency", t.Currency)
				r.Set("cnyAmount", t.CNYAmount)
				r.Set("planId", planIDs[t.PlanID])
				r.Set("dueOn", t.DueOn)
				r.Set("account", accountIDs[t.Account])
				r.Set("counterAccount", accountIDs[t.CounterAccount])
				r.Set("occurredOn", t.OccurredOn)
				r.Set("category", t.Category)
				r.Set("merchant", t.Merchant)
				r.Set("tags", t.Tags)
				r.Set("notes", t.Notes)
				r.Set("refundOf", transactionIDs[t.RefundOf])
				r.Set("externalSource", t.ExternalSource)
				r.Set("externalId", t.ExternalID)
				r.Set("version", t.Version)
				r.Set("source", t.Source)
				r.Set("status", t.Status)
				r.Set("voidReason", t.VoidReason)
				r.Set("created", t.Created)
				if err := tx.Save(r); err != nil {
					return err
				}
				transactionIDs[t.ID] = r.Id
			}
		}
		for _, b := range s.Budgets {
			r, err := financeNewRecord(tx, "finance_budgets", actor.User, l.Id)
			if err != nil {
				return err
			}
			r.Set("month", b.Month)
			r.Set("currency", b.Currency)
			r.Set("category", b.Category)
			r.Set("amount", b.Amount)
			r.Set("version", b.Version)
			if err := tx.Save(r); err != nil {
				return err
			}
			budgetIDs[b.ID] = r.Id
		}
		for _, p := range s.Payments {
			r, err := financeNewRecord(tx, "finance_payments", actor.User, l.Id)
			if err != nil {
				return err
			}
			r.Set("planId", planIDs[p.PlanID])
			r.Set("dueOn", p.DueOn)
			r.Set("transactionId", transactionIDs[p.TransactionID])
			r.Set("status", p.Status)
			r.Set("reason", p.Reason)
			if err := tx.Save(r); err != nil {
				return err
			}
		}
		for _, event := range s.Audit {
			r, err := financeNewRecord(tx, "finance_audit", actor.User, l.Id)
			if err != nil {
				return err
			}
			r.Set("actor", "import:"+actor.User)
			r.Set("action", event.Action)
			target := transactionIDs[event.Target]
			if target == "" {
				target = accountIDs[event.Target]
			}
			if target == "" {
				target = budgetIDs[event.Target]
			}
			if target == "" {
				target = l.Id
			}
			r.Set("target", target)
			r.Set("requestId", "import:"+event.ID)
			r.Set("created", event.Created)
			r.Set("before", event.Before)
			r.Set("after", event.After)
			if err := tx.Save(r); err != nil {
				return err
			}
		}
		l.Set("name", s.Ledger.Name)
		l.Set("baseCurrency", s.Ledger.BaseCurrency)
		l.Set("timeZone", s.Ledger.TimeZone)
		categories := s.Ledger.Categories
		if categories == nil {
			categories = []financeCategoryDTO{}
		}
		l.Set("categories", categories)
		l.Set("version", s.Ledger.Version)
		l.Set("restoredHash", hash)
		if err := tx.Save(l); err != nil {
			return err
		}
		return financeAudit(tx, actor, l.Id, "ledger.restore", l.Id, nil, map[string]any{"sourceLedger": s.Ledger.ID, "accounts": len(s.Accounts), "transactions": len(s.Transactions), "snapshotHash": hash})
	})
}
