import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FinanceInput } from "@/components/finance-fields";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeFinanceInput } from "@/lib/finance-format";
import { FinanceCategoryPicker } from "@/components/finance-category-picker";
import { useFinanceCategoryCatalog } from "@/hooks/use-finance-category-catalog";
import { useManagedCurrencyOptions } from "@/hooks/use-managed-currency-options";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { cn } from "@/lib/utils";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import { clearFinanceDraft, financeEntryKey, readFinanceDraft, readFinancePreferences, rememberFinanceEntry, writeFinanceDraft } from "@/lib/finance-entry-storage";
import type { MessageKey } from "@/i18n/messages";
import { financeTransactionInputSchema, type FinanceTransactionInput, type FinanceCategory } from "@renewlet/shared/schemas/finance";

export const financeKindLabels = { expense: "finance.expense", income: "finance.income", transfer: "finance.income", refund: "finance.refund" } satisfies Record<FinanceTransactionInput["kind"], MessageKey>;

export function FinanceTransactionDialog({ initial, categories, onAddCategory, onClose, onSave, busy, error, title, expenseOnly, extras, draftId = "new", allowContinue = false, saveDisabled = false, submitLabel }: {
  initial: FinanceTransactionInput; onClose: () => void;
  categories: FinanceCategory[]; onAddCategory: (category: FinanceCategory) => Promise<void>;
  onSave: (value: FinanceTransactionInput, keepOpen?: boolean) => Promise<boolean | void>; busy: boolean; error: string;
  submitLabel?: string; title?: string; expenseOnly?: boolean; extras?: ReactNode; draftId?: string; allowContinue?: boolean; saveDisabled?: boolean;
}) {
  const { t, locale, formatDateOnly } = useI18n();
  const catalog = useFinanceCategoryCatalog(categories);
  const { config } = useCustomConfigState();
  const [storageKey] = useState(() => financeEntryKey(`draft:${draftId}`));
  const [base, setBase] = useState(() => {
    const preferences = readFinancePreferences();
    const kind = initial.kind === "income" ? "income" : "expense";
    const remembered = preferences[kind].find((value) => catalog.options(kind).some((option) => option.value === value && value !== "builtin:refund"));
    return { ...initial, currency: draftId === "new" ? preferences.currency : initial.currency,
      category: initial.category || remembered || (kind === "expense" ? "builtin:other-expense" : "builtin:other-income") };
  });
  const [draft] = useState(() => readFinanceDraft(storageKey));
  const [form, setForm] = useState(draft?.form ?? base);
  const [tagsText, setTagsText] = useState(draft?.tagsText ?? initial.tags.join(", "));
  const [validation, setValidation] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [restored, setRestored] = useState(Boolean(draft));
  const [moreOpen, setMoreOpen] = useState(Boolean(initial.version || initial.kind === "refund"));
  const dirty = JSON.stringify(form) !== JSON.stringify(base) || tagsText !== initial.tags.join(", ");
  useEffect(() => { if (dirty) writeFinanceDraft(storageKey, form, tagsText); else clearFinanceDraft(storageKey); }, [storageKey, form, tagsText, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const requestClose = () => { if (!busy) { if (dirty) setConfirmClose(true); else { clearFinanceDraft(storageKey); onClose(); } } };
  const settings = useSettings();
  const rates = useExchangeRates(settings.data?.exchangeRateProvider);
  const currencies = useManagedCurrencyOptions({ currencies: config.currencies, includeDisabledCurrent: form.currency, locale });
  const original = normalizeFinanceInput(form.amount, locale);
  const quote = !rates.loading && !rates.error && rates.sourceDate && rates.rates[form.currency] && rates.rates["CNY"] && Number(original) > 0 ? rates.convert(original, form.currency, "CNY").toFixed(2) : "";
  const cnyAmount = form.currency === "CNY" ? original : form.cnyAmount || quote;
  const refund = form.kind === "refund";
  const update = <Key extends keyof FinanceTransactionInput>(key: Key, value: FinanceTransactionInput[Key]) => setForm((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saveDisabled) return;
    const parsed = financeTransactionInputSchema.safeParse({ ...form, cnyAmount: normalizeFinanceInput(cnyAmount, locale), amount: original, tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (form.currency !== "CNY" && !cnyAmount) { setValidation(t("finance.cnyRequired")); return; }
    if (!parsed.success) { setValidation(t("finance.invalid")); return; }
    setValidation("");
    const keepOpen = allowContinue && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "continue";
    const saved = await onSave(parsed.data, keepOpen);
    if (saved === false) return;
    clearFinanceDraft(storageKey); rememberFinanceEntry(parsed.data); setRestored(false);
    if (keepOpen) {
      const next = { ...base, kind: form.kind, currency: form.currency, category: form.category, amount: "", cnyAmount: "", merchant: "", notes: "", tags: [] };
      setBase(next); setForm(next);
      setTagsText("");
      document.getElementById("finance-amount")?.focus();
    }
  };
  return <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }}>
    <DialogContent className="max-h-[94dvh] p-4 sm:max-w-2xl sm:p-6" aria-describedby={undefined} closeLabel={t("common.cancel")} onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById("finance-amount")?.focus(); }}>
      <DialogHeader className="shrink-0"><DialogTitle>{title || (refund ? t("finance.refund") : initial.version ? t("common.edit") : t("finance.add"))}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" data-testid="finance-entry-scroll"><fieldset disabled={busy} className="min-w-0 space-y-4 pb-1">
          {extras}
          {restored && <p role="status" className="text-sm text-muted-foreground">{t("finance.draftRestored")}</p>}
          {!expenseOnly && !refund && <div role="group" aria-label={t("finance.kind")} className="grid grid-cols-2 border-b">
            {(["expense", "income"] as const).map((kind) => <button type="button" key={kind} aria-pressed={form.kind === kind} className={cn("min-h-11 border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", form.kind === kind && "border-primary text-foreground")} onClick={() => {
              if (kind === form.kind) return;
              const recent = readFinancePreferences()[kind].find((value) => catalog.options(kind).some((option) => option.value === value && value !== "builtin:refund"));
              setForm((previous) => ({ ...previous, kind, category: recent || (kind === "expense" ? "builtin:other-expense" : "builtin:other-income"), counterAccount: "", refundOf: "" }));
            }}>{t(financeKindLabels[kind])}</button>)}
          </div>}
          <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
          <FinanceInput id="finance-amount" label={`${t("finance.amount")} · ${form.currency}`} value={form.amount} inputMode="decimal" required onChange={(value) => setForm((previous) => ({ ...previous, amount: value, cnyAmount: "" }))} />
          <FormField id="finance-currency" label={t("finance.currency")}>{({ id }) => <SearchableSelect id={id} value={form.currency} disabled={busy || refund} options={currencies} onValueChange={(currency) => setForm((previous) => ({ ...previous, currency, cnyAmount: "" }))} searchPlaceholder={t("subscription.search.currency")} emptyMessage={t("subscription.empty.currency")} />}</FormField>
          </FormFieldRow>
          {!refund && <FinanceCategoryPicker key={form.kind} kind={form.kind === "income" ? "income" : "expense"} value={form.category} categories={categories} disabled={busy} onChange={(value) => update("category", value)} onAdd={onAddCategory} />}
          {refund && <p className="text-sm text-muted-foreground">{t("finance.refundCategory")} {t("finance.refundLimitHint")} · {catalog.details(form.category, "expense").label}</p>}
          {form.kind === "income" && <p className="text-xs text-muted-foreground">{t("finance.refundEntryHint")}</p>}
          <FinanceInput id="finance-notes" label={t("finance.notes")} value={form.notes} onChange={(value) => update("notes", value)} />
          <details open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)} className="space-y-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">{t("finance.moreDetails")} · {form.occurredOn ? formatDateOnly(form.occurredOn) : ""} · {form.currency}</summary>
            <FinanceInput id="finance-date" label={t("finance.occurredOn")} value={form.occurredOn} type="date" required onChange={(value) => update("occurredOn", value)} />
            {!refund && <FinanceInput id="finance-merchant" label={t("finance.merchant")} value={form.merchant} onChange={(value) => update("merchant", value)} />}
            <FinanceInput id="finance-tags" label={t("finance.tags")} value={tagsText} onChange={setTagsText} />
          </details>
          {form.currency !== "CNY" && <div className="space-y-2 rounded-lg bg-muted/50 p-3"><FinanceInput id="finance-cny-amount" label={t("finance.cnyAmount")} value={cnyAmount} inputMode="decimal" required onChange={(value) => update("cnyAmount", value)} /><p className="text-xs leading-5 text-muted-foreground">{t("finance.cnyHint")}{quote && !form.cnyAmount && ` · ${rates.sourceDate}`}</p></div>}
          {(error || validation) && <p role="alert" className="text-sm text-destructive">{error || validation}</p>}
        </fieldset></div>
        {confirmClose ? <div role="alert" className="shrink-0 space-y-3 rounded-lg border p-3"><p className="text-sm">{t("finance.unsavedEntry")}</p><div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => { clearFinanceDraft(storageKey); onClose(); }}>{t("finance.discardDraft")}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmClose(false)}>{t("finance.continueEditing")}</Button>
          <Button type="button" size="sm" onClick={() => { writeFinanceDraft(storageKey, form, tagsText); onClose(); }}>{t("finance.keepDraft")}</Button>
        </div></div> : <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>{t("common.cancel")}</Button>
          {allowContinue && <Button type="submit" value="continue" variant="outline" disabled={busy || saveDisabled}>{t("finance.saveAndContinue")}</Button>}
          <Button type="submit" disabled={busy || saveDisabled}>{busy ? t("common.saving") : submitLabel || t("common.save")}</Button>
        </div>}
      </form>
    </DialogContent>
  </Dialog>;
}
