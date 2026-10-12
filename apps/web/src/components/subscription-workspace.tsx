import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";
import { useSubscriptionAnalytics } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { toMonthlyAmount } from "@/lib/subscription-billing";
import { PaymentSchedule } from "@/components/payment-schedule";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";

const Calendar = lazy(() => import("@/pages/calendar"));
const Analysis = lazy(() => import("@/pages/subscription-statistics"));
const SubscriptionPayments = lazy(() => import("@/components/subscription-payments").then((module) => ({ default: module.SubscriptionPayments })));
export function SubscriptionWorkspace({ onCategorySelect }: { onCategorySelect: (category: string) => void }) {
  const { t, label, formatCurrency } = useI18n();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "list";
  const subscriptions = useSubscriptionAnalytics();
  const settings = useSettings();
  const today = useZonedToday(settings.data?.timezone ?? "UTC");
  const rates = useExchangeRates(settings.data?.exchangeRateProvider);
  const plans = useRecurringPlans();
  const { config } = useCustomConfigState();
  const stats = useDashboardStats(subscriptions.data ?? [], "CNY", rates.convert, today, settings.data?.notificationReminderDays ?? 7);
  const reminderEnd = new Date(new Date(today + "T00:00:00Z").getTime() + (settings.data?.notificationReminderDays ?? 7) * 86400000).toISOString().slice(0, 10);
  const upcomingCount = plans.data ? plans.data.items.filter((plan) => plan.type === "subscription" && plan.status === "active" && plan.nextDue <= reminderEnd).length : stats.upcomingCount;
  const categories = new Map<string, number>();
  for (const subscription of stats.activeSubscriptions) {
    const monthly = toMonthlyAmount(rates.convert(subscription.price, subscription.currency, "CNY"), subscription.billingCycle, subscription.customDays, subscription.customCycleUnit, subscription.oneTimeTermCount, subscription.oneTimeTermUnit);
    categories.set(subscription.category, (categories.get(subscription.category) ?? 0) + monthly);
  }
  const ranked = [...categories].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const costReady = !rates.loading && !rates.error && !subscriptions.isPending && Boolean(rates.rates["CNY"]) && stats.activeSubscriptions.every((subscription) => Boolean(rates.rates[subscription.currency]));
  return <section className="mb-6 space-y-6" aria-label={t("finance.subscriptionOverview")}>
    <dl className="grid grid-cols-2 gap-6 border-y py-5 sm:grid-cols-4">{[[t("dashboard.monthlySpend"), costReady ? formatCurrency(stats.totalMonthly, "CNY") : "—"], [t("dashboard.activeSubscriptions"), String(stats.activeSubscriptions.length)], [t("dashboard.upcomingRenewals"), String(upcomingCount)], [t("dashboard.trials"), String(stats.trialCount)]].map(([title, value]) => <div key={title}><dt className="text-sm text-muted-foreground">{title}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
    <nav className="flex flex-wrap gap-2" aria-label={t("finance.navSubscriptions")}>{(["list", "calendar", "analysis", "payments"] as const).map((value) => <Button key={value} size="sm" variant={view === value ? "secondary" : "ghost"} aria-pressed={view === value} onClick={() => { const next = new URLSearchParams(params); next.set("view", value); setParams(next); }}>{t(value === "list" ? "finance.subscriptionList" : value === "calendar" ? "finance.subscriptionCalendar" : value === "analysis" ? "finance.subscriptionAnalysis" : "finance.paymentHistory")}</Button>)}</nav>
    {view === "list" && <div className="grid gap-8 lg:grid-cols-2"><div><h2 className="text-base font-semibold">{t("dashboard.upcomingRenewals")}</h2>{plans.data && <PaymentSchedule data={plans.data} subscriptionOnly limit={4} />}{plans.error && <p role="alert">{t("error.generic")}</p>}</div><div><h2 className="mb-4 text-base font-semibold">{t("dashboard.spendingDistribution")}</h2><p className="mb-4 text-xs text-muted-foreground">{t("finance.subscriptionForecast")}</p>{costReady && <div className="space-y-3">{ranked.map(([category, amount]) => <button key={category} type="button" className="block w-full text-left" onClick={() => onCategorySelect(category)}><span className="mb-1 flex justify-between gap-3 text-sm"><span>{label(config.categories.find((item) => item.value === category)?.labels ?? { "zh-CN": category, "en-US": category })}</span><span className="tabular-nums">{formatCurrency(amount, "CNY")}</span></span><span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${total > 0 ? amount / total * 100 : 0}%` }} /></span></button>)}</div>}{!costReady && <p className="text-sm text-muted-foreground">{rates.error || t("common.loading")}</p>}</div></div>}
    <Suspense fallback={<p role="status">{t("common.loading")}</p>}>{view === "calendar" && <Calendar embedded />}{view === "analysis" && <Analysis embedded />}{view === "payments" && <SubscriptionPayments />}</Suspense>
  </section>;
}
