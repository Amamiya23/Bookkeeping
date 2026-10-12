import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { groupSpendingCategories, isSubscriptionFinanceCategory, subscriptionCategoryPrefix } from "@/lib/finance-categories";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { RoundedDonut, donutColors } from "@/components/rounded-donut";
import { FinanceTrendChart, cashflowChartColors } from "@/components/finance-trend-chart";
import Link from "@/components/router-link";
import type { FinanceSummary, FinanceCategory } from "@renewlet/shared/schemas/finance";

type Totals = FinanceSummary["byCurrency"][string];
const REPORT_CURRENCY = "CNY";
export type SpendingVisualsProps = { totals: Totals; from: string; to: string; categories: FinanceCategory[]; group?: string };
export function SpendingVisuals({ totals, from, to, categories, group = "" }: SpendingVisualsProps) {
  const { t, locale, formatDateOnly, formatNumber } = useI18n();
  const catalog = useFinanceCategoryCatalog(categories);
  const amount = (value: number | string) => formatFinanceAmount(String(value), REPORT_CURRENCY, locale);
  const start = new Date(from + "T00:00:00Z");
  const count = Math.floor((new Date(to + "T00:00:00Z").getTime() - start.getTime()) / 86400000) + 1;
  const days = Array.from({ length: Math.max(0, Math.min(367, count)) }, (_, index) => { const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10); return { date, expense: Number(totals.daily[date]?.expense ?? 0), income: Number(totals.daily[date]?.income ?? 0) }; });
  const monthly = count > 62;
  const months = new Map<string, { date: string; expense: number; income: number }>();
  for (const day of days) {
    const date = day.date.slice(0, 7) + "-01";
    const current = months.get(date);
    months.set(date, { date, expense: (current?.expense ?? 0) + day.expense, income: (current?.income ?? 0) + day.income });
  }
  const points = monthly ? [...months.values()] : days;
  const trendLabel = t(monthly ? "finance.monthlyTrend" : "finance.dailyTrend");
  const expense = Number(totals.grossExpense);
  const ranked = groupSpendingCategories(totals.categories);
  const subscriptionBreakdown = Object.entries(totals.categories).filter(([category, value]) => isSubscriptionFinanceCategory(category) && Number(value) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  const colors = donutColors;
  const categoryLink = (category: string, value: number | string, color?: string) => {
    const detail = catalog.details(category, "expense");
    return <Link href={`/transactions?${new URLSearchParams({ from, to, category, group })}`} className="flex items-center justify-between gap-3 rounded-md py-1 text-sm hover:text-primary"><span className="flex min-w-0 items-center gap-2"><span style={{ color }}><FinanceCategoryIcon name={detail.icon} className="size-4 shrink-0" /></span><span className="truncate">{detail.label}</span></span><span className="shrink-0 tabular-nums">{amount(value)} <span className="ml-2 text-xs text-muted-foreground">{formatNumber(Number(value) / expense * 100, { maximumFractionDigits: 1 })}%</span></span></Link>;
  };
  return <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
    <section className="min-w-0"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{trendLabel}</h2><div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: cashflowChartColors.expense }} />{t("finance.expense")}</span><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: cashflowChartColors.income }} />{t("finance.income")}</span></div></div><p className="text-xs text-muted-foreground">{REPORT_CURRENCY}</p>
      <FinanceTrendChart data={points} monthly={monthly} label={trendLabel} />
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">{t("finance.viewDaily")}</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">{t("finance.occurredOn")}</th><th>{t("finance.expense")}</th><th>{t("finance.income")}</th></tr></thead><tbody>{days.map((day) => <tr key={day.date} className="border-t"><td className="py-2">{formatDateOnly(day.date)}</td><td>{amount(day.expense)}</td><td>{amount(day.income)}</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="min-w-0"><h2 className="mb-5 text-lg font-semibold">{t("finance.spendingStructure")}</h2>{ranked.length === 0 ? <p className="py-12 text-sm text-muted-foreground">{t("finance.emptySpending")}</p> : <>
      <div className="mb-5 flex flex-wrap items-center gap-4"><RoundedDonut label={t("finance.spendingStructure")} data={ranked.map(([category, value], index) => ({ key: category, name: catalog.details(category, "expense").label, value, color: colors[index % colors.length]!, description: `${catalog.details(category, "expense").label} · ${amount(value)} · ${formatNumber(value / expense * 100, { maximumFractionDigits: 1 })}%` }))} /><p className="text-sm leading-6 text-muted-foreground">{t("finance.recurringSpend")}<br /><strong className="text-lg font-semibold text-foreground tabular-nums">{amount(totals.recurringExpense)}</strong><br />{formatNumber(expense > 0 ? Number(totals.recurringExpense) / expense * 100 : 0, { maximumFractionDigits: 1 })}%</p></div>
      <ol className="space-y-3">{ranked.map(([category, value], index) => <li key={category}>
        {categoryLink(category, value, colors[index % colors.length])}
        {category === subscriptionCategoryPrefix && <details className="mt-2 border-l pl-3 text-sm"><summary className="cursor-pointer text-muted-foreground">{t("finance.viewSubscriptionCategories")}</summary><ul className="mt-2 space-y-2">{subscriptionBreakdown.map(([child, amount]) => <li key={child}>{categoryLink(child, amount)}</li>)}</ul></details>}
      </li>)}</ol>
    </>}</section>
  </div>;
}
