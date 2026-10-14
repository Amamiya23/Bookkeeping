package main

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/search"
)

// Subscription spending follows the plan, not an editable category. EXISTS
// avoids duplicate rows and keeps pagination independent of the plan count.
func findFinanceTransactions(app core.App, filter string, params dbx.Params, limit int, subscriptionsOnly bool) ([]*core.Record, error) {
	if !subscriptionsOnly {
		return app.FindRecordsByFilter("transactions", filter, "-occurredOn,-id", limit, 0, params)
	}
	collection, err := app.FindCollectionByNameOrId("transactions")
	if err != nil {
		return nil, err
	}
	resolver := core.NewRecordFieldResolver(app, collection, nil, true)
	expression, err := search.FilterData(filter).BuildExpr(resolver, params)
	if err != nil {
		return nil, err
	}
	query := app.RecordQuery(collection).AndWhere(expression)
	if err := resolver.UpdateQuery(query); err != nil {
		return nil, err
	}
	query.AndWhere(dbx.NewExp(`EXISTS (
  SELECT 1 FROM finance_plans AS subscription_plan
  WHERE subscription_plan.user = {:subscriptionUser}
   AND subscription_plan.ledger = {:subscriptionLedger}
   AND subscription_plan.type = 'subscription'
   AND (subscription_plan.id = transactions.planId OR (
    transactions.kind = 'refund' AND subscription_plan.id IN (
     SELECT original.planId FROM transactions AS original
     WHERE original.id = transactions.refundOf
      AND original.user = {:subscriptionUser} AND original.ledger = {:subscriptionLedger}
    )
   ))
 )`, dbx.Params{"subscriptionUser": params["user"], "subscriptionLedger": params["ledger"]}))
	query.OrderBy("transactions.occurredOn DESC", "transactions.id DESC").Limit(int64(limit))
	rows := []*core.Record{}
	if err := query.All(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}
