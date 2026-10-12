import { useCashflow } from "@/components/cashflow-context";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { financeCategoryDetails } from "@/lib/finance-categories";
import type { FinancePlans, FinanceCategory } from "@renewlet/shared/schemas/finance";

export function PaymentSchedule({ data, categories = [], subscriptionOnly = false, limit = 8 }: { data: FinancePlans; categories?: FinanceCategory[]; subscriptionOnly?: boolean; limit?: number }) {
  const { t, locale, formatDateOnly } = useI18n();
  const cashflow = useCashflow();
  const rows = data.schedule.map((item) => ({ ...item, plan: data.items.find((p) => p.id === item.planId) })).filter((row) => row.plan && (!subscriptionOnly || row.plan.type === "subscription")).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, limit);
  return <div className="divide-y">
    {rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">{t("finance.emptyPayments")}</p>}
    {rows.map(({ plan, dueOn, status }) => plan && <div key={`${plan.id}:${dueOn}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><FinanceCategoryIcon name={financeCategoryDetails(plan.category, "expense", categories, t).icon} className="size-4 text-muted-foreground" /></span><div className="min-w-0"><p className="font-medium wrap-break-word">{plan.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateOnly(dueOn)} · {t(status === "pending" ? "finance.pending" : "finance.scheduled")}</p></div></div>
      <div className="ml-auto flex flex-wrap items-center gap-3"><span className="text-sm tabular-nums">{Number(plan.amount) > 0 ? formatFinanceAmount(plan.amount, plan.currency, locale) : t("finance.variableAmount")}</span><Button size="sm" variant={status === "pending" ? "default" : "outline"} disabled={plan.nextDue !== dueOn} title={plan.nextDue !== dueOn ? t("finance.confirmFirst") : undefined} onClick={() => cashflow?.pay(plan)}>{t("finance.confirmPayment")}</Button></div>
    </div>)}
  </div>;
}
