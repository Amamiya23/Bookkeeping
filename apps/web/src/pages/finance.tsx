import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { Header } from "@/components/header";
import Link from "@/components/router-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinanceInput } from "@/components/finance-fields";
import { financeSelectClass } from "@/components/finance-fields";
import { FinanceAccountDialog } from "@/components/finance-account-dialog";
import { FinanceTransactionDialog, financeKindLabels } from "@/components/finance-transaction-dialog";
import { FinanceReport } from "@/components/finance-report";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { financeCategoryDetails, financeCategoryOptions } from "@/lib/finance-categories";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { downloadFile } from "@/shared/browser/download-file";
import { useI18n } from "@/i18n/I18nProvider";
import { useFinanceCapabilities, ledgerToday } from "@/hooks/use-finance";
import { useRouteReady } from "@/components/route-progress";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeErrorMessage } from "@/lib/finance-error";
import { formatFinanceAmount, normalizeFinanceInput } from "@/lib/finance-format";
import { toast } from "@/components/ui/sonner";
import { financeSnapshotSchema, type FinanceSnapshot, type FinanceAccount, type FinanceAccountInput, type FinanceTransaction, type FinanceTransactionInput } from "@renewlet/shared/schemas/finance";
import type { FinanceLedger, FinanceCategory } from "@renewlet/shared/schemas/finance";

function accountInput(account: FinanceAccount): FinanceAccountInput {
  return { name: account.name, currency: account.currency, openingBalance: account.openingBalance, openingDate: account.openingDate, archived: account.archived, version: account.version };
}
function transactionInput(record: FinanceTransaction): FinanceTransactionInput {
  return { kind: record.kind, amount: record.amount, currency: record.currency, account: record.account, counterAccount: record.counterAccount, occurredOn: record.occurredOn, category: record.category, merchant: record.merchant, tags: record.tags, notes: record.notes, refundOf: record.refundOf, externalSource: record.externalSource, externalId: record.externalId, version: record.version };
}

