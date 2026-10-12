package main

import (
	"database/sql"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type financeError struct {
	Code   string
	Status int
}

func (e *financeError) Error() string           { return e.Code }
func financeFail(code string, status int) error { return &financeError{code, status} }

type financeActor struct{ User, Actor, RequestID, SourceIP string }
type financeLedgerDTO struct {
	ID           string               `json:"id"`
	Name         string               `json:"name"`
	BaseCurrency string               `json:"baseCurrency"`
	TimeZone     string               `json:"timeZone"`
	Categories   []financeCategoryDTO `json:"categories"`
	Version      int                  `json:"version"`
}
type financeAccountInput struct {
	Name           string `json:"name"`
	Currency       string `json:"currency"`
	OpeningBalance string `json:"openingBalance"`
	OpeningDate    string `json:"openingDate"`
	Archived       bool   `json:"archived"`
	Version        int    `json:"version"`
}
type financeAccountDTO struct {
	ID     string `json:"id"`
	Ledger string `json:"ledger"`
	financeAccountInput
	Balance string `json:"balance"`
}
type financeTransactionInput struct {
	Kind           string   `json:"kind"`
	Amount         string   `json:"amount"`
	Currency       string   `json:"currency"`
	Account        string   `json:"account"`
	CounterAccount string   `json:"counterAccount"`
	OccurredOn     string   `json:"occurredOn"`
	Category       string   `json:"category"`
	Merchant       string   `json:"merchant"`
	Tags           []string `json:"tags"`
	Notes          string   `json:"notes"`
	RefundOf       string   `json:"refundOf"`
	ExternalSource string   `json:"externalSource"`
	ExternalID     string   `json:"externalId"`
	Version        int      `json:"version"`
	CNYAmount      string   `json:"cnyAmount"`
}
type financeTransactionDTO struct {
	ID     string `json:"id"`
	Ledger string `json:"ledger"`
	financeTransactionInput
	Status     string `json:"status"`
	Source     string `json:"source"`
	VoidReason string `json:"voidReason"`
	Created    string `json:"created"`
	PlanID     string `json:"planId"`
	DueOn      string `json:"dueOn"`
}

func financeOwned(app core.App, collection, user, ledger, id string) (*core.Record, error) {
	r, err := app.FindFirstRecordByFilter(collection, "id = {:id} && user = {:user} && ledger = {:ledger}", dbx.Params{"id": id, "user": user, "ledger": ledger})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, financeFail("NOT_FOUND", 404)
		}
		return nil, err
	}
	return r, nil
}
func financeNewRecord(app core.App, collection, user, ledger string) (*core.Record, error) {
	if ledger != "" {
		if _, err := app.FindFirstRecordByFilter("ledgers", "id = {:id} && user = {:user}", dbx.Params{"id": ledger, "user": user}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, financeFail("NOT_FOUND", 404)
			}
			return nil, err
		}
	}
	c, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(c)
	r.Set("user", user)
	r.Set("ledger", ledger)
	r.Set("version", 1)
	return r, nil
}
func financeAudit(app core.App, actor financeActor, ledger, action, target string, before, after any) error {
	r, err := financeNewRecord(app, "finance_audit", actor.User, ledger)
	if err != nil {
		return err
	}
	r.Set("actor", actor.Actor)
	r.Set("action", action)
	r.Set("target", target)
	r.Set("requestId", actor.RequestID)
	r.Set("sourceIP", actor.SourceIP)
	r.Set("before", before)
	r.Set("after", after)
	return app.Save(r)
}
func financeLedger(r *core.Record) financeLedgerDTO {
	return financeLedgerDTO{ID: r.Id, Name: r.GetString("name"), BaseCurrency: r.GetString("baseCurrency"), TimeZone: r.GetString("timeZone"), Categories: financeLedgerCategories(r), Version: r.GetInt("version")}
}
func financeAccount(r *core.Record, balance string) financeAccountDTO {
	return financeAccountDTO{ID: r.Id, Ledger: r.GetString("ledger"), Balance: balance, financeAccountInput: financeAccountInput{Name: r.GetString("name"), Currency: r.GetString("currency"), OpeningBalance: r.GetString("openingBalance"), OpeningDate: r.GetString("openingDate"), Archived: r.GetBool("archived"), Version: r.GetInt("version")}}
}
func financeTransaction(r *core.Record) financeTransactionDTO {
	tags := r.GetStringSlice("tags")
	if tags == nil {
		tags = []string{}
	}
	return financeTransactionDTO{PlanID: r.GetString("planId"), DueOn: r.GetString("dueOn"), ID: r.Id, Ledger: r.GetString("ledger"), Status: r.GetString("status"), Source: r.GetString("source"), VoidReason: r.GetString("voidReason"), Created: recordTimeString(r, "created"), financeTransactionInput: financeTransactionInput{Kind: r.GetString("kind"), Amount: r.GetString("amount"), Currency: r.GetString("currency"), Account: r.GetString("account"), CounterAccount: r.GetString("counterAccount"), OccurredOn: r.GetString("occurredOn"), Category: r.GetString("category"), Merchant: r.GetString("merchant"), Tags: tags, Notes: r.GetString("notes"), RefundOf: r.GetString("refundOf"), ExternalSource: r.GetString("externalSource"), ExternalID: r.GetString("externalId"), CNYAmount: r.GetString("cnyAmount"), Version: r.GetInt("version")}}
}

