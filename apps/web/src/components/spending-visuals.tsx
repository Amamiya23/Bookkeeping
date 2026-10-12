import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { financeCategoryDetails } from "@/lib/finance-categories";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import Link from "@/components/router-link";
import type { FinanceSummary, FinanceCategory } from "@renewlet/shared/schemas/finance";

type Totals = FinanceSummary["byCurrency"][string];
const REPORT_CURRENCY = "CNY";
export function SpendingVisuals({ totals, from, to, categories, group = "" }: { totals: Totals; from: string; to: string; categories: FinanceCategory[]; group?: string }) {
  const { t, locale, formatDateOnly, formatNumber } = useI18n();
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
  const peak = Math.max(1, ...points.flatMap((day) => [day.expense, day.income]));
  const expense = Number(totals.grossExpense);
  const ranked = Object.entries(totals.categories).filter(([, value]) => Number(value) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
  return <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
    <section className="min-w-0"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{trendLabel}</h2><div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />{t("finance.expense")}</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-muted-foreground/50" />{t("finance.income")}</span></div></div><div className="flex justify-between text-xs text-muted-foreground"><span>{REPORT_CURRENCY}</span><span>{amount(peak === 1 && expense === 0 ? 0 : peak)}</span></div>
      <svg viewBox="0 0 640 220" role="img" aria-label={trendLabel} className="mt-3 h-56 w-full">
        {[40, 110, 180].map((y) => <line key={y} x1="0" x2="640" y1={y} y2={y} stroke="currentColor" className="text-border" />)}
        {points.map((day, index) => { const width = 640 / points.length; return <g key={day.date}><title>{formatDateOnly(day.date)} · {t("finance.expense")} {amount(day.expense)} · {t("finance.income")} {amount(day.income)}</title><rect x={index * width + width * .1} y={180 - day.expense / peak * 160} width={width * .35} height={day.expense / peak * 160} rx="2" className="fill-primary" /><rect x={index * width + width * .5} y={180 - day.income / peak * 160} width={width * .35} height={day.income / peak * 160} rx="2" className="fill-muted-foreground/50" />{(index === 0 || (index + 1) % Math.max(5, Math.ceil(points.length / 6)) === 0 || index === points.length - 1) && <text x={index * width + width / 2} y="207" textAnchor="middle" fill="currentColor" className="text-xl text-muted-foreground sm:text-sm">{monthly ? day.date.slice(0, 7) : days.length <= 31 ? Number(day.date.slice(8)) : day.date.slice(5)}</text>}</g>; })}
      </svg>
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">{t("finance.viewDaily")}</summary><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">{t("finance.occurredOn")}</th><th>{t("finance.expense")}</th><th>{t("finance.income")}</th></tr></thead><tbody>{days.map((day) => <tr key={day.date} className="border-t"><td className="py-2">{formatDateOnly(day.date)}</td><td>{amount(day.expense)}</td><td>{amount(day.income)}</td></tr>)}</tbody></table></div></details>
    </section>
    <section className="min-w-0"><h2 className="mb-5 text-lg font-semibold">{t("finance.spendingStructure")}</h2>{ranked.length === 0 ? <p className="py-12 text-sm text-muted-foreground">{t("finance.emptySpending")}</p> : <>
      <div className="mb-5 flex items-center gap-5"><svg viewBox="0 0 120 120" role="img" aria-label={t("finance.spendingStructure")} className="size-32 shrink-0 -rotate-90"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="14" className="text-muted" />{ranked.map(([category, value], index) => { const share = Number(value) / expense; const startOffset = ranked.slice(0, index).reduce((sum, [, value]) => sum + Number(value) / expense, 0); return <circle key={category} cx="60" cy="60" r="44" fill="none" stroke={colors[index % colors.length]} strokeWidth="14" pathLength="100" strokeDasharray={`${Math.max(0, share * 100 - .7)} ${100 - Math.max(0, share * 100 - .7)}`} strokeDashoffset={-startOffset * 100}><title>{financeCategoryDetails(category, "expense", categories, t).label} · {amount(value)}</title></circle>; })}</svg><p className="text-sm leading-6 text-muted-foreground">{t("finance.recurringSpend")}<br /><strong className="text-lg font-semibold text-foreground tabular-nums">{amount(totals.recurringExpense)}</strong><br />{formatNumber(expense > 0 ? Number(totals.recurringExpense) / expense * 100 : 0, { maximumFractionDigits: 1 })}%</p></div>
      <ol className="space-y-3">{ranked.map(([category, value], index) => { const detail = financeCategoryDetails(category, "expense", categories, t); return <li key={category}><Link href={`/transactions?${new URLSearchParams({ from, to, category, group })}`} className="flex items-center justify-between gap-3 rounded-md py-1 text-sm hover:text-primary"><span className="flex min-w-0 items-center gap-2"><span style={{ color: colors[index % colors.length] }}><FinanceCategoryIcon name={detail.icon} className="size-4 shrink-0" /></span><span className="truncate">{detail.label}</span></span><span className="shrink-0 tabular-nums">{amount(value)} <span className="ml-2 text-xs text-muted-foreground">{formatNumber(Number(value) / expense * 100, { maximumFractionDigits: 1 })}%</span></span></Link></li>; })}</ol>
    </>}</section>
  </div>;
}
