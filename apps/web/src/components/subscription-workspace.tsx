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
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { RechartsFrame } from "@/components/recharts-frame";
import { LayoutList, CalendarDays, LineChart, History } from "lucide-react";
import { cn } from "@/lib/utils";

const Calendar = lazy(() => import("@/pages/calendar"));
const Analysis = lazy(() => import("@/pages/subscription-statistics"));
const SubscriptionPayments = lazy(() => import("@/components/subscription-payments").then((module) => ({ default: module.SubscriptionPayments })));

const NAV_TABS = [
  { value: "list", labelKey: "finance.subscriptionList" as const, icon: LayoutList },
  { value: "calendar", labelKey: "finance.subscriptionCalendar" as const, icon: CalendarDays },
  { value: "analysis", labelKey: "finance.subscriptionAnalysis" as const, icon: LineChart },
  { value: "payments", labelKey: "finance.paymentHistory" as const, icon: History },
] as const;

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
    <section className="mb-8 space-y-6" aria-label={t("finance.subscriptionOverview")}>
      {/* 核心指标概览 */}
      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-border/80 bg-card/60 p-4 shadow-card backdrop-blur-sm sm:grid-cols-4 sm:gap-6 sm:p-6">
        {[
          [t("dashboard.monthlySpend"), costReady ? formatCurrency(stats.totalMonthly, "CNY") : "—"],
          [t("dashboard.activeSubscriptions"), String(stats.activeSubscriptions.length)],
          [t("dashboard.upcomingRenewals"), String(upcomingCount)],
          [t("dashboard.trials"), String(stats.trialCount)],
        ].map(([title, val], idx) => (
          <div key={title} className="flex flex-col justify-center">
            <dt className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</dt>
            <dd className={cn("mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums", idx === 0 ? "text-primary" : "text-foreground")}>
              {val}
            </dd>
          </div>
        ))}
      </dl>

      {/* 现代分段导航（Segmented Control） */}
      <div className="flex items-center overflow-x-auto pb-1">
        <nav
          className="inline-flex items-center gap-1.5 rounded-2xl border border-border/80 bg-secondary/60 p-1.5 shadow-xs backdrop-blur-md"
          aria-label={t("finance.navSubscriptions")}
        >
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.value;
            return (
              <Button
                key={tab.value}
                size="sm"
                variant={active ? "secondary" : "ghost"}
                aria-pressed={active}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("view", tab.value);
                  setParams(next);
                }}
                className={cn(
                  "gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all duration-200 select-none",
                  active
                    ? "bg-card text-foreground font-semibold shadow-xs ring-1 ring-border/50 hover:bg-card"
                    : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200", active && "text-primary scale-105")} />
                {t(tab.labelKey)}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* 列表页包含续费预告和支出扇形/分类分布 */}
      {view === "list" && (
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-card">
            <h2 className="text-base font-bold text-foreground mb-4">{t("dashboard.upcomingRenewals")}</h2>
            {plans.data && <PaymentSchedule data={plans.data} subscriptionOnly limit={4} />}
            {plans.error && <p role="alert" className="text-sm text-destructive">{t("error.generic")}</p>}
          </div>

          <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-foreground">{t("dashboard.spendingDistribution")}</h2>
                {costReady && total > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    {formatCurrency(total, "CNY")}/月
                  </span>
                )}
              </div>
              <p className="mb-4 text-xs text-muted-foreground">{t("finance.subscriptionForecast")}</p>

              {costReady && chartData.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)] items-center">
                  {/* 扇形图 */}
                  <div className="flex justify-center">
                    <RechartsFrame height={140} className="w-[140px]">
                      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={36}
                          outerRadius={62}
                          paddingAngle={3}
                          cornerRadius={4}
                          dataKey="value"
                          isAnimationActive={false}
                          strokeWidth={0}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: unknown) => [formatCurrency(Number(val), "CNY"), "月支出"]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            borderRadius: "0.75rem",
                            border: "1px solid hsl(var(--border))",
                            color: "hsl(var(--popover-foreground))",
                            fontSize: "0.75rem",
                          }}
                        />
                      </PieChart>
                    </RechartsFrame>
                  </div>

                  {/* 交互分类占比列表 */}
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {chartData.map((item) => {
                      const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
                      return (
                        <button
                          key={item.category}
                          type="button"
                          className="group block w-full text-left rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-secondary/60"
                          onClick={() => onCategorySelect(item.category)}
                          title="点击筛选该分类"
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="truncate group-hover:text-primary transition-colors">{item.name}</span>
                            </span>
                            <span className="tabular-nums text-muted-foreground group-hover:text-foreground">
                              {formatCurrency(item.value, "CNY")} ({percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${percent}%`, backgroundColor: item.color }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">{!costReady ? rates.error || t("common.loading") : t("statistics.noSubscriptionData")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}>
        {view === "calendar" && <Calendar embedded />}
        {view === "analysis" && <Analysis embedded />}
        {view === "payments" && <SubscriptionPayments />}
      </Suspense>
    </section>
  );
}