// Iteration is bounded in memory; callers run inside a database transaction when
// several reads form one report or validation decision.
func financeScan(app core.App, user, ledger, filter string, params dbx.Params, visit func(*core.Record) error) error {
	if params == nil {
		params = dbx.Params{}
	}
	params["user"], params["ledger"] = user, ledger
	for offset := 0; ; offset += 500 {
		rows, err := app.FindRecordsByFilter("transactions", "user = {:user} && ledger = {:ledger} && ("+filter+")", "id", 500, offset, params)
		if err != nil {
			return err
		}
		for _, row := range rows {
			if err := visit(row); err != nil {
				return err
			}
		}
		if len(rows) < 500 {
			return nil
		}
	}
}
func financeBalance(app core.App, user, ledger string, account *core.Record) (string, error) {
	units, err := financeUnits(account.GetString("openingBalance"), true)
	if err != nil {
		return "", err
	}
	err = financeScan(app, user, ledger, "status = 'posted' && (account = {:account} || counterAccount = {:account})", dbx.Params{"account": account.Id}, func(r *core.Record) error {
		amount, err := financeUnits(r.GetString("amount"), false)
		if err != nil {
			return err
		}
		if r.GetString("account") == account.Id && (r.GetString("kind") == "expense" || r.GetString("kind") == "transfer") {
			units.Sub(units, amount)
		} else {
			units.Add(units, amount)
		}
		return nil
	})
	return financeDecimal(units), err
}

func saveFinanceAccount(app core.App, actor financeActor, ledger, id string, input financeAccountInput) (financeAccountDTO, error) {
	var result financeAccountDTO
	err := app.RunInTransaction(func(tx core.App) error {
		input.Name = strings.TrimSpace(input.Name)
		opening, err := financeUnits(input.OpeningBalance, true)
		if err != nil || input.Name == "" || !financeTextFits(input.Name, 120) || !financeCurrencyPattern.MatchString(input.Currency) || !isValidDateOnly(input.OpeningDate) {
			return financeFail("INVALID_ACCOUNT", 400)
		}
		input.OpeningBalance = financeDecimal(opening)
		var r *core.Record
		var before any
		if id == "" {
			if input.Version != 0 || input.Archived {
				return financeFail("INVALID_ACCOUNT", 400)
			}
			count, countErr := tx.CountRecords("accounts", dbx.HashExp{"user": actor.User, "ledger": ledger})
			if countErr != nil {
				return countErr
			}
			if count >= 500 {
				return financeFail("ACCOUNT_LIMIT", 409)
			}
			r, err = financeNewRecord(tx, "accounts", actor.User, ledger)
		} else {
			r, err = financeOwned(tx, "accounts", actor.User, ledger, id)
			if err != nil {
				return err
			}
			if r.GetInt("version") != input.Version {
				return financeFail("VERSION_CONFLICT", 409)
			}
			before = financeAccount(r, "")
			count, err := tx.CountRecords("transactions", dbx.HashExp{"user": actor.User, "ledger": ledger}, dbx.Or(dbx.HashExp{"account": id}, dbx.HashExp{"counterAccount": id}))
			if err != nil {
				return err
			}
			if count > 0 && input.Currency != r.GetString("currency") {
				return financeFail("ACCOUNT_CURRENCY_LOCKED", 409)
			}
			var invalidDate bool
			if err := financeScan(tx, actor.User, ledger, "account = {:account} || counterAccount = {:account}", dbx.Params{"account": id}, func(t *core.Record) error {
				if t.GetString("occurredOn") < input.OpeningDate {
					invalidDate = true
				}
				return nil
			}); err != nil {
				return err
			}
			if invalidDate {
				return financeFail("BEFORE_OPENING_DATE", 409)
			}
			r.Set("version", input.Version+1)
		}
		if err != nil {
			return err
		}
		r.Set("name", input.Name)
		r.Set("currency", input.Currency)
		r.Set("openingBalance", input.OpeningBalance)
		r.Set("openingDate", input.OpeningDate)
		r.Set("archived", input.Archived)
		if err := tx.Save(r); err != nil {
			return err
		}
		balance, err := financeBalance(tx, actor.User, ledger, r)
		if err != nil {
			return err
		}
		result = financeAccount(r, balance)
		return financeAudit(tx, actor, ledger, "account.save", r.Id, before, result)
	})
	return result, err
}

