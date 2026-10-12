import { useQuery } from "@tanstack/react-query";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { useCashflow } from "@/components/cashflow-context";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import Link from "@/components/router-link";

export function SubscriptionPaymentHistory({ subscriptionId }: { subscriptionId: string }) {
  const cashflow = useCashflow();
  return cashflow?.enabled ? <PaymentHistory subscriptionId={subscriptionId} /> : null;
}
function PaymentHistory({ subscriptionId }: { subscriptionId: string }) {
  const { t, locale, formatDateOnly } = useI18n();
  const cashflow = useCashflow();
  const plans = useRecurringPlans();
  const plan = plans.data?.items.find((item) => item.subscriptionId === subscriptionId);
  const user = getProductCurrentUserId();
  const transactions = useQuery({ queryKey: ["finance", user, "service-history", plan?.id], queryFn: () => financeService.transactions({ planId: plan!.id, status: "posted", limit: "5" }), enabled: Boolean(cashflow?.enabled && plan) });
  if (!cashflow?.enabled || !plan) return null;
  return <section className="space-y-3 border-t pt-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{t("finance.paymentHistory")}</h3><p className="text-sm tabular-nums">{t("finance.cumulativePaid")} · {formatFinanceAmount(plan.paidCny, "CNY", locale)}</p></div>
    {transactions.error && <p role="alert">{t("error.generic")}</p>}
    {transactions.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
    {transactions.data?.items.map((row) => <div key={row.id} className="flex justify-between gap-3 text-sm"><span>{formatDateOnly(row.occurredOn)}</span><span className="tabular-nums">{formatFinanceAmount(row.cnyAmount || row.amount, row.cnyAmount ? "CNY" : row.currency, locale)}</span></div>)}
    <Link href={`/transactions?planId=${plan.id}`} className="text-xs underline underline-offset-4">{t("finance.navBills")}</Link>
  </section>;
}
