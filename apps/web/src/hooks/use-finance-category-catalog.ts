import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import { getDefaultCategories } from "@/types/config";
import { financeCategoryDetails, financeCategoryOptions, subscriptionFinanceCategoryOptions } from "@/lib/finance-categories";
import type { FinanceCategory } from "@renewlet/shared/schemas/finance";

export function useFinanceCategoryCatalog(categories: FinanceCategory[]) {
  const { config } = useCustomConfigState();
  const { t, locale } = useI18n();
  const defaults = getDefaultCategories();
  // Retain built-in labels for historical bills when an option is removed from settings.
  const labels = [...(config.categories ?? defaults), ...defaults.filter((item) => !config.categories?.some((own) => own.value === item.value))];
  const subscriptions = subscriptionFinanceCategoryOptions(labels, locale, t);
  const available = subscriptionFinanceCategoryOptions(config.categories ?? defaults, locale, t);
  return {
    details: (value: string, kind: string) => financeCategoryDetails(value, kind, categories, t, subscriptions),
    options: (kind: FinanceCategory["kind"]) => financeCategoryOptions(kind, categories, t, available),
  };
}
