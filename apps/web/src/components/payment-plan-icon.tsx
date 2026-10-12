import type { FinanceCategory, FinancePlan } from "@renewlet/shared/schemas/finance";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { useSubscriptionDetail } from "@/hooks/use-subscriptions";
import { useI18n } from "@/i18n/I18nProvider";
import { financeCategoryDetails } from "@/lib/finance-categories";

function LinkedSubscriptionLogo({ plan }: { plan: FinancePlan }) {
  // 只为当前可见的订阅读取详情，同一订阅的多期付款共享详情缓存。
  const subscription = useSubscriptionDetail(plan.subscriptionId || null);
  return <SubscriptionLogo name={plan.name} logo={subscription.data?.logo} size="sm" className="size-9 rounded-xl" />;
}

export function PaymentPlanIcon({ plan, categories }: { plan: FinancePlan; categories: FinanceCategory[] }) {
  const { t } = useI18n();
  if (plan.type === "subscription") return <LinkedSubscriptionLogo plan={plan} />;
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
    <FinanceCategoryIcon name={financeCategoryDetails(plan.category, "expense", categories, t).icon} className="size-4" />
  </span>;
}
