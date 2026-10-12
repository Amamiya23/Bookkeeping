import { lazy, Suspense } from "react";
import { useSubscriptionAnalytics } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { toMonthlyAmount } from "@/lib/subscription-billing";
import { PaymentSchedule } from "@/components/payment-schedule";
import { useI18n } from "@/i18n/I18nProvider";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { RechartsFrame } from "@/components/recharts-frame";
import { CalendarClock, CircleCheck, FlaskConical, Wallet } from "lucide-react";
import { FinanceMetric, FinancePanel, FinanceShareBar } from "@/components/finance-ui";

const Calendar = lazy(() => import("@/pages/calendar"));

export function SubscriptionWorkspace({ onCategorySelect }: { onCategorySelect: (category: string) => void }) {
  const { t, label, formatCurrency } = useI18n();
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

  const chartData = ranked.map(([cat, amount]) => {
    const item = config.categories.find((c) => c.value === cat);
    return {
      category: cat,
      name: label(item?.labels ?? { "zh-CN": cat, "en-US": cat }),
      value: Math.round(amount * 100) / 100,
      color: item?.color ?? "hsl(var(--primary))",
    };
  });

  return (
    <section className="mb-6 space-y-4" aria-label={t("finance.subscriptionOverview")}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinanceMetric icon={<Wallet />} label={t("dashboard.monthlySpend")} value={costReady ? formatCurrency(stats.totalMonthly, "CNY") : "—"} />
        <FinanceMetric icon={<CircleCheck />} label={t("dashboard.activeSubscriptions")} value={String(stats.activeSubscriptions.length)} />
        <FinanceMetric icon={<CalendarClock />} label={t("dashboard.upcomingRenewals")} value={String(upcomingCount)} />
        <FinanceMetric icon={<FlaskConical />} label={t("dashboard.trials")} value={String(stats.trialCount)} />
      </dl>

      {/* 续费日历占主列；即将续费和支出分布叠放在侧列，两列高度大致相当。 */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Suspense fallback={<div role="status" className="h-128 animate-pulse rounded-2xl bg-muted"><span className="sr-only">{t("common.loading")}</span></div>}>
            <Calendar embedded />
          </Suspense>
        </div>
        <div className="grid min-w-0 gap-4">
          <FinancePanel title={t("dashboard.upcomingRenewals")}>
            {plans.data && <PaymentSchedule data={plans.data} subscriptionOnly limit={4} />}
            {plans.error && <p role="alert" className="text-sm text-destructive">{t("error.generic")}</p>}
          </FinancePanel>
          <FinancePanel title={t("dashboard.spendingDistribution")} action={costReady && total > 0 && <span className="text-xs font-semibold text-muted-foreground tabular-nums">{formatCurrency(total, "CNY")} {t("statistics.perMonth")}</span>}>
            {costReady && chartData.length > 0 ? (
              <div className="grid items-center gap-5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                <div className="flex justify-center">
                  <RechartsFrame height={120} className="w-30">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={58} paddingAngle={chartData.length > 1 ? 2 : 0} cornerRadius={4} dataKey="value" isAnimationActive={false} strokeWidth={0}>
                        {chartData.map((entry) => <Cell key={entry.category} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => [formatCurrency(Number(val), "CNY"), t("dashboard.monthlySpend")]}
                        contentStyle={{ backgroundColor: "hsl(var(--popover))", borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))", fontSize: "0.75rem" }}
                      />
                    </PieChart>
                  </RechartsFrame>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {chartData.map((item) => {
                    const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    return (
                      <button key={item.category} type="button" className="group -mx-1.5 block w-full rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/60" onClick={() => onCategorySelect(item.category)}>
                        <span className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="truncate group-hover:text-primary">{item.name}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground tabular-nums group-hover:text-foreground">{formatCurrency(item.value, "CNY")} · {percent}%</span>
                        </span>
                        <FinanceShareBar percent={percent} color={item.color} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{!costReady ? rates.error || t("common.loading") : t("statistics.noSubscriptionData")}</p>
            )}
          </FinancePanel>
        </div>
      </div>
    </section>
  );
}
