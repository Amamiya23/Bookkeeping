import { CalendarCheck, CalendarClock, Check, ChevronRight } from "lucide-react";
import type { FinanceCategory, FinancePlans } from "@renewlet/shared/schemas/finance";
import { useCashflow } from "@/components/cashflow-context";
import { PaymentPlanIcon } from "@/components/payment-plan-icon";
import Link from "@/components/router-link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { getOverviewPaymentSchedule, type OverviewPaymentRow } from "@/lib/overview-payment-schedule";
import { daysBetweenDateOnly } from "@/lib/time/date-only";
import { cn } from "@/lib/utils";

export function OverviewPaymentSchedule({ data, month, categories = [], limit = 5 }: {
  data: FinancePlans; month: string; categories?: FinanceCategory[]; limit?: number;
}) {
  const { t, locale, formatDateOnly } = useI18n();
  const cashflow = useCashflow();
  const view = getOverviewPaymentSchedule(data, month);
  const pending = view.pending.slice(0, limit);
  const upcoming = view.upcoming.slice(0, Math.max(0, limit - pending.length));
  const processed = view.currentMonth ? [] : view.processed.slice(0, Math.max(0, limit - pending.length));
  const quietMonth = view.currentMonth && view.pending.length === 0 && view.upcoming[0]
    && daysBetweenDateOnly(data.today, view.upcoming[0].dueOn) > 30;
  const empty = pending.length === 0 && upcoming.length === 0 && processed.length === 0;

  const renderRow = ({ plan, dueOn }: OverviewPaymentRow, needsConfirmation: boolean) => {
    const days = daysBetweenDateOnly(data.today, dueOn);
    const status = days < 0 ? t("finance.confirmationOverdue", { days: -days })
      : days === 0 ? t("finance.dueToday") : t("finance.dueInDays", { days });
    return <li key={`${plan.id}:${dueOn}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PaymentPlanIcon plan={plan} categories={categories} />
        <div className="min-w-0">
          <Link href={`/transactions?planId=${plan.id}`} className="text-sm font-medium wrap-break-word hover:text-primary">{plan.name}</Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{formatDateOnly(dueOn)}</span><span aria-hidden="true">·</span>
            <span className={cn(needsConfirmation && "font-medium text-warning")}>{status}</span>
          </p>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <span className="text-right text-sm font-semibold tabular-nums">
          {Number(plan.amount) > 0
            ? t("finance.estimatedPaymentAmount", { amount: formatFinanceAmount(plan.amount, plan.currency, locale) })
            : t("finance.variableAmount")}
        </span>
        <Button size="sm" variant={needsConfirmation ? "default" : "ghost"} className="rounded-lg"
          disabled={!cashflow?.enabled || plan.status !== "active" || plan.nextDue !== dueOn}
          title={plan.nextDue !== dueOn ? t("finance.confirmFirst") : undefined}
          onClick={() => cashflow?.pay(plan)}>
          {t(needsConfirmation ? "finance.confirmPayment" : "finance.confirmEarly")}
        </Button>
      </div>
    </li>;
  };

  return <div className="space-y-4">
    {view.monthComplete && <div role="status" className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
      <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
      {t("finance.monthPaymentsHandled", { month })}
    </div>}
    {pending.length > 0 && <section aria-label={t("finance.awaitingConfirmation")}>
      <h3 className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {t("finance.awaitingConfirmation")}<span className="tabular-nums">{view.pending.length}</span>
      </h3>
      <ul className="divide-y divide-border/70">{pending.map((row) => renderRow(row, true))}</ul>
    </section>}
    {upcoming.length > 0 && <section aria-label={t("finance.upNext")}>
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden="true" />{t("finance.upNext")}
      </h3>
      {quietMonth && <p className="mt-2 text-xs text-muted-foreground">{t("finance.noPaymentsNext30Days")}</p>}
      <ul className="divide-y divide-border/70">{upcoming.map((row) => renderRow(row, false))}</ul>
    </section>}
    {processed.length > 0 && <section aria-label={t("finance.paymentHistory")}>
      <h3 className="text-xs font-medium text-muted-foreground">{t("finance.paymentHistory")}</h3>
      <ul className="divide-y divide-border/70">{processed.map((payment) => <li key={payment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          {payment.plan ? <PaymentPlanIcon plan={payment.plan} categories={categories} /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><Check className="size-4" aria-hidden="true" /></span>}
          <div className="min-w-0"><p className="font-medium wrap-break-word">{payment.plan?.name ?? t("finance.plans")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateOnly(payment.dueOn)} · {t(payment.status === "paid" ? "finance.paid" : "finance.skipped")}</p></div>
        </div>
        {payment.transactionId && <Link href={`/transactions?planId=${payment.planId}`} className="shrink-0 text-xs font-medium text-primary hover:underline underline-offset-4">{t("finance.navBills")}<ChevronRight className="inline size-3.5" aria-hidden="true" /></Link>}
      </li>)}</ul>
    </section>}
    {empty && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(view.currentMonth ? "finance.noActivePaymentPlans" : "finance.emptyPaymentHistory")}</p>
      {view.currentMonth && <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><Link href="/transactions?view=plans&action=new">{t("finance.newPlan")}</Link></Button>
        <Button asChild size="sm" variant="ghost"><Link href="/subscriptions">{t("finance.manageSubscriptions")}</Link></Button>
      </div>}
    </div>}
  </div>;
}
