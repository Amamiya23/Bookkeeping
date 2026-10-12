import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useFinanceCapabilities } from "@/hooks/use-finance";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import { useRouteReady } from "@/components/route-progress";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeService } from "@/services/finance-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { PaymentSchedule } from "@/components/payment-schedule";
import { SpendingVisuals } from "@/components/spending-visuals";
import Link from "@/components/router-link";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";

export function FinanceDashboard() {
  const capabilities = useFinanceCapabilities();
  const user = getProductCurrentUserId();
  const { t, locale, formatNumber } = useI18n();
  const enabled = capabilities.data?.ledger === true;
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled });
  const today = useZonedToday(ledger.data?.timeZone ?? "UTC");
  const [selectedMonth, setMonth] = useState("");
  const [group, setGroup] = useState("");
  const month = selectedMonth || today.slice(0, 7);
  const from = month + "-01";
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const to = month === today.slice(0, 7) ? today : end;
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  const previousFrom = prev.toISOString().slice(0, 7) + "-01";
  const previousTo = previousFrom.slice(0, 8) + String(Math.min(Number(to.slice(8)), new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate())).padStart(2, "0");
  const summary = useQuery({ queryKey: ["finance", user, "summary", from, to, group], queryFn: () => financeService.summary(from, to, group), enabled: enabled && Boolean(ledger.data) });
  const previous = useQuery({ queryKey: ["finance", user, "summary", previousFrom, previousTo, group], queryFn: () => financeService.summary(previousFrom, previousTo, group), enabled: enabled && Boolean(ledger.data) });
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
  return <div className="space-y-8 pb-16" data-testid={pending ? undefined : "consumption-overview"}>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm text-muted-foreground">{t("finance.overviewEyebrow")}</p><h1 className="text-2xl font-semibold tracking-tight">{t("finance.overview")}</h1></div>{enabled && <FormField id="overview-month" label={t("finance.month")}>{({ id }) => <Input id={id} type="month" value={month} max={today.slice(0, 7)} className="w-44 scheme-light dark:scheme-dark" onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value <= today.slice(0, 7)) setMonth(event.target.value); }} />}</FormField>}</div>
    {pending && <div role="status" className="min-h-48 animate-pulse rounded-xl bg-muted p-6">{t("common.loading")}</div>}
    {failure && <div role="alert" className="space-y-3 border p-6"><p>{t("error.generic")}</p><Button variant="outline" onClick={() => { void capabilities.refetch(); if (enabled) { void ledger.refetch(); void summary.refetch(); } }}>{t("finance.retry")}</Button></div>}
    {!enabled && !capabilities.isPending && <div className="space-y-4 py-12"><p>{t("finance.unsupported")}</p><Button asChild><Link href="/subscriptions">{t("finance.manageSubscriptions")}</Link></Button></div>}
    {enabled && totals && <>
      <section className="grid gap-8 border-y py-7 sm:py-9 lg:grid-cols-[1.2fr_1fr]" aria-label={t("finance.overview")}>
        <div><p className="text-sm text-muted-foreground">{t("finance.totalSpend")} · {month}</p><p className="mt-3 wrap-break-word text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{amount(totals.grossExpense)}</p><p className="mt-4 text-sm text-muted-foreground">{change === null ? t("finance.noComparison") : t("finance.comparison", { percent: (change > 0 ? "+" : "") + formatNumber(change, { maximumFractionDigits: 1 }) })}</p><Link href={`/transactions?from=${from}&to=${to}&group=${group}`} className="mt-5 inline-flex items-center gap-1 text-sm font-medium">{t("finance.navBills")}<ArrowUpRight className="size-4" /></Link></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 self-center">{[[t("finance.income"), amount(totals.income)], [t("finance.netIncome"), amount(totals.netIncome)], [t("finance.recurringSpend"), amount(totals.recurringExpense)], [t("finance.remainingPayments"), plans.isPending || plans.error || missingEstimate ? "—" : amount(estimate.toFixed(2))]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 wrap-break-word text-xl font-semibold tabular-nums">{value}</dd></div>)}<p className="col-span-2 text-xs text-muted-foreground">{t("finance.balanceHint")} · {t("finance.estimate")} {planned.length}</p></dl>
      </section>
      {summary.data && summary.data.unconvertedCurrencies.length > 0 && <p role="status" className="rounded-lg border p-3 text-sm">{t("finance.missingConversions")}</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("finance.kind")}>{(["", "daily", "recurring"] as const).map((value) => <Button key={value} size="sm" variant={group === value ? "secondary" : "ghost"} aria-pressed={group === value} onClick={() => setGroup(value)}>{t(value === "" ? "finance.allSpending" : value === "daily" ? "finance.dailySpending" : "finance.recurringSpend")}</Button>)}</div>
      <SpendingVisuals totals={totals} from={from} to={to} categories={ledger.data?.categories ?? []} group={group} />
      <section className="grid gap-6 border-t pt-7 lg:grid-cols-[1fr_2fr]"><div><h2 className="text-xl font-semibold">{t("finance.pendingPayments")}</h2><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{t("finance.planHint")}</p><Link href="/transactions?view=plans" className="mt-4 inline-flex items-center gap-1 text-sm font-medium">{t("finance.plans")}<ChevronRight className="size-4" /></Link></div><div>{plans.isPending && <p role="status">{t("common.loading")}</p>}{plans.error && <p role="alert">{t("error.generic")}</p>}{plans.data && <PaymentSchedule data={plans.data} categories={ledger.data?.categories ?? []} />}</div></section>
      <p className="text-xs leading-5 text-muted-foreground">{t("finance.historyFixed")}</p>
    </>}
  </div>;
}