func validateFinanceTransaction(app core.App, user, ledger, id string, input *financeTransactionInput) error {
	amount, err := financeUnits(input.Amount, false)
	if err != nil || amount.Sign() <= 0 {
		return financeFail("INVALID_AMOUNT", 400)
	}
	input.Amount = financeDecimal(amount)
	if input.Currency == "CNY" {
		input.CNYAmount = input.Amount
	} else if input.CNYAmount != "" {
		converted, err := financeUnits(input.CNYAmount, false)
		if err != nil || converted.Sign() <= 0 {
			return financeFail("INVALID_CNY_AMOUNT", 400)
		}
		input.CNYAmount = financeDecimal(converted)
	}
	if !isValidDateOnly(input.OccurredOn) || !financeCurrencyPattern.MatchString(input.Currency) || !financeTextFits(input.Category, 80) || !financeTextFits(input.Merchant, 120) || !financeTextFits(input.Notes, 5000) || len(input.Tags) > 50 || !financeTextFits(input.ExternalSource, 120) || !financeTextFits(input.ExternalID, 120) {
		return financeFail("INVALID_TRANSACTION", 400)
	}
	for _, tag := range input.Tags {
		if strings.TrimSpace(tag) == "" || !financeTextFits(tag, 40) {
			return financeFail("INVALID_TAG", 400)
		}
	}
	if input.Tags == nil {
		input.Tags = []string{}
	}
	if (input.ExternalSource == "") != (input.ExternalID == "") {
		return financeFail("INVALID_EXTERNAL_REFERENCE", 400)
	}
	// New cash-flow records have no funding account. Account-backed records
	// remain valid for older clients and backups.
	if input.Account == "" {
		if (input.Kind != "income" && input.Kind != "expense") || input.CounterAccount != "" || input.RefundOf != "" {
			return financeFail("INVALID_TRANSACTION", 400)
		}
		return nil
	}
	account, err := financeOwned(app, "accounts", user, ledger, input.Account)
	if err != nil {
		return err
	}
	if account.GetBool("archived") {
		return financeFail("ACCOUNT_ARCHIVED", 409)
	}
	if account.GetString("currency") != input.Currency {
		return financeFail("CURRENCY_MISMATCH", 400)
	}
	if input.OccurredOn < account.GetString("openingDate") {
		return financeFail("BEFORE_OPENING_DATE", 400)
	}
	if input.Kind == "transfer" {
		if input.CounterAccount == input.Account || input.CounterAccount == "" {
			return financeFail("INVALID_TRANSFER", 400)
		}
		counter, err := financeOwned(app, "accounts", user, ledger, input.CounterAccount)
		if err != nil {
			return err
		}
		if counter.GetBool("archived") {
			return financeFail("ACCOUNT_ARCHIVED", 409)
		}
		if counter.GetString("currency") != input.Currency {
			return financeFail("CURRENCY_MISMATCH", 400)
		}
		if input.OccurredOn < counter.GetString("openingDate") {
			return financeFail("BEFORE_OPENING_DATE", 400)
		}
	} else if input.CounterAccount != "" {
		return financeFail("INVALID_TRANSFER", 400)
	}
	if input.Kind == "refund" {
		original, err := financeOwned(app, "transactions", user, ledger, input.RefundOf)
		if err != nil {
			return err
		}
		if original.GetString("kind") != "expense" || original.GetString("status") != "posted" || original.Id == id {
			return financeFail("INVALID_REFUND", 400)
		}
		if original.GetString("currency") != input.Currency || input.OccurredOn < original.GetString("occurredOn") {
			return financeFail("INVALID_REFUND", 400)
		}
		// Refunds can return to another active account in the same currency.
		input.Category = original.GetString("category")
		total := new(big.Int).Set(amount)
		if err := financeScan(app, user, ledger, "refundOf = {:original} && status = 'posted' && id != {:id}", dbx.Params{"original": original.Id, "id": id}, func(r *core.Record) error {
			v, err := financeUnits(r.GetString("amount"), false)
			if err != nil {
				return err
			}
			total.Add(total, v)
			return nil
		}); err != nil {
			return err
		}
		limit, err := financeUnits(original.GetString("amount"), false)
		if err != nil {
			return err
		}
		if total.Cmp(limit) > 0 {
			return financeFail("REFUND_LIMIT_EXCEEDED", 409)
		}
	} else if input.RefundOf != "" {
		return financeFail("INVALID_REFUND", 400)
	}
	switch input.Kind {
	case "expense", "income", "transfer", "refund":
	default:
		return financeFail("INVALID_KIND", 400)
	}
	return nil
}

