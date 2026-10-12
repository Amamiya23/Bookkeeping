import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormFieldRow } from "@/components/ui/form-field";
import { FinanceInput } from "@/components/finance-fields";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeFinanceInput } from "@/lib/finance-format";
import { FinanceCategoryPicker } from "@/components/finance-category-picker";
import { cn } from "@/lib/utils";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettings } from "@/hooks/use-settings";
import type { MessageKey } from "@/i18n/messages";
import { financeTransactionInputSchema, type FinanceTransactionInput, type FinanceCategory } from "@renewlet/shared/schemas/finance";

export const financeKindLabels = { expense: "finance.expense", income: "finance.income", transfer: "finance.income", refund: "finance.income" } satisfies Record<FinanceTransactionInput["kind"], MessageKey>;

export function FinanceTransactionDialog({ initial, categories, onAddCategory, onClose, onSave, busy, error, title, expenseOnly, extras }: {
  initial: FinanceTransactionInput; onClose: () => void;
  categories: FinanceCategory[]; onAddCategory: (category: FinanceCategory) => Promise<void>;
  onSave: (value: FinanceTransactionInput) => Promise<void>; busy: boolean; error: string;
  title?: string; expenseOnly?: boolean; extras?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState(() => ({ ...initial, category: initial.category || (!initial.version && initial.kind === "expense" ? "builtin:meals" : !initial.version && initial.kind === "income" ? "builtin:salary" : "") }));
  const [validation, setValidation] = useState("");
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const settings = useSettings();
  const rates = useExchangeRates(settings.data?.exchangeRateProvider);
  const original = normalizeFinanceInput(form.amount, locale);
  const quote = !rates.loading && !rates.error && rates.sourceDate && rates.rates[form.currency] && rates.rates["CNY"] && Number(original) > 0 ? rates.convert(original, form.currency, "CNY").toFixed(2) : "";
  const cnyAmount = form.currency === "CNY" ? original : form.cnyAmount || quote;
  const update = <Key extends keyof FinanceTransactionInput>(key: Key, value: FinanceTransactionInput[Key]) => setForm((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = financeTransactionInputSchema.safeParse({ ...form, cnyAmount: normalizeFinanceInput(cnyAmount, locale), amount: original, tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (form.currency !== "CNY" && !cnyAmount) { setValidation(t("finance.cnyRequired")); return; }
    if (!parsed.success) { setValidation(t("finance.invalid")); return; }
    setValidation(""); await onSave(parsed.data);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[94dvh] p-4 sm:max-w-2xl sm:p-6" aria-describedby={undefined} closeLabel={t("common.cancel")}>
      <DialogHeader><DialogTitle>{title || (initial.version ? t("common.edit") : t("finance.add"))}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-1">
        {extras}
        {!expenseOnly && <div role="group" aria-label={t("finance.kind")} className="grid grid-cols-2 border-b">
          {(["expense", "income"] as const).map((value) => <button type="button" key={value} aria-pressed={form.kind === value} disabled={busy} className={cn("min-h-11 border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", form.kind === value && "border-primary text-foreground")} onClick={() => {
            const kind = financeTransactionInputSchema.shape.kind.parse(value);
            if (kind === form.kind) return;
            setForm((previous) => ({ ...previous, kind, category: kind === "expense" ? "builtin:meals" : kind === "income" ? "builtin:salary" : "", counterAccount: "", refundOf: "" }));
          }}>{t(financeKindLabels[value])}</button>)}
        </div>}
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
          <FinanceInput id="finance-amount" label={t("finance.amount")} value={form.amount} inputMode="decimal" required onChange={(value) => setForm((previous) => ({ ...previous, amount: value, cnyAmount: "" }))} />
          <FinanceInput id="finance-date" label={t("finance.occurredOn")} value={form.occurredOn} type="date" required onChange={(value) => update("occurredOn", value)} />
        </FormFieldRow>
        <FinanceInput id="finance-currency" label={t("finance.currency")} value={form.currency} required onChange={(value) => setForm((previous) => ({ ...previous, currency: value.toUpperCase(), cnyAmount: "" }))} />
        {form.currency !== "CNY" && <div className="space-y-2 rounded-lg bg-muted/50 p-3"><FinanceInput id="finance-cny-amount" label={t("finance.cnyAmount")} value={cnyAmount} inputMode="decimal" required onChange={(value) => update("cnyAmount", value)} /><p className="text-xs leading-5 text-muted-foreground">{t("finance.cnyHint")}{quote && !form.cnyAmount && ` · ${rates.sourceDate}`}</p></div>}
        {(form.kind === "income" || form.kind === "expense") && <FinanceCategoryPicker key={form.kind} kind={form.kind} value={form.category} categories={categories} disabled={busy} onChange={(value) => update("category", value)} onAdd={onAddCategory} />}
        <FinanceInput id="finance-notes" label={t("finance.notes")} value={form.notes} onChange={(value) => update("notes", value)} />
        <details className="space-y-3"><summary className="cursor-pointer text-sm text-muted-foreground">{t("finance.moreDetails")}</summary>
          <FinanceInput id="finance-merchant" label={t("finance.merchant")} value={form.merchant} onChange={(value) => update("merchant", value)} />
          <FinanceInput id="finance-tags" label={t("finance.tags")} value={tagsText} onChange={setTagsText} />
        </details>
        {(error || validation) && <p role="alert" className="text-sm text-destructive">{error || validation}</p>}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
