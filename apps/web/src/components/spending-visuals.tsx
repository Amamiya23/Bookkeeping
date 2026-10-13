import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { groupSpendingCategories, isSubscriptionFinanceCategory, subscriptionCategoryPrefix } from "@/lib/finance-categories";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { RoundedDonut, donutColors, donutOtherColor } from "@/components/rounded-donut";
import { FinancePanel, FinanceShareBar } from "@/components/finance-ui";
import { FinanceTrendChart, cashflowChartColors } from "@/components/finance-trend-chart";
import Link from "@/components/router-link";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinanceSummary, FinanceCategory, FinanceCategoryIconName } from "@renewlet/shared/schemas/finance";

type Totals = FinanceSummary["byCurrency"][string];
const REPORT_CURRENCY = "CNY";
export type SpendingVisualsProps = { totals: Totals; from: string; to: string; categories: FinanceCategory[]; group?: string; previous?: Totals | undefined };
export function SpendingVisuals({ totals, from, to, categories, group = "", previous }: SpendingVisualsProps) {
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
  const expense = Number(totals.netExpense);
  const ranked = groupSpendingCategories(totals.categories);
  const subscriptionBreakdown = Object.entries(totals.categories).filter(([category, value]) => isSubscriptionFinanceCategory(category) && Number(value) !== 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  const positiveTotal = ranked.reduce((sum, [, value]) => sum + value, 0);
  const credits = Object.entries(totals.categories).filter(([, value]) => Number(value) < 0);
  const share = (value: number) => positiveTotal > 0 ? value / positiveTotal * 100 : 0;
  const percent = (value: number) => `${formatNumber(share(value), { maximumFractionDigits: 1 })}%`;
  const link = (params: Record<string, string>) => `/transactions?${new URLSearchParams({ from, to, group, ...params })}`;

  type Item = { key: string; label: string; value: number; icon?: FinanceCategoryIconName; href?: string; color: string; children?: Item[]; detail?: boolean };
  const categoryItem = (category: string, value: number, color: string): Item => {
    const detail = catalog.details(category, "expense");
    return { key: category, label: detail.label, value, icon: detail.icon, href: link({ category }), color };
  };
  // 色板只有 8 个固定槽位：超出部分合并为“其他”，避免循环复用同一颜色。
  const visible = ranked.length > donutColors.length ? ranked.slice(0, donutColors.length - 1) : ranked;
  const rest = ranked.slice(visible.length);
  const items: Item[] = visible.map(([category, value], index) => {
    const item = categoryItem(category, value, donutColors[index]!);
    return category === subscriptionCategoryPrefix ? { ...item, children: subscriptionBreakdown.map(([child, childValue]) => ({ ...categoryItem(child, Number(childValue), item.color), detail: true })) } : item;
  });
  if (rest.length > 0) items.push({ key: "other", label: t("category.other"), value: rest.reduce((sum, [, value]) => sum + value, 0), color: donutOtherColor, children: rest.map(([category, value]) => categoryItem(category, value, donutOtherColor)) });
  // 与上一等长周期对比：只在上一周期该分类有支出时显示变化，避免“新增分类 +∞%”。
  const previousRanked = new Map(previous ? groupSpendingCategories(previous.categories) : []);
  const previousOther = rest.reduce((sum, [category]) => sum + (previousRanked.get(category) ?? 0), 0);
  const change = (item: Item) => {
    if (!previous) return null;
    const before = item.key === "other" ? previousOther : previousRanked.get(item.key) ?? Number(previous.categories[item.key] ?? 0);
    if (before <= 0) return null;
    const delta = (item.value - before) / before * 100;
    return <span className={cn("inline-block w-14 text-right text-xs tabular-nums", delta > 0 ? "text-destructive" : "text-success")}>{delta > 0 ? "+" : ""}{formatNumber(delta, { maximumFractionDigits: 0 })}%</span>;
  };

  const row = (item: Item) => {
    const content = <>
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2.5"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">{item.icon ? <FinanceCategoryIcon name={item.icon} className="size-3.5" /> : <Ellipsis className="size-3.5" aria-hidden="true" />}</span><span className="truncate font-medium">{item.label}</span></span>
        <span className="shrink-0 tabular-nums">{amount(item.value)}{!item.detail && <span className="ml-2 inline-block w-12 text-right text-xs text-muted-foreground">{percent(item.value)}</span>}{change(item)}</span>
      </span>
      {!item.detail && <span className="mt-2 block pl-9.5"><FinanceShareBar percent={share(item.value)} color={item.color} /></span>}
    </>;
    return item.href ? <Link href={item.href} className="-mx-2 block rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60">{content}</Link> : <div className="py-2">{content}</div>;
  };

  return <div className="space-y-4">
    <FinancePanel title={trendLabel} action={<div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: cashflowChartColors.expense }} />{t("finance.netSpending")}</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: cashflowChartColors.income }} />{t("finance.income")}</span></div>}>
        <FinanceTrendChart data={points} monthly={monthly} label={trendLabel} />
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("finance.viewDaily")}</summary><div className="mt-3 max-h-64 overflow-auto rounded-lg border"><table className="w-full text-left text-xs tabular-nums"><thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{t("finance.occurredOn")}</th><th className="px-3 py-2 text-right font-medium">{t("finance.netSpending")}</th><th className="px-3 py-2 text-right font-medium">{t("finance.income")}</th></tr></thead><tbody>{days.map((day) => <tr key={day.date} className="border-t"><td className="px-3 py-2">{formatDateOnly(day.date)}</td><td className="px-3 py-2 text-right">{amount(day.expense)}</td><td className="px-3 py-2 text-right">{amount(day.income)}</td></tr>)}</tbody></table></div></details>
    </FinancePanel>
    {credits.length > 0 && <FinancePanel title={t("finance.refundOffsets")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("finance.refundShareHint")}</p>
      <ul className="space-y-2">{credits.map(([category, value]) => <li key={category}><Link href={link({ category })} className="flex justify-between gap-3 text-sm hover:text-primary"><span>{category === "builtin:refund" ? t("finance.unlinkedRefunds") : catalog.details(category, "expense").label}</span><span className="tabular-nums">{amount(value)}</span></Link></li>)}</ul>
    </FinancePanel>}
    <FinancePanel title={t("finance.spendingStructure")}>{ranked.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{t("finance.emptySpending")}</p> :
      <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <div className="relative mx-auto">
          <RoundedDonut label={t("finance.spendingStructure")} data={items.map((item) => ({ key: item.key, name: item.label, value: item.value, color: item.color, description: `${item.label} · ${amount(item.value)} · ${percent(item.value)}` }))} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-muted-foreground">{t("finance.netSpending")}</span><span className="text-base font-semibold tabular-nums">{formatNumber(expense, { notation: "compact", maximumFractionDigits: 1 })}</span></div>
        </div>
        <ol className="gap-x-10 md:columns-2">{items.map((item) => <li key={item.key} className="min-w-0 break-inside-avoid">
          {row(item)}
          {item.children && item.children.length > 0 && <details className="mb-2 ml-9.5 border-l pl-3 text-sm"><summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{item.key === subscriptionCategoryPrefix ? t("finance.viewSubscriptionCategories") : t("finance.moreDetails")}</summary><ul className="mt-1">{item.children.map((child) => <li key={child.key}>{row(child)}</li>)}</ul></details>}
        </li>)}</ol>
      </div>}
    </FinancePanel>
  </div>;
}
