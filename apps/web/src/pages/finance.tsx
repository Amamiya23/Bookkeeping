import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { Header } from "@/components/header";
import Link from "@/components/router-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinanceInput } from "@/components/finance-fields";
import { financeSelectClass } from "@/components/finance-fields";
import { FinanceTransactionDialog, financeKindLabels } from "@/components/finance-transaction-dialog";
import { FinanceReport } from "@/components/finance-report";
import { RecurringPlans } from "@/components/recurring-plans";
import { useCashflow } from "@/components/cashflow-context";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { downloadFile } from "@/shared/browser/download-file";
import { useI18n } from "@/i18n/I18nProvider";
import { useFinanceCapabilities, ledgerToday } from "@/hooks/use-finance";
import { useRouteReady } from "@/components/route-progress";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeErrorMessage } from "@/lib/finance-error";
import { formatFinanceAmount } from "@/lib/finance-format";
import { toast } from "@/components/ui/sonner";
import { financeSnapshotSchema, type FinanceSnapshot, type FinanceTransaction, type FinanceTransactionInput } from "@renewlet/shared/schemas/finance";
import type { FinanceLedger, FinanceCategory } from "@renewlet/shared/schemas/finance";

function transactionInput(record: FinanceTransaction): FinanceTransactionInput {
  return { kind: record.kind === "expense" ? "expense" : "income", amount: record.amount, currency: record.currency, cnyAmount: record.cnyAmount, account: "", counterAccount: "", occurredOn: record.occurredOn, category: record.kind === "refund" ? "builtin:refund" : record.kind === "transfer" ? "builtin:transfer" : record.category, merchant: record.merchant, tags: record.tags, notes: record.notes, refundOf: "", externalSource: record.externalSource, externalId: record.externalId, version: record.version };
}

export default function Finance() {
  const location = useLocation();
  return <FinanceScreen key={location.pathname + location.search} />;
}

