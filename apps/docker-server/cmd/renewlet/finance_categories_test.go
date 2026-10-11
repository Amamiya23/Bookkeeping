package main

import (
	"reflect"
	"testing"
)

func TestFinanceCategoriesPersistenceAndRestore(t *testing.T) {
	app, actor, ledgerID, _, _ := financeTestSetup(t)
	l, err := app.FindRecordById("ledgers", ledgerID)
	if err != nil {
		t.Fatal(err)
	}
	input := financeLedger(l)
	if input.Categories == nil {
		t.Fatal("categories must encode as an array")
	}
	input.Categories = []financeCategoryDTO{{Name: "烘焙", Kind: "expense", Icon: "cookie"}, {Name: "兼职", Kind: "income", Icon: "clock"}}
	updated, err := updateFinanceLedger(app, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(updated.Categories, input.Categories) {
		t.Fatal(updated.Categories)
	}
	if _, err := updateFinanceLedger(app, actor, input); err == nil {
		t.Fatal("stale version accepted")
	}
	// Older callers omit categories when renaming a ledger; keep existing entries.
	updated.Categories = nil
	updated.Name = "Renamed"
	if _, err := updateFinanceLedger(app, actor, updated); err != nil {
		t.Fatal(err)
	}
	snapshot, err := exportFinanceSnapshot(app, actor.User)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(snapshot.Ledger.Categories, input.Categories) {
		t.Fatal("export lost categories")
	}
	target, _ := createRouteTestUser(t, app, "finance-category-target")
	if err := restoreFinanceSnapshot(app, financeActor{User: target.Id, Actor: "test"}, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := exportFinanceSnapshot(app, target.Id)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(restored.Ledger.Categories, input.Categories) {
		t.Fatal("restore lost categories")
	}
	snapshot.Ledger.Categories[0].Icon = "<svg onload=alert(1)>"
	if err := validateFinanceSnapshot(snapshot); err == nil {
		t.Fatal("invalid imported icon accepted")
	}
}

func TestFinanceCategoriesValidationAndIsolation(t *testing.T) {
	app, actor, ledgerID, _, _ := financeTestSetup(t)
	l, err := app.FindRecordById("ledgers", ledgerID)
	if err != nil {
		t.Fatal(err)
	}
	valid := financeCategoryDTO{Name: "Food", Kind: "expense", Icon: "utensils"}
	for _, categories := range [][]financeCategoryDTO{
		{{Name: "", Kind: "expense", Icon: "utensils"}}, {{Name: "builtin:meals", Kind: "expense", Icon: "utensils"}},
		{{Name: "Food", Kind: "transfer", Icon: "utensils"}}, {{Name: "Food", Kind: "expense", Icon: "external"}},
		{valid, {Name: "food", Kind: "expense", Icon: "cookie"}}, make([]financeCategoryDTO, 101),
	} {
		input := financeLedger(l)
		input.Categories = categories
		if _, err := updateFinanceLedger(app, actor, input); err == nil {
			t.Fatal("invalid categories accepted", categories)
		}
	}
	other, _ := createRouteTestUser(t, app, "finance-category-other")
	otherLedger, err := ensureDefaultLedger(app, other.Id)
	if err != nil {
		t.Fatal(err)
	}
	input := financeLedger(otherLedger)
	input.Categories = []financeCategoryDTO{valid}
	if _, err := updateFinanceLedger(app, actor, input); err == nil {
		t.Fatal("updated another user's categories")
	}
	unchanged, err := app.FindRecordById("ledgers", ledgerID)
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.GetInt("version") != 1 || len(financeLedgerCategories(unchanged)) != 0 {
		t.Fatal("failed write mutated ledger")
	}
}
