import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { FinanceTransactionDialog } from "@/components/finance-transaction-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInput, financeSelectClass } from "@/components/finance-fields";
import { FormField } from "@/components/ui/form-field";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import type { FinanceCategory, FinancePlan } from "@renewlet/shared/schemas/finance";

type Settlement = Parameters<typeof financeService.settlePlan>[1];
export function PlanPaymentDialog({ plan, today, categories, onAddCategory, busy, error, onClose, onSettle }: {
  plan: FinancePlan; today: string; categories: FinanceCategory[]; onAddCategory: (value: FinanceCategory) => Promise<void>;
  busy: boolean; error: string; onClose: () => void; onSettle: (value: Settlement) => Promise<void>;
}) {
  const { t, locale, formatDateOnly } = useI18n();
  const [mode, setMode] = useState<"pay" | "link" | "skip">("pay");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const user = getProductCurrentUserId();
  const rows = useInfiniteQuery({ queryKey: ["finance", user, "linkable", plan.id], initialPageParam: "", queryFn: ({ pageParam }) => financeService.transactions({ kind: "expense", status: "posted", group: "daily", limit: "100", cursor: pageParam }), getNextPageParam: (page) => page.nextCursor || undefined, enabled: mode === "link" });
  const records = rows.data?.pages.flatMap((page) => page.items) ?? [];
  const modes = <div className="space-y-3"><p className="text-sm text-muted-foreground">{plan.name} · {t("finance.dueOn")} {formatDateOnly(plan.nextDue)}</p><div className="flex flex-wrap gap-2">{(["pay", "link", "skip"] as const).map((value) => <Button type="button" key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} disabled={busy} onClick={() => setMode(value)}>{t(value === "pay" ? "finance.confirmPayment" : value === "link" ? "finance.linkPayment" : "finance.skipPayment")}</Button>)}</div></div>;
  if (mode === "pay") return <FinanceTransactionDialog title={t("finance.confirmPayment")} expenseOnly extras={modes} initial={{ kind: "expense", amount: Number(plan.amount) > 0 ? plan.amount : "", currency: plan.currency, cnyAmount: "", account: "", counterAccount: "", occurredOn: today, category: plan.category, merchant: plan.name, tags: [], notes: "", refundOf: "", externalSource: "", externalId: "", version: 0 }} categories={categories} onAddCategory={onAddCategory} busy={busy} error={error} onClose={onClose} onSave={(transaction) => onSettle({ action: "pay", dueOn: plan.nextDue, version: plan.version, transaction })} />;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent closeLabel={t("common.cancel")} aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.confirmPayment")}</DialogTitle></DialogHeader>{modes}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const row = records.find((item) => item.id === selected); void onSettle({ action: mode, dueOn: plan.nextDue, version: plan.version, reason, ...(row ? { transactionId: row.id, transactionVersion: row.version } : {}) }); }}>
      {mode === "link" ? <><p className="text-sm text-muted-foreground">{t("finance.linkHint")}</p><FormField id="plan-link" label={t("finance.transactions")}>{({ id }) => <select id={id} className={financeSelectClass} required value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">{t("common.none")}</option>{records.map((row) => <option key={row.id} value={row.id}>{formatDateOnly(row.occurredOn)} · {row.merchant || row.category} · {formatFinanceAmount(row.amount, row.currency, locale)}</option>)}</select>}</FormField>{rows.hasNextPage && <Button type="button" variant="outline" disabled={rows.isFetchingNextPage} onClick={() => void rows.fetchNextPage()}>{t("finance.loadMore")}</Button>}{rows.error && <p role="alert">{t("error.generic")}</p>}{rows.isPending && <p role="status">{t("common.loading")}</p>}</> : <FinanceInput id="plan-skip-reason" label={t("finance.skipReason")} value={reason} required onChange={setReason} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button><Button disabled={busy || mode === "link" && !selected}>{t("common.save")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
