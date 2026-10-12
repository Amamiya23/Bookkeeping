import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RecurringPlans } from "@/components/recurring-plans";
import { useFinanceCapabilities } from "@/hooks/use-finance";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { useI18n } from "@/i18n/I18nProvider";

export function SubscriptionPayments() {
  const capabilities = useFinanceCapabilities();
  const user = getProductCurrentUserId();
  const client = useQueryClient();
  const { t } = useI18n();
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled: capabilities.data?.ledger === true });
  if (!capabilities.data?.ledger) return <p>{t("finance.unsupported")}</p>;
  return ledger.data && <RecurringPlans subscriptionOnly categories={ledger.data.categories} onAddCategory={async (category) => { await financeService.updateLedger({ ...ledger.data, categories: [...ledger.data.categories, category] }); await client.invalidateQueries({ queryKey: ["finance", user, "ledger"] }); }} />;
}
