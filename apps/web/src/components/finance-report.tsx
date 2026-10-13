import { ArrowDownLeft, ArrowUpRight, CalendarDays, Wallet } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { FinanceSummary, FinanceCategory } from "@renewlet/shared/schemas/finance";
import { formatFinanceAmount } from "@/lib/finance-format";
import { DeferredSpendingVisuals as SpendingVisuals } from "@/components/spending-visuals-loader";
import { FinanceMetric } from "@/components/finance-ui";
import { cn } from "@/lib/utils";

/** 分析页：任意时段的深入视图，指标和分类都与上一等长周期对比。 */
export function FinanceReport({ summary, previous, categories = [], group = "" }: { summary: FinanceSummary; previous?: FinanceSummary | undefined; categories?: FinanceCategory[]; group?: string }) {
  const { t, locale, formatNumber } = useI18n();
  const amount = (value: string | number) => formatFinanceAmount(String(value), "CNY", locale);
  const totals = summary.cnyTotals ?? summary.byCurrency["CNY"];
  if (!totals) return null;
  const before = previous ? previous.cnyTotals ?? previous.byCurrency["CNY"] : undefined;
  const days = Math.max(1, Math.round((Date.parse(summary.to) - Date.parse(summary.from)) / 86400000) + 1);
  const expense = Number(totals.netExpense);
  const prior = Number(before?.netExpense ?? 0);
  const change = prior > 0 ? (expense - prior) / prior * 100 : null;
  const delta = before && <span className={cn("tabular-nums", change === null ? "" : change > 0 ? "text-destructive" : "text-success")}>{change === null ? t("finance.noPreviousComparison") : t("finance.vsPreviousPeriod", { percent: (change > 0 ? "+" : "") + formatNumber(change, { maximumFractionDigits: 1 }) })}</span>;
  return <section className="space-y-4" aria-label={t("finance.reports")}>
    {summary.unconvertedCurrencies.length > 0 && <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">{t("finance.missingConversions")}</p>}
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <FinanceMetric icon={<ArrowUpRight />} label={t("finance.netSpending")} value={amount(totals.netExpense)} hint={delta} />
      <FinanceMetric icon={<CalendarDays />} label={t("finance.dailyAverage")} value={amount((expense / days).toFixed(2))} hint={t("finance.averageHint")} />
      <FinanceMetric icon={<ArrowDownLeft />} label={t("finance.income")} value={amount(totals.income)} />
      <FinanceMetric icon={<Wallet />} label={t("finance.netIncome")} value={amount(totals.netIncome)} tone={Number(totals.netIncome) < 0 ? "negative" : "default"} />
    </dl>
    <p className="text-sm text-muted-foreground">{t("finance.expenseBreakdown", { gross: amount(totals.grossExpense), refunds: amount(totals.refunds) })} · {t("finance.refundBasis")}</p>
    <SpendingVisuals totals={totals} previous={before} from={summary.from} to={summary.to} categories={categories} group={group} />
  </section>;
}
