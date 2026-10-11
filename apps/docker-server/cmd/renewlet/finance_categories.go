package main

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// Category names remain compatible with existing free-text transactions. The
// built-in prefix belongs to the client catalog; custom icons are identifiers,
// never arbitrary SVG, HTML, or external URLs.
type financeCategoryDTO struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
	Icon string `json:"icon"`
}

var financeCategoryIcons = strings.Fields("utensils cookie shirt bus plane baby paw-print phone wine book-open shopping-basket house sparkles heart-pulse gift fuel gamepad-2 party-popper camera dumbbell grid-2x2 zap hand-heart washing-machine leaf coffee shopping-bag shield-check receipt briefcase-business banknote wallet clock trending-up award landmark coins laptop music bike")

func validateFinanceCategories(categories []financeCategoryDTO) error {
	if len(categories) > 100 {
		return financeFail("INVALID_CATEGORIES", 400)
	}
	seen := map[string]bool{}
	for _, category := range categories {
		key := category.Kind + ":" + strings.ToLower(category.Name)
		if category.Name == "" || category.Name != strings.TrimSpace(category.Name) || !financeTextFits(category.Name, 80) || strings.HasPrefix(category.Name, "builtin:") || (category.Kind != "expense" && category.Kind != "income") || seen[key] {
			return financeFail("INVALID_CATEGORIES", 400)
		}
		validIcon := false
		for _, icon := range financeCategoryIcons {
			if category.Icon == icon {
				validIcon = true
				break
			}
		}
		if !validIcon {
			return financeFail("INVALID_CATEGORIES", 400)
		}
		seen[key] = true
	}
	return nil
}

func financeLedgerCategories(r *core.Record) []financeCategoryDTO {
	items := []financeCategoryDTO{}
	data, err := json.Marshal(r.Get("categories"))
	if err == nil {
		_ = json.Unmarshal(data, &items)
	}
	if items == nil {
		items = []financeCategoryDTO{}
	}
	return items
}
