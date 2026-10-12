import { createContext, useContext, useState, useCallback, lazy, Suspense, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useFinanceCapabilities, ledgerToday } from "@/hooks/use-finance";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeErrorMessage } from "@/lib/finance-error";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "@/components/ui/sonner";
import type { FinancePlan, FinanceTransactionInput, FinanceCategory } from "@renewlet/shared/schemas/finance";

interface CashflowActions { enabled: boolean; add: () => void; pay: (plan: FinancePlan) => void; paySubscription: (id: string) => void }
const CashflowContext = createContext<CashflowActions | null>(null);
const FinanceTransactionDialog = lazy(() => import("@/components/finance-transaction-dialog").then((module) => ({ default: module.FinanceTransactionDialog })));
const PlanPaymentDialog = lazy(() => import("@/components/plan-payment-dialog").then((module) => ({ default: module.PlanPaymentDialog })));
export const useCashflow = () => useContext(CashflowContext);
export function emptyTransaction(today: string): FinanceTransactionInput {
  return { kind: "expense", amount: "", currency: "CNY", cnyAmount: "", account: "", counterAccount: "", occurredOn: today, category: "", merchant: "", tags: [], notes: "", refundOf: "", externalSource: "", externalId: "", version: 0 };
}
export function CashflowProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const capabilities = useFinanceCapabilities();
  const enabled = capabilities.data?.ledger === true;
  const user = getProductCurrentUserId();
  const client = useQueryClient();
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled });
  const [adding, setAdding] = useState(false);
  const [plan, setPlan] = useState<FinancePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["finance", user] }), client.invalidateQueries({ queryKey: ["subscriptions"] })]);
  }, [client, user]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError("");
    try { await action(); setAdding(false); setPlan(null); await refresh(); toast.success(t("finance.saved")); }
    catch (cause) { setError(financeErrorMessage(cause, t)); }
    finally { setBusy(false); }
  };
  const paySubscription = useCallback((id: string) => {
    void financeService.plans().then((data) => {
      const target = data.items.find((item) => item.subscriptionId === id);
      if (!target) { toast.error(t("finance.noPaymentPlan")); return; }
      setError(""); setPlan(target);
    }).catch((cause) => toast.error(financeErrorMessage(cause, t)));
  }, [t]);
  const addCategory = async (category: FinanceCategory) => {
    if (!ledger.data) return;
    await financeService.updateLedger({ ...ledger.data, categories: [...ledger.data.categories, category] });
    await client.invalidateQueries({ queryKey: ["finance", user, "ledger"] });
  };
  const today = ledgerToday(ledger.data?.timeZone ?? "UTC");
  return <CashflowContext.Provider value={{ enabled, add: () => { setError(""); setAdding(true); }, pay: (target) => { setError(""); setPlan(target); }, paySubscription }}>
    {children}
    {enabled && <Button className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 gap-2 shadow-lg lg:hidden" onClick={() => { setError(""); setAdding(true); }} aria-label={t("finance.add")}><Plus className="size-4" />{t("finance.add")}</Button>}
    <Suspense fallback={<p role="status" className="fixed right-4 bottom-20 z-50 rounded-lg border bg-background p-3 text-sm">{t("common.loading")}</p>}>
      {adding && ledger.data && <FinanceTransactionDialog initial={emptyTransaction(today)} categories={ledger.data.categories} onAddCategory={addCategory} busy={busy} error={error} onClose={() => setAdding(false)} onSave={(input) => run(() => financeService.saveTransaction(input))} />}
      {plan && ledger.data && <PlanPaymentDialog plan={plan} today={today} categories={ledger.data.categories} onAddCategory={addCategory} busy={busy} error={error} onClose={() => setPlan(null)} onSettle={(input) => run(() => financeService.settlePlan(plan.id, input))} />}
    </Suspense>
  </CashflowContext.Provider>;
}
