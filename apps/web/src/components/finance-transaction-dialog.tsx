import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { FinanceInput, financeSelectClass } from "@/components/finance-fields";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeFinanceInput } from "@/lib/finance-format";
import { FinanceCategoryPicker } from "@/components/finance-category-picker";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { financeCategoryDetails } from "@/lib/finance-categories";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/i18n/messages";
import { financeTransactionInputSchema, type FinanceAccount, type FinanceTransactionInput, type FinanceCategory } from "@renewlet/shared/schemas/finance";

export const financeKindLabels = { expense: "finance.expense", income: "finance.income", transfer: "finance.transfer", refund: "finance.refund" } satisfies Record<FinanceTransactionInput["kind"], MessageKey>;

export function FinanceTransactionDialog({ initial, accounts, categories, onAddCategory, onClose, onSave, busy, error }: {
  initial: FinanceTransactionInput; accounts: FinanceAccount[]; onClose: () => void;
  categories: FinanceCategory[]; onAddCategory: (category: FinanceCategory) => Promise<void>;
  onSave: (value: FinanceTransactionInput) => Promise<void>; busy: boolean; error: string;
}) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState(() => ({ ...initial, category: initial.category || (!initial.version && initial.kind === "expense" ? "builtin:meals" : !initial.version && initial.kind === "income" ? "builtin:salary" : "") }));
  const [validation, setValidation] = useState("");
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const update = <Key extends keyof FinanceTransactionInput>(key: Key, value: FinanceTransactionInput[Key]) => setForm((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = financeTransactionInputSchema.safeParse({ ...form, amount: normalizeFinanceInput(form.amount, locale), tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (!parsed.success) { setValidation(t("finance.invalid")); return; }
    setValidation(""); await onSave(parsed.data);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[94dvh] p-4 sm:max-w-2xl sm:p-6" aria-describedby={undefined} closeLabel={t("common.cancel")}>
      <DialogHeader><DialogTitle>{initial.version ? t("common.edit") : t("finance.add")}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-1">
        <div role="group" aria-label={t("finance.kind")} className="grid grid-cols-4 border-b">
          {Object.entries(financeKindLabels).map(([value, label]) => <button type="button" key={value} aria-pressed={form.kind === value} disabled={busy} className={cn("min-h-11 border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", form.kind === value && "border-primary text-foreground")} onClick={() => {
            const kind = financeTransactionInputSchema.shape.kind.parse(value);
            if (kind === form.kind) return;
            setForm((previous) => ({ ...previous, kind, category: kind === "expense" ? "builtin:meals" : kind === "income" ? "builtin:salary" : "", counterAccount: "", refundOf: "" }));
          }}>{t(label)}</button>)}
        </div>
        {(form.kind === "income" || form.kind === "expense") && <FinanceCategoryPicker key={form.kind} kind={form.kind} value={form.category} categories={categories} disabled={busy} onChange={(value) => update("category", value)} onAdd={onAddCategory} />}
        {form.kind === "refund" && <div className="flex items-center gap-2 text-sm"><FinanceCategoryIcon name={financeCategoryDetails(form.category, "expense", categories, t).icon} /><span>{financeCategoryDetails(form.category, "expense", categories, t).label}</span><span className="text-muted-foreground">{t("finance.refundCategory")}</span></div>}
        <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
          <FinanceInput id="finance-amount" label={t("finance.amount")} value={form.amount} inputMode="decimal" required onChange={(value) => update("amount", value)} />
          <FinanceInput id="finance-date" label={t("finance.occurredOn")} value={form.occurredOn} type="date" required onChange={(value) => update("occurredOn", value)} />
        </FormFieldRow>
        <FormField id="finance-account" label={t("finance.account")}>{({ id }) => <select id={id} required className={financeSelectClass} value={form.account} onChange={(event) => {
          const account = accounts.find((value) => value.id === event.target.value);
          setForm((previous) => ({ ...previous, account: event.target.value, currency: account?.currency ?? previous.currency }));
        }}><option value="">{t("common.selectPlaceholder")}</option>{accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select>}</FormField>
        {form.kind === "transfer" && <FormField id="finance-counter" label={t("finance.counterAccount")}>{({ id }) => <select id={id} required className={financeSelectClass} value={form.counterAccount} onChange={(event) => update("counterAccount", event.target.value)}>
          <option value="">{t("common.selectPlaceholder")}</option>{accounts.filter((account) => !account.archived && account.id !== form.account && account.currency === form.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>}</FormField>}
        {form.kind === "refund" && <FinanceInput id="finance-refund-of" label={t("finance.refundOf")} value={form.refundOf} required onChange={(value) => update("refundOf", value)} />}
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
