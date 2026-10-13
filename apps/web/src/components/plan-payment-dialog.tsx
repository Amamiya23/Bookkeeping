import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { FinanceTransactionDialog } from "@/components/finance-transaction-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInput } from "@/components/finance-fields";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { useI18n } from "@/i18n/I18nProvider";
import { formatFinanceAmount } from "@/lib/finance-format";
import { paymentMatchScore } from "@/lib/finance-payment-matches";
import type { FinanceCategory, FinancePlan, FinanceTransaction } from "@renewlet/shared/schemas/finance";

type Settlement = Parameters<typeof financeService.settlePlan>[1];
export function PlanPaymentDialog({ plan, today, categories, onAddCategory, busy, error, onClose, onSettle }: {
  plan: FinancePlan; today: string; categories: FinanceCategory[]; onAddCategory: (value: FinanceCategory) => Promise<void>;
  busy: boolean; error: string; onClose: () => void; onSettle: (value: Settlement) => Promise<boolean | void>;
}) {
  const { t, locale, formatDateOnly } = useI18n();
  const catalog = useFinanceCategoryCatalog(categories);
  const [mode, setMode] = useState<"pay" | "link" | "skip">("pay");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const user = getProductCurrentUserId();
  // Search around both the planned date and today's payment. The manual picker
  // still lets users load older bills outside this recommendation window.
  const from = new Date(Math.min(Date.parse(plan.nextDue), Date.parse(today)) - 14 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Math.max(Date.parse(plan.nextDue), Date.parse(today)) + 14 * 86400000).toISOString().slice(0, 10);
  const candidates = useInfiniteQuery({ queryKey: ["finance", user, "payment-matches", plan.id, from, to], initialPageParam: "", queryFn: ({ pageParam }) => financeService.transactions({ kind: "expense", status: "posted", group: "daily", from, to, limit: "100", cursor: pageParam }), getNextPageParam: (page) => page.nextCursor || undefined });
  const rows = useInfiniteQuery({ queryKey: ["finance", user, "linkable", plan.id], initialPageParam: "", queryFn: ({ pageParam }) => financeService.transactions({ kind: "expense", status: "posted", group: "daily", limit: "100", cursor: pageParam }), getNextPageParam: (page) => page.nextCursor || undefined, enabled: mode === "link" });
  const matches = (candidates.data?.pages.flatMap((page) => page.items) ?? []).map((row) => ({ row, score: paymentMatchScore(plan, row, today) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map(({ row }) => row);
  const records = [...new Map([...matches, ...(rows.data?.pages.flatMap((page) => page.items) ?? [])].filter((row) => !row.planId).map((row) => [row.id, row])).values()];
  const label = (row: FinanceTransaction) => `${formatDateOnly(row.occurredOn)} · ${row.merchant || catalog.details(row.category, "expense").label} · ${formatFinanceAmount(row.amount, row.currency, locale)}`;
  const modes = <div className="space-y-3"><p className="text-sm text-muted-foreground">{plan.name} · {t("finance.dueOn")} {formatDateOnly(plan.nextDue)}</p><div className="flex flex-wrap gap-2">{(["pay", "link", "skip"] as const).map((value) => <Button type="button" key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} disabled={busy} onClick={() => setMode(value)}>{t(value === "pay" ? "finance.confirmPayment" : value === "link" ? "finance.linkPayment" : "finance.skipPayment")}</Button>)}</div></div>;
  const warning = <>
    {candidates.isPending && <p role="status" className="text-sm text-muted-foreground">{t("finance.checkingPayments")}</p>}
    {(matches.length > 0 || candidates.error) && <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <p className="text-sm">{t(candidates.error ? "finance.paymentCheckFailed" : "finance.possiblePayments")}</p>
      {matches.slice(0, 3).map((row) => <Button key={row.id} type="button" variant="outline" className="h-auto w-full justify-start py-2 text-left whitespace-normal" onClick={() => { setSelected(row.id); setMode("link"); }}>{label(row)} · {t("finance.linkPayment")}</Button>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />{t("finance.confirmNewPayment")}</label>
    </div>}
    {candidates.hasNextPage && <Button type="button" variant="ghost" size="sm" disabled={candidates.isFetchingNextPage} onClick={() => void candidates.fetchNextPage()}>{t("finance.morePaymentCandidates")}</Button>}
  </>;
  if (mode === "pay") return <FinanceTransactionDialog draftId={`payment:${plan.id}:${plan.nextDue}:${plan.version}`} title={t("finance.confirmPayment")} expenseOnly extras={<>{modes}{warning}</>} saveDisabled={candidates.isPending || candidates.isFetchingNextPage || Boolean(matches.length || candidates.error) && !acknowledged} initial={{ kind: "expense", amount: Number(plan.amount) > 0 ? plan.amount : "", currency: plan.currency, cnyAmount: "", account: "", counterAccount: "", occurredOn: today, category: plan.category, merchant: plan.name, tags: [], notes: "", refundOf: "", externalSource: "", externalId: "", version: 0 }} categories={categories} onAddCategory={onAddCategory} busy={busy} error={error} onClose={onClose} onSave={(transaction) => onSettle({ action: "pay", dueOn: plan.nextDue, version: plan.version, transaction })} />;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent dismissMode="explicit" closeLabel={t("common.cancel")} className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.confirmPayment")}</DialogTitle></DialogHeader>{modes}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (busy) return; const row = records.find((item) => item.id === selected); void onSettle({ action: mode, dueOn: plan.nextDue, version: plan.version, reason, ...(row ? { transactionId: row.id, transactionVersion: row.version } : {}) }); }}>
      {mode === "link" ? <>
        <p className="text-sm text-muted-foreground">{t("finance.linkHint")}</p>
        <FinanceInput id="plan-search" label={t("finance.searchPayments")} value={search} onChange={setSearch} />
        <fieldset disabled={busy} className="max-h-64 space-y-2 overflow-y-auto"><legend className="sr-only">{t("finance.transactions")}</legend>
          {records.filter((row) => `${label(row)} ${row.notes}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((row) => <label key={row.id} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm"><input type="radio" name="linked-transaction" value={row.id} checked={selected === row.id} onChange={() => setSelected(row.id)} className="mt-1" /><span>{label(row)}{matches.some((item) => item.id === row.id) && <span className="mt-1 block text-xs text-primary">{t("finance.recommendedPayment")}</span>}</span></label>)}
        </fieldset>
        {rows.hasNextPage && <Button type="button" variant="outline" disabled={rows.isFetchingNextPage} onClick={() => void rows.fetchNextPage()}>{t("finance.loadMore")}</Button>}
        {rows.error && <p role="alert">{t("error.generic")}</p>}{rows.isPending && <p role="status">{t("common.loading")}</p>}
        {!rows.isPending && records.length === 0 && <p className="text-sm text-muted-foreground">{t("common.noData")}</p>}
      </> : <FinanceInput id="plan-skip-reason" label={t("finance.skipReason")} value={reason} required onChange={setReason} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button><Button disabled={busy || mode === "link" && !selected}>{t("common.save")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
