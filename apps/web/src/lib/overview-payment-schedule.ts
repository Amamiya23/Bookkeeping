import type { FinancePlan, FinancePlans } from "@renewlet/shared/schemas/finance";

export interface OverviewPaymentRow {
  plan: FinancePlan;
  dueOn: string;
}

/** 月内统计仍使用原始 schedule；跨月预览只补充每个有效计划的下一期。 */
export function getOverviewPaymentSchedule(data: FinancePlans, month: string) {
  const currentMonth = month === data.today.slice(0, 7);
  const plans = new Map(data.items.map((plan) => [plan.id, plan]));
  const scheduled = data.schedule.flatMap((item) => {
    const plan = plans.get(item.planId);
    return plan && item.dueOn.slice(0, 7) <= month ? [{ plan, dueOn: item.dueOn }] : [];
  });
  const byDate = (a: OverviewPaymentRow, b: OverviewPaymentRow) => a.dueOn.localeCompare(b.dueOn) || a.plan.id.localeCompare(b.plan.id);
  const pending = scheduled.filter((row) => !currentMonth || row.dueOn <= data.today).sort(byDate);
  const upcoming = new Map<string, OverviewPaymentRow>();
  if (currentMonth) {
    for (const row of scheduled.filter((item) => item.dueOn > data.today)) {
      upcoming.set(`${row.plan.id}:${row.dueOn}`, row);
    }
    for (const plan of data.items) {
      if (plan.status !== "active" || plan.nextDue <= data.today || plan.endDate && plan.nextDue > plan.endDate) continue;
      upcoming.set(`${plan.id}:${plan.nextDue}`, { plan, dueOn: plan.nextDue });
    }
  }
  const processed = data.payments.filter((payment) => payment.dueOn.slice(0, 7) === month && payment.status !== "pending");
  return {
    currentMonth,
    pending,
    upcoming: [...upcoming.values()].sort(byDate),
    processed: processed.map((payment) => ({ ...payment, plan: plans.get(payment.planId) })).sort((a, b) => b.dueOn.localeCompare(a.dueOn)),
    monthComplete: scheduled.length === 0 && processed.length > 0,
  };
}
