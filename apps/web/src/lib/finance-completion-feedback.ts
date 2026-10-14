import { financeService } from "@/services/finance-service";
import { toast } from "@/components/ui/sonner";
import type { useI18n } from "@/i18n/I18nProvider";
import type { FinancePlan, FinanceTransaction } from "@renewlet/shared/schemas/finance";

type FeedbackI18n = Pick<ReturnType<typeof useI18n>, "t" | "formatDateOnly">;

function notifySavedEntry(record: FinanceTransaction, today: string, { t, formatDateOnly }: FeedbackI18n, onView: () => void) {
  toast.success(t("finance.entrySaved", { date: formatDateOnly(record.occurredOn) }) + (record.occurredOn.slice(0, 7) !== today.slice(0, 7) ? ` · ${t("finance.savedOutsideMonth")}` : ""), {
    duration: 10000,
    action: { label: t("finance.viewEntry"), onClick: onView },
  });
}

function notifyCompletedPayment(name: string, dueOn: string, skipped: boolean, next: FinancePlan | undefined, { t, formatDateOnly }: FeedbackI18n, onView: () => void) {
  const result = t(skipped ? "finance.periodSkipped" : "finance.paymentCompleted", { name, date: formatDateOnly(dueOn) });
  const upcoming = next ? (next.status === "active" ? t("finance.nextPaymentOn", { date: formatDateOnly(next.nextDue) }) : t("finance.planCompleted")) : t("finance.paymentRecorded");
  toast.success(`${result} · ${upcoming}`, {
    duration: 10000,
    action: { label: t("finance.viewHistory"), onClick: onView },
  });
}

export async function saveEntry(input: Parameters<typeof financeService.saveTransaction>[0], today: string, i18n: FeedbackI18n, onView: (url: string) => void) {
  const record = await financeService.saveTransaction(input);
  return () => notifySavedEntry(record, today, i18n, () => onView(`/transactions?${new URLSearchParams({ id: record.id, from: record.occurredOn, to: record.occurredOn })}`));
}

export async function completePayment(plan: FinancePlan, input: Parameters<typeof financeService.settlePlan>[1], i18n: FeedbackI18n, onView: (url: string) => void) {
  const payment = await financeService.settlePlan(plan.id, input);
  // The payment is already committed; a failed follow-up read cannot undo it.
  const updated = await financeService.plans().catch(() => null);
  const next = updated?.items.find((item) => item.id === plan.id);
  return () => notifyCompletedPayment(plan.name, payment.dueOn, input.action === "skip", next, i18n, () => onView(`/transactions?planId=${encodeURIComponent(plan.id)}`));
}