func saveFinanceTransaction(app core.App, actor financeActor, ledger, id, source string, input financeTransactionInput) (financeTransactionDTO, error) {
	var result financeTransactionDTO
	err := app.RunInTransaction(func(tx core.App) error {
		var r *core.Record
		var before any
		var err error
		if id == "" {
			if input.Version != 0 {
				return financeFail("VERSION_CONFLICT", 409)
			}
			r, err = financeNewRecord(tx, "transactions", actor.User, ledger)
		} else {
			r, err = financeOwned(tx, "transactions", actor.User, ledger, id)
			if err != nil {
				return err
			}
			if r.GetInt("version") != input.Version {
				return financeFail("VERSION_CONFLICT", 409)
			}
			if r.GetString("status") != "posted" {
				return financeFail("TRANSACTION_VOID", 409)
			}
			before = financeTransaction(r)
			if r.GetString("externalId") != "" && (r.GetString("externalId") != input.ExternalID || r.GetString("externalSource") != input.ExternalSource) {
				return financeFail("EXTERNAL_REFERENCE_LOCKED", 409)
			}
			if err := protectFinanceRefunds(tx, actor.User, ledger, r, &input); err != nil {
				return err
			}
			r.Set("version", input.Version+1)
		}
		if err != nil {
			return err
		}
		if err := validateFinanceTransaction(tx, actor.User, ledger, id, &input); err != nil {
			return err
		}
		if input.Account == "" && input.Currency != "CNY" && input.CNYAmount == "" {
			return financeFail("CNY_AMOUNT_REQUIRED", 400)
		}
		if r.GetString("planId") != "" && input.Kind != "expense" {
			return financeFail("INVALID_PLAN_PAYMENT", 400)
		}
		r.Set("cnyAmount", input.CNYAmount)
		if input.ExternalID != "" {
			count, err := tx.CountRecords("transactions", dbx.HashExp{"user": actor.User, "ledger": ledger, "externalSource": input.ExternalSource, "externalId": input.ExternalID}, dbx.Not(dbx.HashExp{"id": id}))
			if err != nil {
				return err
			}
			if count > 0 {
				return financeFail("EXTERNAL_REFERENCE_CONFLICT", 409)
			}
		}
		fields := map[string]any{"kind": input.Kind, "amount": input.Amount, "currency": input.Currency, "account": input.Account, "counterAccount": input.CounterAccount, "occurredOn": input.OccurredOn, "category": input.Category, "merchant": input.Merchant, "tags": input.Tags, "notes": input.Notes, "refundOf": input.RefundOf, "externalSource": input.ExternalSource, "externalId": input.ExternalID}
		for k, v := range fields {
			r.Set(k, v)
		}
		r.Set("status", "posted")
		if id == "" {
			r.Set("source", source)
		}
		if err := tx.Save(r); err != nil {
			return err
		}
		result = financeTransaction(r)
		return financeAudit(tx, actor, ledger, "transaction.save", r.Id, before, result)
	})
	return result, err
}

