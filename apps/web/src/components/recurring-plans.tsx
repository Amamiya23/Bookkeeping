import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRecurringPlans } from "@/hooks/use-recurring-plans";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeErrorMessage } from "@/lib/finance-error";
import { useCashflow } from "@/components/cashflow-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInput, financeSelectClass } from "@/components/finance-fields";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { FinanceCategoryPicker } from "@/components/finance-category-picker";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { formatFinanceAmount } from "@/lib/finance-format";
import { useI18n } from "@/i18n/I18nProvider";
import Link from "@/components/router-link";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { cn } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";
import type { FinancePlan, FinancePlanInput, FinanceCategory } from "@renewlet/shared/schemas/finance";

function PlanHistory({ plan }: { plan: FinancePlan }) {
  const { t, locale, formatDateOnly } = useI18n();
  const user = getProductCurrentUserId();
  const history = useQuery({ queryKey: ["finance", user, "plan-history", plan.id], queryFn: () => financeService.transactions({ planId: plan.id, limit: "100" }) });
  const plans = useRecurringPlans();
  const payments = plans.data?.payments.filter((item) => item.planId === plan.id) ?? [];
  return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">{t("finance.paymentHistory")}</h3>
    {history.isPending && <p role="status">{t("common.loading")}</p>}{history.error && <p role="alert">{t("error.generic")}</p>}
    {payments.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
    {payments.map((payment) => { const record = history.data?.items.find((row) => row.id === payment.transactionId); return <div key={payment.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 text-sm"><span>{formatDateOnly(payment.dueOn)} · {t(payment.status === "paid" ? "finance.paid" : payment.status === "skipped" ? "finance.skipped" : "finance.pending")}{payment.reason && ` · ${payment.reason}`}</span>{record && <Link href={`/transactions?planId=${plan.id}`} className="tabular-nums underline underline-offset-4">{formatFinanceAmount(record.cnyAmount || record.amount, record.cnyAmount ? "CNY" : record.currency, locale)}</Link>}</div>; })}
  </section>;
}
function newFinancePlan(nextDue: string): FinancePlanInput {
  return { name: "", type: "bill", amount: "0", currency: "CNY", category: "builtin:housing", unit: "month", interval: 1, nextDue, endDate: "", status: "active", version: 0 };
}

export function RecurringPlans({ categories, onAddCategory, subscriptionOnly = false, initialCreateDate }: { categories: FinanceCategory[]; onAddCategory: (category: FinanceCategory) => Promise<void>; subscriptionOnly?: boolean; initialCreateDate?: string }) {
  const query = useRecurringPlans();
  const { t, locale, formatDateOnly } = useI18n();
  const cashflow = useCashflow();
  const categoryCatalog = useFinanceCategoryCatalog(categories);
  const client = useQueryClient();
  const user = getProductCurrentUserId();
  const [target, setTarget] = useState<FinancePlan | null>(null);
  const [form, setForm] = useState<FinancePlanInput | null>(() => initialCreateDate ? newFinancePlan(initialCreateDate) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (plan: FinancePlan) => { setTarget(plan); const { id: _id, ledger: _ledger, subscriptionId: _subscription, anchorDay: _anchor, paidCny: _paid, ...input } = plan; setForm(input); setError(""); };
  const update = <K extends keyof FinancePlanInput>(key: K, value: FinancePlanInput[K]) => setForm((previous) => previous && ({ ...previous, [key]: value }));
  const plans = query.data?.items.filter((plan) => !subscriptionOnly || plan.type === "subscription") ?? [];
  return <section className="space-y-4" aria-label={t("finance.plans")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{t(subscriptionOnly ? "finance.paymentHistory" : "finance.plans")}</h2>{!subscriptionOnly && <Button variant="outline" className="rounded-xl" onClick={() => { setTarget(null); setError(""); setForm(newFinancePlan(query.data?.today ?? new Date().toISOString().slice(0, 10))); }}><Plus />{t("finance.newPlan")}</Button>}</div>
    {query.isPending && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}{query.error && <p role="alert">{t("error.generic")}</p>}
    {query.data?.items.length === 0 && <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("finance.emptyPlans")}</p>}
    {plans.length > 0 && <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">{plans.map((plan) => <article key={plan.id} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-secondary/40 sm:px-5", plan.status !== "active" && "opacity-70")}>
      <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><FinanceCategoryIcon name={categoryCatalog.details(plan.category, "expense").icon} className="size-4.5" /></span><div className="min-w-0"><h3 className="font-medium wrap-break-word">{plan.name}</h3><p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"><span>{t(plan.type === "subscription" ? "finance.typeSubscription" : plan.type === "bill" ? "finance.typeBill" : "finance.typeOther")}</span><span aria-hidden="true">·</span><span className={cn(plan.status === "active" ? "text-success" : "text-muted-foreground")}>{t(plan.status === "active" ? "finance.activePlan" : plan.status === "paused" ? "finance.pausedPlan" : "finance.cancelledPlan")}</span><span aria-hidden="true">·</span><span className="tabular-nums">{formatDateOnly(plan.nextDue)}</span></p></div></div>
      <div className="ml-auto flex flex-wrap items-center gap-2"><span className="mr-1 font-semibold tabular-nums">{formatFinanceAmount(plan.amount, plan.currency, locale)}</span>{plan.status === "active" && <Button size="sm" className="rounded-lg" onClick={() => cashflow?.pay(plan)}>{t("finance.confirmPayment")}</Button>}<Button size="sm" variant="ghost" className="rounded-lg" onClick={() => edit(plan)}><Pencil />{t("common.edit")}</Button></div>
    </article>)}</div>}
    {form && <Dialog open onOpenChange={(open) => { if (!open && !busy) setForm(null); }}><DialogContent closeLabel={t("common.cancel")} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}><DialogHeader><DialogTitle>{target ? target.name : t("finance.newPlan")}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); void financeService.savePlan(form, target?.id).then(async () => { setForm(null); await Promise.all([client.invalidateQueries({ queryKey: ["finance", user] }), client.invalidateQueries({ queryKey: ["subscriptions"] })]); }).catch((cause) => setError(financeErrorMessage(cause, t))).finally(() => setBusy(false)); }}>
        <FinanceInput id="plan-name" label={t("finance.planName")} value={form.name} required onChange={(value) => update("name", value)} />
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2"><FinanceInput id="plan-amount" label={t("finance.amount")} value={form.amount} inputMode="decimal" required onChange={(value) => update("amount", value)} /><FinanceInput id="plan-currency" label={t("finance.currency")} value={form.currency} required onChange={(value) => update("currency", value.toUpperCase())} /></FormFieldRow>
        {target?.subscriptionId ? <p className="text-sm">{t("finance.category")} · {categoryCatalog.details(form.category, "expense").label}<span className="mt-1 block text-muted-foreground">{t("finance.subscriptionCategoryHint")}</span></p> : <FinanceCategoryPicker kind="expense" value={form.category} categories={categories} disabled={busy} onChange={(value) => update("category", value)} onAdd={onAddCategory} />}
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2"><FinanceInput id="plan-interval" label={t("finance.interval")} value={String(form.interval)} type="number" required onChange={(value) => update("interval", Number(value))} /><FormField id="plan-unit" label={t("finance.unit")}>{({ id }) => <select id={id} className={financeSelectClass} value={form.unit} onChange={(event) => update("unit", event.target.value as FinancePlanInput["unit"])}>{(["day", "week", "month", "year"] as const).map((unit) => <option key={unit} value={unit}>{t(unit === "day" ? "finance.unitDay" : unit === "week" ? "finance.unitWeek" : unit === "month" ? "finance.unitMonth" : "finance.unitYear")}</option>)}</select>}</FormField></FormFieldRow>
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2"><FinanceInput id="plan-date" label={t("finance.nextDue")} value={form.nextDue} type="date" required onChange={(value) => update("nextDue", value)} /><FinanceInput id="plan-end" label={t("finance.endDate")} value={form.endDate} type="date" onChange={(value) => update("endDate", value)} /></FormFieldRow>
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2"><FormField id="plan-type" label={t("finance.planType")}>{({ id }) => <select id={id} className={financeSelectClass} disabled={Boolean(target?.subscriptionId)} value={form.type} onChange={(event) => update("type", event.target.value as FinancePlanInput["type"])}>{(target?.type === "subscription" ? ["subscription", "bill", "other"] as const : ["bill", "other"] as const).map((type) => <option key={type} value={type}>{t(type === "subscription" ? "finance.typeSubscription" : type === "bill" ? "finance.typeBill" : "finance.typeOther")}</option>)}</select>}</FormField><FormField id="plan-status" label={t("finance.planStatus")}>{({ id }) => <select id={id} className={financeSelectClass} value={form.status} onChange={(event) => update("status", event.target.value as FinancePlanInput["status"])}>{(["active", "paused", "cancelled"] as const).map((status) => <option key={status} value={status}>{t(status === "active" ? "finance.activePlan" : status === "paused" ? "finance.pausedPlan" : "finance.cancelledPlan")}</option>)}</select>}</FormField></FormFieldRow>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button></div>
      </form>{target && <PlanHistory plan={target} />}
    </DialogContent></Dialog>}
  </section>;
}
