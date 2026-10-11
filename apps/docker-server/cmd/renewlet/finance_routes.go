package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

type financeHandler func(core.App, *core.RequestEvent, financeActor, *core.Record) (any, error)

func financeRoute(app core.App, handler financeHandler) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		e.Response.Header().Set("Cache-Control", "no-store")
		requestID := security.RandomString(24)
		e.Response.Header().Set("X-Request-ID", requestID)
		actor := financeActor{User: e.Auth.Id, Actor: "user:" + e.Auth.Id, RequestID: requestID}
		ledger, err := ensureDefaultLedger(app, actor.User)
		if err != nil {
			return financeRespondError(e, err)
		}
		data, err := handler(app, e, actor, ledger)
		if err != nil {
			return financeRespondError(e, err)
		}
		status := http.StatusOK
		if e.Request.Method == http.MethodPost && (e.Request.URL.Path == "/api/app/finance/accounts" || e.Request.URL.Path == "/api/app/finance/transactions") {
			status = http.StatusCreated
		}
		return apiSuccessJSON(e, status, data)
	}
}
func financeRespondError(e *core.RequestEvent, err error) error {
	code, status := financeErrorCode(err)
	if status == http.StatusInternalServerError {
		return e.InternalServerError(serverText(requestLocale(e.Request), "common.internalError"), err)
	}
	return apiErrorJSON(e, status, code, code, nil)
}

func registerFinanceRoutes(app core.App, auth *productRouteGroup) {
	auth.GET("/finance/capabilities", func(e *core.RequestEvent) error {
		return apiSuccessJSON(e, 200, map[string]any{"ledger": true, "subscriptionPayments": false, "automation": false, "protocolVersion": 1})
	})
	f := auth.Group("/finance")
	f.GET("/export", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		return exportFinanceSnapshot(app, a.User)
	}))
	f.POST("/restore", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSONWithLimit[financeSnapshot](e.Request, requestLocale(e.Request), maxImportJSONBodyBytes)
		if err != nil {
			return nil, financeFail("INVALID_FINANCE_SNAPSHOT", 400)
		}
		if err := restoreFinanceSnapshot(app, a, &body); err != nil {
			return nil, err
		}
		return map[string]any{"restored": true}, nil
	}))
	f.GET("/ledger", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		return financeLedger(l), nil
	}))
	f.PATCH("/ledger", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSON[financeLedgerDTO](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return updateFinanceLedger(app, a, body)
	}))
	f.GET("/accounts", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		items := []financeAccountDTO{}
		err := app.RunInTransaction(func(tx core.App) error {
			rows, err := tx.FindRecordsByFilter("accounts", "user = {:user} && ledger = {:ledger}", "created,id", 500, 0, dbx.Params{"user": a.User, "ledger": l.Id})
			if err != nil {
				return err
			}
			for _, r := range rows {
				balance, err := financeBalance(tx, a.User, l.Id, r)
				if err != nil {
					return err
				}
				items = append(items, financeAccount(r, balance))
			}
			return nil
		})
		return map[string]any{"items": items}, err
	}))
	f.POST("/accounts", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSON[financeAccountInput](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		count, err := app.CountRecords("accounts", dbx.HashExp{"user": a.User, "ledger": l.Id})
		if err != nil {
			return nil, err
		}
		if count >= 500 {
			return nil, financeFail("ACCOUNT_LIMIT", 409)
		}
		return saveFinanceAccount(app, a, l.Id, "", body)
	}))
	f.PATCH("/accounts/{id}", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSON[financeAccountInput](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return saveFinanceAccount(app, a, l.Id, e.Request.PathValue("id"), body)
	}))
	f.GET("/transactions", financeRoute(app, handleFinanceTransactionsList))
	f.GET("/transactions/{id}", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		r, err := financeOwned(app, "transactions", a.User, l.Id, e.Request.PathValue("id"))
		if err != nil {
			return nil, err
		}
		return financeTransaction(r), nil
	}))
	f.POST("/transactions", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSON[financeTransactionInput](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return saveFinanceTransaction(app, a, l.Id, "", "web", body)
	}))
	f.PATCH("/transactions/{id}", financeRoute(app, handleFinanceTransactionPatch))
	f.POST("/transactions/{id}/void", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		body, err := decodeStrictJSON[struct {
			Version int    `json:"version"`
			Reason  string `json:"reason"`
		}](e.Request, requestLocale(e.Request))
		if err != nil {
			return nil, financeFail("INVALID_REQUEST", 400)
		}
		return voidFinanceTransaction(app, a, l.Id, e.Request.PathValue("id"), body.Version, body.Reason)
	}))
	f.GET("/reports/summary", financeRoute(app, handleFinanceSummary))
	f.GET("/budgets", financeRoute(app, handleFinanceBudgetsRead))
	f.PUT("/budgets", financeRoute(app, handleFinanceBudgetSave))
	f.GET("/audit", financeRoute(app, func(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
		rows, err := app.FindRecordsByFilter("finance_audit", "user = {:user} && ledger = {:ledger}", "-created,-id", 100, 0, dbx.Params{"user": a.User, "ledger": l.Id})
		items := []map[string]any{}
		for _, r := range rows {
			items = append(items, map[string]any{"id": r.Id, "actor": r.GetString("actor"), "action": r.GetString("action"), "target": r.GetString("target"), "requestId": r.GetString("requestId"), "created": recordTimeString(r, "created"), "before": r.Get("before"), "after": r.Get("after")})
		}
		return map[string]any{"items": items}, err
	}))
}