export default function Finance() {
  const { t, locale, formatDateOnly, formatDateTime } = useI18n();
  const formatCurrency = (amount: string, currency: string) => formatFinanceAmount(amount, currency, locale);
  const location = useLocation();
  const view = location.pathname === "/accounts" ? "accounts" : location.pathname === "/finance/statistics" ? "reports" : "transactions";
  const capabilities = useFinanceCapabilities();
  const enabled = capabilities.data?.ledger === true;
  const queryClient = useQueryClient(); const user = getProductCurrentUserId();
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled });
  const accounts = useQuery({ queryKey: ["finance", user, "accounts"], queryFn: financeService.accounts, enabled });
  const today = ledgerToday(ledger.data?.timeZone ?? "UTC");
  const [customFrom, setFrom] = useState(""); const [customTo, setTo] = useState("");
  const from = customFrom || today.slice(0, 7) + "-01"; const to = customTo || today;
  const [category, setCategory] = useState("");
  const [filters, setFilters] = useState({ account: "", kind: "", status: "", merchant: "", tag: "" });
  const transactions = useInfiniteQuery({ queryKey: ["finance", user, "transactions", from, to, category, filters], initialPageParam: "", enabled: enabled && Boolean(ledger.data),
    queryFn: ({ pageParam }) => financeService.transactions({ from, to, category, ...filters, cursor: pageParam }), getNextPageParam: (page) => page.nextCursor || undefined });
  const summary = useQuery({ queryKey: ["finance", user, "summary", from, to], queryFn: () => financeService.summary(from, to), enabled: enabled && Boolean(ledger.data) });
  const budgets = useQuery({ queryKey: ["finance", user, "budgets", from.slice(0, 7)], queryFn: () => financeService.budgets(from.slice(0, 7)), enabled: enabled && Boolean(ledger.data) });
  const [showAudit, setShowAudit] = useState(false);
  const audit = useQuery({ queryKey: ["finance", user, "audit"], queryFn: financeService.audit, enabled: enabled && showAudit });
  const [transactionForm, setTransactionForm] = useState<{ input: FinanceTransactionInput; id?: string } | null>(null);
  const [accountForm, setAccountForm] = useState<{ input: FinanceAccountInput; id?: string } | null>(null);
  const [voiding, setVoiding] = useState<FinanceTransaction | null>(null); const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [budgetAmount, setBudgetAmount] = useState("");
  const [restorePreview, setRestorePreview] = useState<FinanceSnapshot | null>(null);
  const [ledgerForm, setLedgerForm] = useState<FinanceLedger | null>(null);
  useRouteReady(capabilities.isPending || (enabled && (ledger.isPending || accounts.isPending)));

  const failure = (cause: unknown) => financeErrorMessage(cause, t);
  const run = async (action: () => Promise<unknown>, close?: () => void) => {
    if (busy) return; setBusy(true); setError("");
    try { await action(); close?.(); toast.success(t("finance.saved")); await queryClient.invalidateQueries({ queryKey: ["finance", user] }); }
    catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };
  const add = () => {
    setError(""); const account = accounts.data?.items.find((item) => !item.archived);
    if (!account) { setAccountForm({ input: { name: "", currency: ledger.data?.baseCurrency ?? "CNY", openingBalance: "0", openingDate: today, archived: false, version: 0 } }); return; }
    setTransactionForm({ input: { kind: "expense", amount: "", currency: account.currency, account: account.id, counterAccount: "", occurredOn: today, category: "", merchant: "", tags: [], notes: "", refundOf: "", externalSource: "", externalId: "", version: 0 } });
  };
  const ready = ledger.data && accounts.data;
  const customCategories = ledger.data?.categories ?? [];
  const categoryDetails = (value: string, kind: string) => financeCategoryDetails(value, kind, customCategories, t);
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
  const currentBudget = budgets.data?.items.find((item) => item.currency === ledger.data?.baseCurrency && item.category === "");
  const queryError = capabilities.error || ledger.error || accounts.error || (view === "transactions" ? transactions.error : view === "reports" ? summary.error || budgets.error : null);
  return <div className="app-page bg-background"><Header />
    <main className="app-main mx-auto max-w-5xl space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{t("finance.title")}</h1>{enabled && <Button disabled={!ready || busy} onClick={add}>{t("finance.add")}</Button>}</div>
      {capabilities.isPending && <p role="status">{t("common.loading")}</p>}
      {capabilities.data && !enabled && <p>{t("finance.unsupported")}</p>}
      {queryError && <div role="alert" className="space-y-2"><p>{failure(queryError)}</p><Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["finance", user] })}>{t("finance.retry")}</Button></div>}
      {enabled && <nav className="flex flex-wrap gap-2" aria-label={t("finance.title")}>
        <Button asChild variant={view === "transactions" ? "default" : "outline"}><Link href="/transactions">{t("finance.transactions")}</Link></Button>
        <Button asChild variant={view === "accounts" ? "default" : "outline"}><Link href="/accounts">{t("finance.accounts")}</Link></Button>
        <Button asChild variant={view === "reports" ? "default" : "outline"}><Link href="/finance/statistics">{t("finance.reports")}</Link></Button>
      </nav>}
      {enabled && ready && view !== "accounts" && <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-3">
        <FinanceInput id="finance-from" label={t("finance.from")} value={from} type="date" onChange={setFrom} />
        <FinanceInput id="finance-to" label={t("finance.to")} value={to} type="date" onChange={setTo} />
        {view === "transactions" && <FormField id="finance-filter-category" label={t("finance.category")}>{({ id }) => <select id={id} className={financeSelectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">{t("common.none")}</option>
          {(["expense", "income"] as const).map((kind) => <optgroup key={kind} label={t(financeKindLabels[kind])}>{financeCategoryOptions(kind, customCategories, t).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}
          {[...new Set([...rows.map((row) => row.category), category])].filter((value) => value && ![...financeCategoryOptions("expense", customCategories, t), ...financeCategoryOptions("income", customCategories, t)].some((item) => item.value === value)).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>}</FormField>}
      </FormFieldRow>}
      {enabled && ready && view === "transactions" && <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-3">
        <FormField id="finance-filter-account" label={t("finance.account")}>{({ id }) => <select id={id} className={financeSelectClass} value={filters.account} onChange={(event) => setFilters({ ...filters, account: event.target.value })}><option value="">{t("common.none")}</option>{accounts.data.items.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>}</FormField>
        <FormField id="finance-filter-kind" label={t("finance.kind")}>{({ id }) => <select id={id} className={financeSelectClass} value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value })}><option value="">{t("common.none")}</option>{Object.entries(financeKindLabels).map(([kind, label]) => <option key={kind} value={kind}>{t(label)}</option>)}</select>}</FormField>
        <FinanceInput id="finance-filter-merchant" label={t("finance.merchant")} value={filters.merchant} onChange={(merchant) => setFilters({ ...filters, merchant })} />
      </FormFieldRow>}
      {enabled && ready && view === "transactions" && <section className="space-y-3">
        {transactions.isPending && <p role="status">{t("common.loading")}</p>}
        {rows.length === 0 && !transactions.isPending && <p className="text-muted-foreground">{t("common.noData")}</p>}
        {rows.map((record) => <article key={record.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><FinanceCategoryIcon name={categoryDetails(record.category, record.kind).icon} /></span><div className="min-w-0"><h2 className="font-semibold wrap-break-word">{record.merchant || (record.category ? categoryDetails(record.category, record.kind).label : t(financeKindLabels[record.kind]))}</h2><p className="text-sm text-muted-foreground">{formatDateOnly(record.occurredOn)} · {accounts.data.items.find((item) => item.id === record.account)?.name} · {t(financeKindLabels[record.kind])}{record.merchant && record.category && ` · ${categoryDetails(record.category, record.kind).label}`}</p></div></div>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(record.amount, record.currency)}</p></div>
          {record.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{record.notes}</p>}
          {record.tags.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{record.tags.join(" · ")}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{record.id} · {record.status === "void" ? t("finance.voided") : t("finance.posted")}</p>
          {record.status === "posted" && <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setTransactionForm({ id: record.id, input: transactionInput(record) }); }}>{t("common.edit")}</Button>
            {record.kind === "expense" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setTransactionForm({ input: { ...transactionInput(record), kind: "refund", refundOf: record.id, amount: "", externalId: "", externalSource: "", occurredOn: today, version: 0 } }); }}>{t("finance.refund")}</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setVoidReason(""); setVoiding(record); }}>{t("finance.void")}</Button>
          </div>}
        </article>)}
        {transactions.hasNextPage && <Button variant="outline" disabled={transactions.isFetchingNextPage} onClick={() => void transactions.fetchNextPage()}>{t("finance.loadMore")}</Button>}
      </section>}
      {enabled && ready && view === "accounts" && <section className="space-y-4">
        <Button onClick={() => { setError(""); setAccountForm({ input: { name: "", currency: ledger.data.baseCurrency, openingBalance: "0", openingDate: today, archived: false, version: 0 } }); }}>{t("finance.addAccount")}</Button>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{ledger.data.name} · {ledger.data.baseCurrency} · {ledger.data.timeZone}</span><Button variant="outline" size="sm" onClick={() => { setError(""); setLedgerForm(ledger.data); }}>{t("finance.ledgerName")}</Button></div>
        {accounts.data.items.length === 0 && <p>{t("finance.emptyAccounts")}</p>}
        <div className="grid gap-4 sm:grid-cols-2">{accounts.data.items.map((account) => <article key={account.id} className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{account.name}{account.archived && <span className="ml-2 text-sm text-muted-foreground">{t("finance.archived")}</span>}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("finance.balance")}</p><p className="text-2xl font-semibold tabular-nums">{formatCurrency(account.balance, account.currency)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("finance.openingBalance")} · {formatCurrency(account.openingBalance, account.currency)} · {formatDateOnly(account.openingDate)}</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setAccountForm({ id: account.id, input: accountInput(account) }); }}>{t("common.edit")}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => financeService.saveAccount({ ...accountInput(account), archived: !account.archived }, account.id))}>{account.archived ? t("finance.restoreAccount") : t("finance.archive")}</Button></div>
        </article>)}</div>
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
      </section>}
      {enabled && ready && view === "reports" && <div className="space-y-6">
        {summary.data && <FinanceReport summary={summary.data} categories={customCategories} />}
        <section className="rounded-xl border bg-card p-4"><h2 className="text-lg font-semibold">{t("finance.budget")}</h2><p className="mt-1 text-sm text-muted-foreground">{from.slice(0, 7)} · {ledger.data.baseCurrency}</p>
          {currentBudget && <div className="my-3 space-y-2"><p>{formatCurrency(currentBudget.spent, currentBudget.currency)} / {formatCurrency(currentBudget.amount, currentBudget.currency)}</p><progress aria-label={t("finance.budget")} className="h-2 w-full accent-primary" max={100} value={Math.max(0, Math.min(100, Number(currentBudget.spent) / Number(currentBudget.amount) * 100))} /><p>{t("finance.remaining")} · {formatCurrency(currentBudget.remaining, currentBudget.currency)}</p></div>}
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => financeService.saveBudget({ month: from.slice(0, 7), currency: ledger.data.baseCurrency, category: "", amount: normalizeFinanceInput(budgetAmount, locale), version: currentBudget?.version ?? 0 })); }}>
            <FinanceInput id="finance-budget" label={t("finance.amount")} value={budgetAmount} inputMode="decimal" required onChange={setBudgetAmount} /><Button disabled={busy}>{t("common.save")}</Button>
          </form>
        </section>
      </div>}
      {error && !transactionForm && !accountForm && !voiding && <p role="alert" className="text-destructive">{error}</p>}
      {enabled && <section className="space-y-3"><Button variant="outline" onClick={() => setShowAudit(!showAudit)}>{t("finance.audit")}</Button>
        {showAudit && audit.isPending && <p role="status">{t("common.loading")}</p>}
        {showAudit && audit.error && <p role="alert">{failure(audit.error)}</p>}
        {showAudit && audit.data?.items.map((item) => <details key={item.id} className="rounded-lg border p-3 text-sm"><summary>{formatDateTime(item.created)} · {item.action} · {item.target}</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap">{JSON.stringify({ before: item.before, after: item.after }, null, 2)}</pre></details>)}
      </section>}
      {enabled && ready && <Button className="fixed right-5 bottom-6 z-40 shadow-lg lg:hidden" onClick={add} disabled={busy}>{t("finance.add")}</Button>}
    </main>
    {transactionForm && <FinanceTransactionDialog initial={transactionForm.input} accounts={accounts.data?.items ?? []} categories={customCategories} onAddCategory={addCategory} busy={busy} error={error} onClose={() => setTransactionForm(null)} onSave={(input) => run(() => financeService.saveTransaction(input, transactionForm.id), () => setTransactionForm(null))} />}
    {accountForm && <FinanceAccountDialog initial={accountForm.input} busy={busy} error={error} onClose={() => setAccountForm(null)} onSave={(input) => run(() => financeService.saveAccount(input, accountForm.id), () => setAccountForm(null))} />}
    {restorePreview && <Dialog open onOpenChange={(open) => { if (!open && !busy) setRestorePreview(null); }}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{t("finance.restore")}</DialogTitle></DialogHeader>
      <p>{restorePreview.ledger.name} · {restorePreview.ledger.baseCurrency}</p><p>{t("finance.accounts")} · {restorePreview.accounts.length} · {t("finance.transactions")} · {restorePreview.transactions.length}</p>
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