func protectFinanceRefunds(app core.App, user, ledger string, original *core.Record, next *financeTransactionInput) error {
	total := new(big.Int)
	if err := financeScan(app, user, ledger, "refundOf = {:id} && status = 'posted'", dbx.Params{"id": original.Id}, func(r *core.Record) error {
		v, err := financeUnits(r.GetString("amount"), false)
		if err != nil {
			return err
		}
		total.Add(total, v)
		return nil
	}); err != nil {
		return err
	}
	if total.Sign() == 0 {
		return nil
	}
	if next == nil {
		return financeFail("REFUNDS_EXIST", 409)
	}
	limit, err := financeUnits(next.Amount, false)
	if err != nil || total.Cmp(limit) > 0 || next.Kind != "expense" || next.Currency != original.GetString("currency") || next.OccurredOn != original.GetString("occurredOn") || next.Category != original.GetString("category") {
		return financeFail("REFUNDS_EXIST", 409)
	}
	return nil
}

func voidFinanceTransaction(app core.App, actor financeActor, ledger, id string, version int, reason string) (financeTransactionDTO, error) {
	var result financeTransactionDTO
	err := app.RunInTransaction(func(tx core.App) error {
		r, err := financeOwned(tx, "transactions", actor.User, ledger, id)
		if err != nil {
			return err
		}
		if r.GetInt("version") != version {
			return financeFail("VERSION_CONFLICT", 409)
		}
		if r.GetString("status") == "void" {
			result = financeTransaction(r)
			return nil
		}
		if strings.TrimSpace(reason) == "" || !financeTextFits(reason, 500) {
			return financeFail("VOID_REASON_REQUIRED", 400)
		}
		if err := protectFinanceRefunds(tx, actor.User, ledger, r, nil); err != nil {
			return err
		}
		before := financeTransaction(r)
		r.Set("status", "void")
		r.Set("voidReason", strings.TrimSpace(reason))
		r.Set("version", version+1)
		if err := tx.Save(r); err != nil {
			return err
		}
		result = financeTransaction(r)
		if err := reopenFinancePayment(tx, actor, ledger, r); err != nil {
			return err
		}
		return financeAudit(tx, actor, ledger, "transaction.void", r.Id, before, result)
	})
	return result, err
}

func updateFinanceLedger(app core.App, actor financeActor, input financeLedgerDTO) (financeLedgerDTO, error) {
	var result financeLedgerDTO
	err := app.RunInTransaction(func(tx core.App) error {
		r, err := ensureDefaultLedger(tx, actor.User)
		if err != nil {
			return err
		}
		if input.ID != "" && input.ID != r.Id {
			return financeFail("NOT_FOUND", 404)
		}
		if input.Version != r.GetInt("version") {
			return financeFail("VERSION_CONFLICT", 409)
		}
		if strings.TrimSpace(input.Name) == "" || !financeTextFits(input.Name, 120) || !financeCurrencyPattern.MatchString(input.BaseCurrency) {
			return financeFail("INVALID_LEDGER", 400)
		}
		if _, err := time.LoadLocation(input.TimeZone); err != nil {
			return financeFail("INVALID_TIMEZONE", 400)
		}
		before := financeLedger(r)
		if input.Categories != nil {
			if err := validateFinanceCategories(input.Categories); err != nil {
				return err
			}
			r.Set("categories", input.Categories)
		}
		r.Set("name", strings.TrimSpace(input.Name))
		r.Set("baseCurrency", input.BaseCurrency)
		r.Set("timeZone", input.TimeZone)
		r.Set("version", input.Version+1)
		if err := tx.Save(r); err != nil {
			return err
		}
		result = financeLedger(r)
		return financeAudit(tx, actor, r.Id, "ledger.save", r.Id, before, result)
	})
	return result, err
}

func financeErrorCode(err error) (string, int) {
	var domain *financeError
	if errors.As(err, &domain) {
		return domain.Code, domain.Status
	}
	return "INTERNAL_ERROR", 500
}