type financeCursor struct {
	Date string `json:"date"`
	ID   string `json:"id"`
}

func handleFinanceTransactionsList(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	q := e.Request.URL.Query()
	limit, err := parsePositiveQueryInt(q.Get("limit"), 50, 1, 100)
	if err != nil {
		return nil, financeFail("INVALID_QUERY", 400)
	}
	filter := "user = {:user} && ledger = {:ledger}"
	params := dbx.Params{"user": a.User, "ledger": l.Id}
	for _, key := range []string{"account", "kind", "status", "category", "merchant", "refundOf"} {
		if value := q.Get(key); value != "" {
			if key == "account" {
				filter += " && (account = {:account} || counterAccount = {:account})"
			} else {
				filter += " && " + key + " = {:" + key + "}"
			}
			params[key] = value
		}
	}
	for _, key := range []string{"from", "to"} {
		if value := q.Get(key); value != "" {
			if !isValidDateOnly(value) {
				return nil, financeFail("INVALID_DATE_RANGE", 400)
			}
			op := ">="
			if key == "to" {
				op = "<="
			}
			filter += " && occurredOn " + op + " {:" + key + "}"
			params[key] = value
		}
	}
	if q.Get("from") != "" && q.Get("to") != "" && q.Get("from") > q.Get("to") {
		return nil, financeFail("INVALID_DATE_RANGE", 400)
	}
	if tag := q.Get("tag"); tag != "" {
		filter += " && tags ?= {:tag}"
		params["tag"] = tag
	}
	if value := q.Get("cursor"); value != "" {
		data, err := base64.RawURLEncoding.DecodeString(value)
		var cursor financeCursor
		if err != nil || len(value) > 512 {
			return nil, financeFail("INVALID_CURSOR", 400)
		}
		if err := json.Unmarshal(data, &cursor); err != nil || !isValidDateOnly(cursor.Date) || len(cursor.ID) != 15 {
			return nil, financeFail("INVALID_CURSOR", 400)
		}
		filter += " && (occurredOn < {:date} || (occurredOn = {:date} && id < {:id}))"
		params["date"], params["id"] = cursor.Date, cursor.ID
	}
	rows, err := app.FindRecordsByFilter("transactions", filter, "-occurredOn,-id", limit+1, 0, params)
	if err != nil {
		return nil, err
	}
	next := ""
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		data, _ := json.Marshal(financeCursor{last.GetString("occurredOn"), last.Id})
		next = base64.RawURLEncoding.EncodeToString(data)
	}
	items := []financeTransactionDTO{}
	for _, r := range rows {
		items = append(items, financeTransaction(r))
	}
	return map[string]any{"items": items, "nextCursor": next}, nil
}

func handleFinanceTransactionPatch(app core.App, e *core.RequestEvent, a financeActor, l *core.Record) (any, error) {
	raw, err := readLimitedJSONBody(e.Request.Body)
	if err != nil {
		return nil, financeFail("INVALID_REQUEST", 400)
	}
	var patch map[string]json.RawMessage
	if err := decodeStrictJSONBytesInto(raw, &patch, requestLocale(e.Request), false); err != nil || patch == nil {
		return nil, financeFail("INVALID_REQUEST", 400)
	}
	if _, ok := patch["version"]; !ok {
		return nil, financeFail("VERSION_REQUIRED", 400)
	}
	var result financeTransactionDTO
	err = app.RunInTransaction(func(tx core.App) error {
		r, err := financeOwned(tx, "transactions", a.User, l.Id, e.Request.PathValue("id"))
		if err != nil {
			return err
		}
		current, _ := json.Marshal(financeTransaction(r).financeTransactionInput)
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(current, &fields); err != nil {
			return err
		}
		for key, value := range patch {
			if _, ok := fields[key]; !ok || strings.TrimSpace(string(value)) == "null" {
				return financeFail("INVALID_REQUEST", 400)
			}
			fields[key] = value
		}
		merged, err := json.Marshal(fields)
		if err != nil {
			return err
		}
		var input financeTransactionInput
		if err := decodeStrictJSONBytesInto(merged, &input, requestLocale(e.Request), false); err != nil {
			return financeFail("INVALID_REQUEST", 400)
		}
		result, err = saveFinanceTransaction(tx, a, l.Id, r.Id, "web", input)
		return err
	})
	return result, err
}
