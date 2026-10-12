import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, Repeat, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useFinanceCapabilities } from "@/hooks/use-finance";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import { useRouteReady } from "@/components/route-progress";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeService } from "@/services/finance-service";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PaymentSchedule } from "@/components/payment-schedule";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { groupSpendingCategories } from "@/lib/finance-categories";
import { MonthPicker } from "@/components/month-picker";
import Link from "@/components/router-link";
import { FinanceEmpty, FinanceMetric, FinancePageHeader, FinancePanel, FinanceShareBar, FinanceSparkline, vizColors } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";

export function FinanceDashboard() {
  const capabilities = useFinanceCapabilities();
  const user = getProductCurrentUserId();
  const { t, locale, formatNumber, formatDateOnly } = useI18n();
  const enabled = capabilities.data?.ledger === true;
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled });
  const today = useZonedToday(ledger.data?.timeZone ?? "UTC");
  const [selectedMonth, setMonth] = useState("");
  const month = selectedMonth || today.slice(0, 7);
  const from = month + "-01";
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = month === today.slice(0, 7) ? today : end;
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  const previousFrom = prev.toISOString().slice(0, 7) + "-01";
  const previousTo = previousFrom.slice(0, 8) + String(Math.min(Number(to.slice(8)), new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate())).padStart(2, "0");
  const summary = useQuery({ queryKey: ["finance", user, "summary", from, to, ""], queryFn: () => financeService.summary(from, to), enabled: enabled && Boolean(ledger.data) });
  const previous = useQuery({ queryKey: ["finance", user, "summary", previousFrom, previousTo, ""], queryFn: () => financeService.summary(previousFrom, previousTo), enabled: enabled && Boolean(ledger.data) });
  // 总览只看本月最新几笔；完整筛选和分页留给账单页。
  const recent = useQuery({ queryKey: ["finance", user, "transactions", "recent", from, to], queryFn: () => financeService.transactions({ from, to, status: "posted", limit: "6" }), enabled: enabled && Boolean(ledger.data) });
  const catalog = useFinanceCategoryCatalog(ledger.data?.categories ?? []);
  const plans = useRecurringPlans(from, end);
  const settings = useSettings();
  const rates = useExchangeRates(settings.data?.exchangeRateProvider);
  const totals = summary.data?.cnyTotals ?? summary.data?.byCurrency["CNY"];
  const amount = (value: string | number) => formatFinanceAmount(String(value), "CNY", locale);
  const prior = Number(previous.data?.cnyTotals?.grossExpense ?? previous.data?.byCurrency["CNY"]?.grossExpense ?? 0);
  const change = prior > 0 ? (Number(totals?.grossExpense ?? 0) - prior) / prior * 100 : null;
  const planned = plans.data?.schedule.filter((item) => item.dueOn >= from && item.dueOn <= end) ?? [];
  let estimate = 0; let missingEstimate = false;
  for (const item of planned) {
    const plan = plans.data?.items.find((p) => p.id === item.planId);
    if (!plan) continue;
    if (plan.currency === "CNY") estimate += Number(plan.amount);
    else if (!rates.loading && !rates.error && rates.sourceDate && rates.rates[plan.currency] && rates.rates["CNY"]) estimate += rates.convert(plan.amount, plan.currency, "CNY");
    else missingEstimate = true;
  }
  const failure = capabilities.error || ledger.error || summary.error;
  const pending = capabilities.isPending || enabled && (ledger.isPending || summary.isPending);
  useRouteReady(pending);
  const balance = Number(totals?.netIncome ?? 0);
  const expenseTotal = Number(totals?.grossExpense ?? 0);
  const topCategories = groupSpendingCategories(totals?.categories ?? {}).slice(0, 6);
  // 累计支出走势：从月初累加到截止日，给主数字一个“花得快不快”的直觉参照。
  const cumulative: number[] = [];
  for (let day = new Date(from + "T00:00:00Z"); day.toISOString().slice(0, 10) <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    cumulative.push((cumulative.at(-1) ?? 0) + Number(totals?.daily[day.toISOString().slice(0, 10)]?.expense ?? 0));
  }
  return <div className="space-y-6 pb-16 sm:space-y-8" data-testid={pending ? undefined : "consumption-overview"}>
    <FinancePageHeader
      title={t("finance.overview")}
      actions={enabled && (
        <FormField id="overview-month" label={t("finance.month")} labelClassName="sr-only">
          {({ id }) => (
            <MonthPicker
              id={id}
              value={month}
              max={today.slice(0, 7)}
              onChange={(nextMonth) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth) && nextMonth <= today.slice(0, 7)) {
                  setMonth(nextMonth);
                }
              }}
            />
          )}
        </FormField>
      )}
    />
    {pending && <div role="status" className="grid gap-4 lg:grid-cols-[1.25fr_1fr]"><span className="sr-only">{t("common.loading")}</span><div className="h-56 animate-pulse rounded-2xl bg-muted" /><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>}
    {failure && <div role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6"><p>{t("error.generic")}</p><Button variant="outline" onClick={() => { void capabilities.refetch(); if (enabled) { void ledger.refetch(); void summary.refetch(); } }}>{t("finance.retry")}</Button></div>}
    {!enabled && !capabilities.isPending && <FinanceEmpty action={<Button asChild><Link href="/subscriptions">{t("finance.manageSubscriptions")}</Link></Button>}>{t("finance.unsupported")}</FinanceEmpty>}
    {enabled && totals && <>
      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]" aria-label={t("finance.overview")}>
        <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-card sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <p className="text-sm font-medium text-muted-foreground">{t("finance.totalSpend")} · {month}</p>
            <p className="mt-3 text-4xl font-bold tracking-tight wrap-break-word sm:text-5xl">{amount(totals.grossExpense)}</p>
            <p className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums", change === null ? "bg-secondary text-muted-foreground" : change > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
              {change !== null && (change > 0 ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />)}
              {change === null ? t("finance.noComparison") : t("finance.comparison", { percent: (change > 0 ? "+" : "") + formatNumber(change, { maximumFractionDigits: 1 }) })}
            </p>
          </div>
          <FinanceSparkline values={cumulative} className="relative mt-6" />
          <Link href={`/transactions?from=${from}&to=${to}`} className="relative mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">{t("finance.navBills")}<ArrowUpRight className="size-4" /></Link>
        </div>
        <div className="min-w-0">
          <dl className="grid h-full grid-cols-2 gap-3 [&>div]:flex [&>div]:flex-col [&>div]:justify-between">
            <FinanceMetric icon={<ArrowDownLeft />} label={t("finance.income")} value={amount(totals.income)} />
            <FinanceMetric icon={<Wallet />} label={t("finance.netIncome")} value={amount(totals.netIncome)} tone={balance < 0 ? "negative" : "default"} />
            <FinanceMetric icon={<Repeat />} label={t("finance.recurringSpend")} value={amount(totals.recurringExpense)} />
            <FinanceMetric icon={<CalendarClock />} label={t("finance.remainingPayments")} value={plans.isPending || plans.error || missingEstimate ? "—" : amount(estimate.toFixed(2))} />
          </dl>
        </div>
      </section>
      {summary.data && summary.data.unconvertedCurrencies.length > 0 && <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">{t("finance.missingConversions")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <FinancePanel title={t("finance.pendingPayments")} action={<Link href="/transactions?view=plans" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">{t("finance.plans")}<ChevronRight className="size-4" /></Link>}>
          {plans.isPending && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}{plans.error && <p role="alert">{t("error.generic")}</p>}{plans.data && <PaymentSchedule data={plans.data} categories={ledger.data?.categories ?? []} limit={5} />}
        </FinancePanel>
        <FinancePanel title={t("finance.recentTransactions")} action={<Link href={`/transactions?from=${from}&to=${to}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">{t("finance.navBills")}<ChevronRight className="size-4" /></Link>}>
          {recent.isPending && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {recent.data && recent.data.items.length === 0 && <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">{t("common.noData")}</div>}
          {recent.data && recent.data.items.length > 0 && <ul className="-mx-2 divide-y divide-border/70">{recent.data.items.map((record) => {
            const detail = catalog.details(record.kind === "refund" ? "builtin:refund" : record.kind === "transfer" ? "builtin:transfer" : record.category, record.kind === "expense" ? "expense" : "income");
            const incoming = record.kind !== "expense";
            return <li key={record.id} className="flex items-center gap-3 px-2 py-2.5">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", incoming ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground")}><FinanceCategoryIcon name={detail.icon} className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{record.merchant || detail.label}</span><span className="block text-xs text-muted-foreground tabular-nums">{formatDateOnly(record.occurredOn)}{record.merchant && record.merchant !== detail.label ? ` · ${detail.label}` : ""}</span></span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", incoming && "text-success")}>{incoming && "+"}{formatFinanceAmount(record.cnyAmount || record.amount, record.cnyAmount ? "CNY" : record.currency, locale)}</span>
            </li>;
          })}</ul>}
        </FinancePanel>
      </div>
      <FinancePanel title={t("finance.topCategories")} action={<Link href={`/statistics?from=${from}&to=${to}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">{t("finance.navAnalysis")}<ChevronRight className="size-4" /></Link>}>
        {topCategories.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("finance.emptySpending")}</p> : <ol className="grid gap-x-10 gap-y-1 md:grid-cols-2 xl:grid-cols-3">{topCategories.map(([category, value], index) => {
          const detail = catalog.details(category, "expense");
          const share = expenseTotal > 0 ? value / expenseTotal * 100 : 0;
          return <li key={category}><Link href={`/transactions?${new URLSearchParams({ from, to, category })}`} className="-mx-2 block rounded-lg px-2 py-2 transition-colors hover:bg-secondary/60">
            <span className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2.5"><span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><FinanceCategoryIcon name={detail.icon} className="size-3.5" /></span><span className="truncate font-medium">{detail.label}</span></span><span className="shrink-0 tabular-nums">{amount(value)}<span className="ml-2 inline-block w-11 text-right text-xs text-muted-foreground">{formatNumber(share, { maximumFractionDigits: 1 })}%</span></span></span>
            <span className="mt-2 block pl-16"><FinanceShareBar percent={share} color={vizColors[index]!} /></span>
          </Link></li>;
        })}</ol>}
      </FinancePanel>
    </>}
  </div>;
}