function FinanceScreen() {
  const { t, locale, formatDateOnly, formatDateTime } = useI18n();
  const formatCurrency = (amount: string, currency: string) => formatFinanceAmount(amount, currency, locale);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const view = location.pathname === "/statistics" ? "reports" : params.get("view") === "plans" ? "plans" : "transactions";
  const cashflow = useCashflow();
  const capabilities = useFinanceCapabilities();
  const enabled = capabilities.data?.ledger === true;
  const queryClient = useQueryClient(); const user = getProductCurrentUserId();
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled });
  const today = ledgerToday(ledger.data?.timeZone ?? "UTC");
  const [customFrom, setFrom] = useState(""); const [customTo, setTo] = useState("");
  const from = customFrom || params.get("from") || (params.get("planId") && view === "transactions" ? "" : today.slice(0, 7) + "-01"); const to = customTo || params.get("to") || today;
  const [category, setCategory] = useState(params.get("category") || "");
  const [filters, setFilters] = useState({ kind: "", status: "", merchant: params.get("merchant") || "", tag: "", group: params.get("group") || "", planId: params.get("planId") || "" });
  const transactions = useInfiniteQuery({ queryKey: ["finance", user, "transactions", from, to, category, filters], initialPageParam: "", enabled: enabled && Boolean(ledger.data),
    queryFn: ({ pageParam }) => financeService.transactions({ from, to, category, ...filters, cursor: pageParam }), getNextPageParam: (page) => page.nextCursor || undefined });
  const summary = useQuery({ queryKey: ["finance", user, "summary", from, to, filters.group], queryFn: () => financeService.summary(from, to, filters.group), enabled: enabled && Boolean(ledger.data) && view === "reports" });
  const [showAudit, setShowAudit] = useState(false);
  const audit = useQuery({ queryKey: ["finance", user, "audit"], queryFn: financeService.audit, enabled: enabled && showAudit });
  const [transactionForm, setTransactionForm] = useState<{ input: FinanceTransactionInput; id?: string } | null>(null);
  const [voiding, setVoiding] = useState<FinanceTransaction | null>(null); const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [restorePreview, setRestorePreview] = useState<FinanceSnapshot | null>(null);
  const [ledgerForm, setLedgerForm] = useState<FinanceLedger | null>(null);
  useRouteReady(capabilities.isPending || (enabled && ledger.isPending));

  const failure = (cause: unknown) => financeErrorMessage(cause, t);
  const run = async (action: () => Promise<unknown>, close?: () => void) => {
    if (busy) return; setBusy(true); setError("");
    try { await action(); close?.(); toast.success(t("finance.saved")); await Promise.all([queryClient.invalidateQueries({ queryKey: ["finance", user] }), queryClient.invalidateQueries({ queryKey: ["subscriptions"] })]); }
    catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };
  const add = () => {
    if (cashflow?.enabled) { cashflow.add(); return; }
    setError("");
    setTransactionForm({ input: { kind: "expense", amount: "", currency: "CNY", cnyAmount: "", account: "", counterAccount: "", occurredOn: today, category: "", merchant: "", tags: [], notes: "", refundOf: "", externalSource: "", externalId: "", version: 0 } });
  };
  const ready = ledger.data;
  const customCategories = ledger.data?.categories ?? [];
  const categoryCatalog = useFinanceCategoryCatalog(customCategories);
  const categoryDetails = (value: string, kind: string) => categoryCatalog.details(kind === "refund" ? "builtin:refund" : kind === "transfer" ? "builtin:transfer" : value, kind === "expense" ? "expense" : "income");
  const addCategory = async (item: FinanceCategory) => {
    if (!ledger.data || busy) throw new Error(t("finance.retry"));
    setBusy(true);
    try {
      const updated = await financeService.updateLedger({ ...ledger.data, categories: [...customCategories, item] });
      queryClient.setQueryData(["finance", user, "ledger"], updated);
      await queryClient.invalidateQueries({ queryKey: ["finance", user, "ledger"] });
    } catch (cause) { throw new Error(failure(cause), { cause }); }
    finally { setBusy(false); }
  };
  const rows = transactions.data?.pages.flatMap((page) => page.items) ?? [];
  const queryError = capabilities.error || ledger.error || (view === "transactions" ? transactions.error : summary.error);
  return <div className="app-page bg-background"><Header />
    <main className="app-main mx-auto max-w-5xl space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{t(view === "reports" ? "finance.navAnalysis" : "finance.navBills")}</h1>{enabled && <Button disabled={!ready || busy} onClick={add}>{t("finance.add")}</Button>}</div>
      {capabilities.isPending && <p role="status">{t("common.loading")}</p>}
      {capabilities.data && !enabled && <p>{t("finance.unsupported")}</p>}
      {queryError && <div role="alert" className="space-y-2"><p>{failure(queryError)}</p><Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["finance", user] })}>{t("finance.retry")}</Button></div>}
      {enabled && view !== "reports" && <nav className="flex flex-wrap gap-2" aria-label={t("finance.title")}>
        <Button asChild variant={view === "transactions" ? "default" : "outline"}><Link href="/transactions">{t("finance.transactions")}</Link></Button>
        <Button asChild variant={view === "plans" ? "default" : "outline"}><Link href="/transactions?view=plans">{t("finance.plans")}</Link></Button>
      </nav>}
      {enabled && ready && view !== "plans" && <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-3">
        <FinanceInput id="finance-from" label={t("finance.from")} value={from} type="date" onChange={setFrom} />
        <FinanceInput id="finance-to" label={t("finance.to")} value={to} type="date" onChange={setTo} />
        {view === "transactions" && <FormField id="finance-filter-category" label={t("finance.category")}>{({ id }) => <select id={id} className={financeSelectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">{t("common.none")}</option>
          <option value="subscription:">{t("finance.navSubscriptions")}</option>
          {(["expense", "income"] as const).map((kind) => <optgroup key={kind} label={t(financeKindLabels[kind])}>{categoryCatalog.options(kind).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}
          {[...new Set([...rows.map((row) => row.category), category])].filter((value) => value && value !== "subscription:" && ![...categoryCatalog.options("expense"), ...categoryCatalog.options("income")].some((item) => item.value === value)).map((value) => <option key={value} value={value}>{categoryDetails(value, "expense").label}</option>)}
        </select>}</FormField>}
      </FormFieldRow>}
      {enabled && ready && view === "transactions" && <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-3">
        <FormField id="finance-filter-kind" label={t("finance.kind")}>{({ id }) => <select id={id} className={financeSelectClass} value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">{t("common.none")}</option>{(["expense", "income"] as const).map((kind) => <option key={kind} value={kind}>{t(financeKindLabels[kind])}</option>)}</select>}</FormField>
        <FinanceInput id="finance-filter-merchant" label={t("finance.merchant")} value={filters.merchant} onChange={(merchant) => setFilters({ ...filters, merchant })} />
      </FormFieldRow>}
      {enabled && ready && view !== "plans" && <div className="flex flex-wrap gap-2">{(["", "daily", "recurring"] as const).map((group) => <Button key={group} size="sm" variant={filters.group === group ? "secondary" : "ghost"} onClick={() => setFilters({ ...filters, group })}>{t(group === "" ? "finance.allSpending" : group === "daily" ? "finance.dailySpending" : "finance.recurringSpend")}</Button>)}{view === "reports" && <><Button size="sm" variant="outline" onClick={() => { setFrom(today.slice(0, 7) + "-01"); setTo(today); }}>{t("finance.month")}</Button><Button size="sm" variant="outline" onClick={() => { setFrom(today.slice(0, 4) + "-01-01"); setTo(today); }}>{t("finance.unitYear")}</Button></>}</div>}
      {enabled && ready && view === "transactions" && <section className="space-y-3">
        {transactions.isPending && <p role="status">{t("common.loading")}</p>}
        {rows.length === 0 && !transactions.isPending && <p className="text-muted-foreground">{t("common.noData")}</p>}
        {rows.map((record) => <article key={record.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><FinanceCategoryIcon name={categoryDetails(record.category, record.kind).icon} /></span><div className="min-w-0"><h2 className="font-semibold wrap-break-word">{record.merchant || (record.category ? categoryDetails(record.category, record.kind).label : t(financeKindLabels[record.kind]))}</h2><p className="text-sm text-muted-foreground">{formatDateOnly(record.occurredOn)} · {t(financeKindLabels[record.kind])}{record.merchant && record.category && ` · ${categoryDetails(record.category, record.kind).label}`}</p></div></div>
            <div className="text-right"><p className="text-lg font-semibold tabular-nums">{formatCurrency(record.cnyAmount || record.amount, record.cnyAmount ? "CNY" : record.currency)}</p>{record.currency !== "CNY" && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatCurrency(record.amount, record.currency)}{!record.cnyAmount && ` · ${t("finance.cnyRequired")}`}</p>}{record.planId && <Link className="text-xs text-muted-foreground underline" href="/transactions?view=plans">{t("finance.plans")}</Link>}</div></div>
          {record.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{record.notes}</p>}
          {record.tags.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{record.tags.join(" · ")}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{record.status === "void" ? t("finance.voided") : t("finance.posted")}{record.voidReason && ` · ${record.voidReason}`}</p>
          {record.status === "posted" && <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setTransactionForm({ id: record.id, input: transactionInput(record) }); }}>{t("common.edit")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setVoidReason(""); setVoiding(record); }}>{t("finance.void")}</Button>
          </div>}
        </article>)}
        {transactions.hasNextPage && <Button variant="outline" disabled={transactions.isFetchingNextPage} onClick={() => void transactions.fetchNextPage()}>{t("finance.loadMore")}</Button>}
      </section>}
      {enabled && ready && view === "plans" && <RecurringPlans categories={customCategories} onAddCategory={addCategory} />}
      {enabled && ready && view === "reports" && summary.isPending && <p role="status">{t("common.loading")}</p>}
      {enabled && ready && view === "reports" && summary.data && <FinanceReport summary={summary.data} categories={customCategories} group={filters.group} />}
      {enabled && ready && <details className="space-y-4 border-t pt-4"><summary className="cursor-pointer text-sm text-muted-foreground">{t("finance.ledgerName")} · {t("finance.export")}</summary>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{ledger.data.name} · {ledger.data.baseCurrency} · {ledger.data.timeZone}</span><Button variant="outline" size="sm" onClick={() => { setError(""); setLedgerForm(ledger.data); }}>{t("finance.ledgerName")}</Button></div>
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const snapshot = await financeService.export(); downloadFile(new Blob([JSON.stringify(snapshot)], { type: "application/json" }), "renewlet-ledger.json");
          })}>{t("finance.export")}</Button>
          <FormField id="finance-restore-file" label={t("finance.restore")} description={t("finance.restoreEmpty")}>{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            if (file.size > 8 * 1024 * 1024) { setError(t("finance.invalid")); return; }
            void file.text().then((text) => { setRestorePreview(financeSnapshotSchema.parse(JSON.parse(text))); setError(""); }).catch(() => setError(t("finance.invalid")));
          }} />}</FormField>
        </div>
      </details>}
      {error && !transactionForm && !voiding && <p role="alert" className="text-destructive">{error}</p>}
      {enabled && <section className="space-y-3"><Button variant="outline" onClick={() => setShowAudit(!showAudit)}>{t("finance.audit")}</Button>
        {showAudit && audit.isPending && <p role="status">{t("common.loading")}</p>}
        {showAudit && audit.error && <p role="alert">{failure(audit.error)}</p>}
        {showAudit && audit.data?.items.map((item) => <details key={item.id} className="rounded-lg border p-3 text-sm"><summary>{formatDateTime(item.created)} · {item.action} · {item.target}</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap">{JSON.stringify({ before: item.before, after: item.after }, null, 2)}</pre></details>)}
      </section>}
    </main>
    {transactionForm && <FinanceTransactionDialog initial={transactionForm.input} categories={customCategories} onAddCategory={addCategory} busy={busy} error={error} onClose={() => setTransactionForm(null)} onSave={(input) => run(() => financeService.saveTransaction(input, transactionForm.id), () => setTransactionForm(null))} />}
    {restorePreview && <Dialog open onOpenChange={(open) => { if (!open && !busy) setRestorePreview(null); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.restore")}</DialogTitle></DialogHeader>
      <p>{restorePreview.ledger.name} · {restorePreview.ledger.baseCurrency}</p><p>{t("finance.transactions")} · {restorePreview.transactions.length}</p>
      <p className="text-sm text-muted-foreground">{t("finance.restoreEmpty")}</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button disabled={busy} onClick={() => void run(() => financeService.restore(restorePreview), () => setRestorePreview(null))}>{t("finance.restore")}</Button>
    </DialogContent></Dialog>}
    {ledgerForm && <Dialog open onOpenChange={(open) => { if (!open && !busy) setLedgerForm(null); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.title")}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(() => financeService.updateLedger(ledgerForm), () => setLedgerForm(null)); }}>
        <FinanceInput id="finance-ledger-name" label={t("finance.ledgerName")} value={ledgerForm.name} required onChange={(name) => setLedgerForm({ ...ledgerForm, name })} />
        <FinanceInput id="finance-ledger-currency" label={t("finance.currency")} value={ledgerForm.baseCurrency} required onChange={(baseCurrency) => setLedgerForm({ ...ledgerForm, baseCurrency: baseCurrency.toUpperCase() })} />
        <FinanceInput id="finance-ledger-zone" label={t("finance.timeZone")} value={ledgerForm.timeZone} required onChange={(timeZone) => setLedgerForm({ ...ledgerForm, timeZone })} />
        {error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy}>{t("common.save")}</Button>
      </form>
    </DialogContent></Dialog>}
    {voiding && <Dialog open onOpenChange={(open) => { if (!open && !busy) setVoiding(null); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.void")}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(() => financeService.voidTransaction(voiding.id, voiding.version, voidReason), () => setVoiding(null)); }}>
        <FinanceInput id="finance-void-reason" label={t("finance.voidReason")} value={voidReason} required onChange={setVoidReason} />{error && <p role="alert">{error}</p>}<Button disabled={busy}>{t("finance.void")}</Button>
      </form>
    </DialogContent></Dialog>}
  </div>;
}
