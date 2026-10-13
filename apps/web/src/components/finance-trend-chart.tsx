import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { RechartsFrame } from "@/components/recharts-frame";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";

type TrendDatum = { date: string; expense: number; income: number };
export const cashflowChartColors = { expense: "var(--viz-expense)", income: "var(--viz-income)" };

export function FinanceTrendChart({ data, monthly, label }: { data: TrendDatum[]; monthly: boolean; label: string }) {
  const { t, locale, formatNumber, formatDateOnly } = useI18n();
  const amount = (value: number) => formatFinanceAmount(String(value), "CNY", locale);
  const dateLabel = (date: string) => monthly ? date.slice(0, 7) : formatDateOnly(date);
  const tooltip = (props: unknown) => {
    if (!props || typeof props !== "object" || !("active" in props) || !props.active || !("label" in props) || typeof props.label !== "string") return null;
    const day = data.find((item) => item.date === props.label);
    if (!day) return null;
    return <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
      <p className="mb-2 font-medium">{dateLabel(day.date)}</p>
      {(["expense", "income"] as const).map((kind) => <p key={kind} className="flex items-center justify-between gap-5 py-0.5"><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: cashflowChartColors[kind] }} />{t(kind === "expense" ? "finance.netSpending" : "finance.income")}</span><span className="font-medium tabular-nums">{amount(day[kind])}</span></p>)}
    </div>;
  };
  return <div role="img" aria-label={label} className="min-w-0">
    <RechartsFrame height={280} testId="finance-trend-chart-frame">
      <BarChart data={data} accessibilityLayer title={label} margin={{ top: 12, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={24} tickMargin={10} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(date: string) => monthly ? date.slice(0, 7) : date.slice(5)} />
        <YAxis width={56} axisLine={false} tickLine={false} tickMargin={8} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(value: number) => formatNumber(value, { notation: "compact", maximumFractionDigits: 1 })} domain={[(min: number) => Math.min(0, min), (max: number) => max > 0 ? max : 1]} />
        <Tooltip content={tooltip} cursor={{ fill: "hsl(var(--muted))", fillOpacity: .6, radius: 6 }} isAnimationActive={false} offset={12} wrapperStyle={{ pointerEvents: "none", zIndex: 10 }} />
        <Bar dataKey="expense" name={t("finance.netSpending")} fill={cashflowChartColors.expense} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="income" name={t("finance.income")} fill={cashflowChartColors.income} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </RechartsFrame>
  </div>;
}
