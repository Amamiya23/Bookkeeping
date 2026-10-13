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
import { FormField } from "@/components/ui/form-field";
import { FinanceEmpty, FinancePageHeader, FinanceSegmented } from "@/components/finance-ui";
import { cn } from "@/lib/utils";
import { Ban, ChevronDown, Download, History, Pencil, Plus, Search, Settings2, Undo2 } from "lucide-react";
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
  return { kind: record.kind === "transfer" ? "income" : record.kind, amount: record.amount, currency: record.currency, cnyAmount: record.cnyAmount, account: record.kind === "transfer" ? "" : record.account, counterAccount: "", occurredOn: record.occurredOn, category: record.kind === "transfer" ? "builtin:transfer" : record.category, merchant: record.merchant, tags: record.tags, notes: record.notes, refundOf: record.refundOf, externalSource: record.externalSource, externalId: record.externalId, version: record.version };
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
  // 分析页与紧邻的上一等长周期对比，例如 10/1–10/12 对比 9/19–9/30。
  const spanDays = from && to ? Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1) : 0;
  const previousTo = spanDays ? new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10) : "";
  const previousFrom = spanDays ? new Date(Date.parse(from) - spanDays * 86400000).toISOString().slice(0, 10) : "";
  const previousSummary = useQuery({ queryKey: ["finance", user, "summary", previousFrom, previousTo, filters.group], queryFn: () => financeService.summary(previousFrom, previousTo, filters.group), enabled: enabled && Boolean(ledger.data) && view === "reports" && spanDays > 0 });
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
    if (busy) return false; setBusy(true); setError("");
    try { await action(); close?.(); toast.success(t("finance.saved")); await Promise.all([queryClient.invalidateQueries({ queryKey: ["finance", user] }), queryClient.invalidateQueries({ queryKey: ["subscriptions"] })]); return true; }
    catch (cause) { setError(failure(cause)); return false; }
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
  const categoryDetails = (value: string, kind: string) => categoryCatalog.details(kind === "transfer" ? "builtin:transfer" : value, kind === "expense" || kind === "refund" ? "expense" : "income");
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
  const kindOptions = [{ value: "", label: t("finance.allSpending") }, { value: "daily", label: t("finance.dailySpending") }, { value: "recurring", label: t("finance.recurringSpend") }] as const;
  const monthStart = today.slice(0, 7) + "-01"; const yearStart = today.slice(0, 4) + "-01-01";
  const rangePreset = from === monthStart && to === today ? "month" : from === yearStart && to === today ? "year" : "";
  // 流水按入账日期分组；日期标题只做导航，不汇总金额，避免分页未加载完时显示不完整的日合计。
  const days: { date: string; items: FinanceTransaction[] }[] = [];
  for (const record of rows) {
    const last = days.at(-1);
    if (last?.date === record.occurredOn) last.items.push(record); else days.push({ date: record.occurredOn, items: [record] });
  }
  const tabClass = (active: boolean) => cn("inline-flex h-8 items-center rounded-lg px-3.5 text-sm font-medium transition-colors", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
  return <div className="app-page bg-background"><Header />
    <main className="app-main mx-auto max-w-7xl space-y-6 pb-24">
      <FinancePageHeader title={t(view === "reports" ? "finance.navAnalysis" : "finance.navBills")} actions={enabled && <Button disabled={!ready || busy} onClick={add} className="rounded-xl"><Plus />{t("finance.add")}</Button>} />
      {capabilities.isPending && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {capabilities.data && !enabled && <FinanceEmpty>{t("finance.unsupported")}</FinanceEmpty>}
      {queryError && <div role="alert" className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><p>{failure(queryError)}</p><Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["finance", user] })}>{t("finance.retry")}</Button></div>}
      {enabled && view !== "reports" && <nav className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-secondary/60 p-1" aria-label={t("finance.title")}>
        <Link href="/transactions" className={tabClass(view === "transactions")} aria-current={view === "transactions" ? "page" : undefined}>{t("finance.transactions")}</Link>
        <Link href="/transactions?view=plans" className={tabClass(view === "plans")} aria-current={view === "plans" ? "page" : undefined}>{t("finance.plans")}</Link>
      </nav>}
      {enabled && ready && view !== "plans" && <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-card sm:p-5">
        <div className={cn("grid gap-x-2.5 gap-y-3 sm:gap-3", view === "transactions" ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,14rem))_1fr]")}>
          <FinanceInput id="finance-from" label={t("finance.from")} value={from} type="date" onChange={setFrom} />
          <FinanceInput id="finance-to" label={t("finance.to")} value={to} type="date" onChange={setTo} />
          {view === "transactions" && <>
            <FormField id="finance-filter-category" label={t("finance.category")}>{({ id }) => <select id={id} className={financeSelectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">{t("common.none")}</option>
              <option value="subscription:">{t("finance.navSubscriptions")}</option>
              {(["expense", "income"] as const).map((kind) => <optgroup key={kind} label={t(financeKindLabels[kind])}>{categoryCatalog.options(kind).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}
              {[...new Set([...rows.map((row) => row.category), category])].filter((value) => value && value !== "subscription:" && ![...categoryCatalog.options("expense"), ...categoryCatalog.options("income")].some((item) => item.value === value)).map((value) => <option key={value} value={value}>{categoryDetails(value, "expense").label}</option>)}
            </select>}</FormField>
            <FormField id="finance-filter-kind" label={t("finance.kind")}>{({ id }) => <select id={id} className={financeSelectClass} value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">{t("common.none")}</option>{(["expense", "income", "refund"] as const).map((kind) => <option key={kind} value={kind}>{t(financeKindLabels[kind])}</option>)}</select>}</FormField>
            <FormField id="finance-filter-merchant" label={t("finance.merchant")} className="col-span-2 lg:col-span-1">{({ id }) => <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input id={id} type="search" className="pl-9" value={filters.merchant} onChange={(event) => setFilters({ ...filters, merchant: event.target.value })} /></div>}</FormField>
          </>}
          {view === "reports" && <div className="col-span-2 flex items-end lg:col-span-1"><FinanceSegmented label={t("finance.month")} value={rangePreset} onChange={(preset) => { setFrom(preset === "year" ? yearStart : monthStart); setTo(today); }} options={[{ value: "month", label: t("finance.month") }, { value: "year", label: t("finance.unitYear") }]} /></div>}
        </div>
        <FinanceSegmented label={t("finance.kind")} value={filters.group} onChange={(group) => setFilters({ ...filters, group })} options={kindOptions} />
      </div>}
      {enabled && ready && view === "transactions" && <section className="space-y-5" aria-label={t("finance.transactions")}>
        {transactions.isPending && <div role="status" className="space-y-2"><span className="sr-only">{t("common.loading")}</span>{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
        {rows.length === 0 && !transactions.isPending && <FinanceEmpty action={<Button variant="outline" disabled={busy} onClick={add}><Plus />{t("finance.add")}</Button>}>{t("common.noData")}</FinanceEmpty>}
        {days.map((day) => <div key={day.date}>
          <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground tabular-nums">{formatDateOnly(day.date)}</h2>
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
            {day.items.map((record) => {
              const detail = categoryDetails(record.category, record.kind);
              const incoming = record.kind === "income" || record.kind === "refund";
              const voided = record.status === "void";
              const meta = [record.merchant && record.category && record.merchant !== detail.label ? detail.label : "", record.kind === "refund" || record.kind === "transfer" || record.category === "builtin:refund" ? t(record.category === "builtin:refund" ? "finance.refund" : financeKindLabels[record.kind]) : "", ...record.tags].filter(Boolean);
              return <article key={record.id} className={cn("group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 sm:gap-4 sm:px-5", voided && "opacity-60")}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", incoming ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground")}><FinanceCategoryIcon name={detail.icon} className="size-4.5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{record.merchant || (record.category ? detail.label : t(financeKindLabels[record.kind]))}</h3>
                  {(meta.length > 0 || voided) && <p className="mt-0.5 truncate text-xs text-muted-foreground">{voided && <span className="mr-1.5 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">{t("finance.voided")}{record.voidReason && ` · ${record.voidReason}`}</span>}{meta.join(" · ")}</p>}
                  {record.notes && <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground">{record.notes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("font-semibold tabular-nums", incoming && "text-success", voided && "line-through")} title={voided ? undefined : t("finance.posted")}>{incoming && "+"}{formatCurrency(record.cnyAmount || record.amount, record.cnyAmount ? "CNY" : record.currency)}</p>
                  {record.currency !== "CNY" && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{formatCurrency(record.amount, record.currency)}{!record.cnyAmount && ` · ${t("finance.cnyRequired")}`}</p>}
                  {record.planId && <Link className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/transactions?view=plans">{t("finance.plans")}</Link>}
                </div>
                {record.status === "posted" && <div className="flex shrink-0 gap-0.5 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button size="icon" variant="ghost" className="size-8 rounded-lg text-muted-foreground" aria-label={t("common.edit")} title={t("common.edit")} disabled={busy} onClick={() => { setError(""); setTransactionForm({ id: record.id, input: transactionInput(record) }); }}><Pencil /></Button>
                  {record.kind === "expense" && <Button size="icon" variant="ghost" className="size-8 rounded-lg text-muted-foreground" aria-label={t("finance.refund")} title={t("finance.refund")} disabled={busy} onClick={() => { setError(""); setTransactionForm({ input: { ...transactionInput(record), kind: "refund", amount: "", cnyAmount: "", account: "", refundOf: record.id, occurredOn: today, notes: "", externalSource: "", externalId: "", version: 0 } }); }}><Undo2 /></Button>}
                  <Button size="icon" variant="ghost" className="size-8 rounded-lg text-muted-foreground hover:text-destructive" aria-label={t("finance.void")} title={t("finance.void")} disabled={busy} onClick={() => { setError(""); setVoidReason(""); setVoiding(record); }}><Ban /></Button>
                </div>}
              </article>;
            })}
          </div>
        </div>)}
        {transactions.hasNextPage && <div className="flex justify-center"><Button variant="outline" className="rounded-xl" disabled={transactions.isFetchingNextPage} onClick={() => void transactions.fetchNextPage()}>{t("finance.loadMore")}</Button></div>}
      </section>}
      {enabled && ready && view === "plans" && <RecurringPlans categories={customCategories} onAddCategory={addCategory} {...(params.get("action") === "new" ? { initialCreateDate: today } : {})} />}
      {enabled && ready && view === "reports" && summary.isPending && <div role="status" className="h-80 animate-pulse rounded-2xl bg-muted"><span className="sr-only">{t("common.loading")}</span></div>}
      {enabled && ready && view === "reports" && summary.data && <FinanceReport summary={summary.data} previous={previousSummary.data} categories={customCategories} group={filters.group} />}
      {error && !transactionForm && !voiding && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {enabled && ready && <details className="group/ledger rounded-2xl border border-border/80 bg-card shadow-card"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Settings2 className="size-4" />{t("finance.ledgerName")} · {t("finance.export")}</span><ChevronDown className="size-4 transition-transform group-open/ledger:rotate-180" /></summary>
        <div className="space-y-5 border-t px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{ledger.data.name} · {ledger.data.baseCurrency} · {ledger.data.timeZone}</span><Button variant="outline" size="sm" onClick={() => { setError(""); setLedgerForm(ledger.data); }}>{t("finance.ledgerName")}</Button></div>
          <div className="space-y-4">
            <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
              const snapshot = await financeService.export(); downloadFile(new Blob([JSON.stringify(snapshot)], { type: "application/json" }), "renewlet-ledger.json");
            })}><Download />{t("finance.export")}</Button>
            <FormField id="finance-restore-file" label={t("finance.restore")} description={t("finance.restoreEmpty")}>{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
              if (file.size > 8 * 1024 * 1024) { setError(t("finance.invalid")); return; }
              void file.text().then((text) => { setRestorePreview(financeSnapshotSchema.parse(JSON.parse(text))); setError(""); }).catch(() => setError(t("finance.invalid")));
            }} />}</FormField>
          </div>
          <div className="space-y-3 border-t pt-4"><Button variant="ghost" size="sm" className="-ml-3" onClick={() => setShowAudit(!showAudit)}><History />{t("finance.audit")}</Button>
            {showAudit && audit.isPending && <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>}
            {showAudit && audit.error && <p role="alert">{failure(audit.error)}</p>}
            {showAudit && audit.data?.items.map((item) => <details key={item.id} className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">{formatDateTime(item.created)} · {item.action} · {item.target}</summary><pre className="mt-3 max-h-80 overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify({ before: item.before, after: item.after }, null, 2)}</pre></details>)}
          </div>
        </div>
      </details>}
    </main>
    {transactionForm && <FinanceTransactionDialog key={transactionForm.id || transactionForm.input.refundOf || "new"} draftId={transactionForm.id ? `edit:${transactionForm.id}:${transactionForm.input.version}` : transactionForm.input.refundOf ? `refund:${transactionForm.input.refundOf}` : "new"} initial={transactionForm.input} categories={customCategories} onAddCategory={addCategory} busy={busy} error={error} onClose={() => setTransactionForm(null)} onSave={(input) => run(() => financeService.saveTransaction(input, transactionForm.id), () => setTransactionForm(null))} />}
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
