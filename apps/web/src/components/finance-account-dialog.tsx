import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInput } from "@/components/finance-fields";
import { useI18n } from "@/i18n/I18nProvider";
import { normalizeFinanceInput } from "@/lib/finance-format";
import { financeAccountInputSchema, type FinanceAccountInput } from "@renewlet/shared/schemas/finance";

export function FinanceAccountDialog({ initial, onClose, onSave, busy, error }: {
  initial: FinanceAccountInput; onClose: () => void; onSave: (value: FinanceAccountInput) => Promise<void>; busy: boolean; error: string;
}) {
  const { t, locale } = useI18n(); const [form, setForm] = useState(initial); const [validation, setValidation] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const result = financeAccountInputSchema.safeParse({ ...form, openingBalance: normalizeFinanceInput(form.openingBalance, locale) });
    if (!result.success) { setValidation(t("finance.invalid")); return; }
    setValidation(""); await onSave(result.data);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{initial.version ? t("common.edit") : t("finance.addAccount")}</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={submit}>
      <FinanceInput id="finance-account-name" label={t("finance.name")} value={form.name} required onChange={(name) => setForm({ ...form, name })} />
      <FinanceInput id="finance-account-currency" label={t("finance.currency")} value={form.currency} required onChange={(currency) => setForm({ ...form, currency: currency.toUpperCase() })} />
      <FinanceInput id="finance-opening" label={t("finance.openingBalance")} value={form.openingBalance} required inputMode="decimal" onChange={(openingBalance) => setForm({ ...form, openingBalance })} />
      <FinanceInput id="finance-opening-date" label={t("finance.openingDate")} value={form.openingDate} required type="date" onChange={(openingDate) => setForm({ ...form, openingDate })} />
      {(error || validation) && <p role="alert" className="text-sm text-destructive">{error || validation}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button><Button disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
