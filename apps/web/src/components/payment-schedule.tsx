import { useCashflow } from "@/components/cashflow-context";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { CalendarCheck } from "lucide-react";
import { formatFinanceAmount } from "@/lib/finance-format";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { financeCategoryDetails } from "@/lib/finance-categories";
import type { FinancePlans, FinanceCategory } from "@renewlet/shared/schemas/finance";

export function PaymentSchedule({ data, categories = [], subscriptionOnly = false, limit = 8 }: { data: FinancePlans; categories?: FinanceCategory[]; subscriptionOnly?: boolean; limit?: number }) {
  const { t, locale, formatDateOnly } = useI18n();
  const cashflow = useCashflow();
  const rows = data.schedule.map((item) => ({ ...item, plan: data.items.find((p) => p.id === item.planId) })).filter((row) => row.plan && (!subscriptionOnly || row.plan.type === "subscription")).sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, limit);
  if (rows.length === 0) return <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary"><CalendarCheck className="size-4.5" aria-hidden="true" /></span>{t("finance.emptyPayments")}</div>;
  return <div className="-mx-2 divide-y divide-border/70">
    {rows.map(({ plan, dueOn, status }) => plan && <div key={`${plan.id}:${dueOn}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/40">
      <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary"><FinanceCategoryIcon name={financeCategoryDetails(plan.category, "expense", categories, t).icon} className="size-4 text-muted-foreground" /></span><div className="min-w-0"><p className="font-medium wrap-break-word">{plan.name}</p><p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span className="tabular-nums">{formatDateOnly(dueOn)}</span><span aria-hidden="true">·</span><span className={cn(status === "pending" && "rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning")}>{t(status === "pending" ? "finance.pending" : "finance.scheduled")}</span></p></div></div>
      <div className="ml-auto flex flex-wrap items-center gap-3"><span className="text-sm font-semibold tabular-nums">{Number(plan.amount) > 0 ? formatFinanceAmount(plan.amount, plan.currency, locale) : t("finance.variableAmount")}</span><Button size="sm" variant={status === "pending" ? "default" : "outline"} className="rounded-lg" disabled={plan.nextDue !== dueOn} title={plan.nextDue !== dueOn ? t("finance.confirmFirst") : undefined} onClick={() => cashflow?.pay(plan)}>{t("finance.confirmPayment")}</Button></div>
    </div>)}
  </div>;
}
