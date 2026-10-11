import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { financeCategoryIcons, financeCategorySchema, type FinanceCategory } from "@renewlet/shared/schemas/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";
import { builtInFinanceCategories, financeCategoryDetails, financeCategoryOptions } from "@/lib/finance-categories";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

const iconLabels = Object.fromEntries(financeCategoryIcons.map((icon) => [icon, `finance.icon.${icon}`])) as Record<typeof financeCategoryIcons[number], MessageKey>;

export function FinanceCategoryPicker({ kind, value, categories, disabled, onChange, onAdd }: {
  kind: FinanceCategory["kind"]; value: string; categories: FinanceCategory[]; disabled: boolean;
  onChange: (value: string) => void; onAdd: (category: FinanceCategory) => Promise<void>;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<FinanceCategory["icon"]>("grid-2x2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = financeCategoryOptions(kind, categories, t);
  // Keep historical free-text categories available when editing, including blank.
  if (!options.some((option) => option.value === value)) options.unshift({ value, ...financeCategoryDetails(value, kind, categories, t) });
  const filtered = options.filter((option) => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const save = async () => {
    if (disabled || saving) return;
    const parsed = financeCategorySchema.safeParse({ kind, name: name.trim(), icon });
    if (!parsed.success || categories.length >= 100) { setError(t("finance.categoryInvalid")); return; }
    const normalized = parsed.data.name.toLocaleLowerCase();
    if (options.some((option) => option.label.toLocaleLowerCase() === normalized || option.value.toLocaleLowerCase() === normalized)
      || builtInFinanceCategories.some((option) => option.kind === kind && option.aliases.some((alias) => alias.toLocaleLowerCase() === normalized))) {
      setError(t("finance.categoryDuplicate")); return;
    }
    setSaving(true); setError("");
    try { await onAdd(parsed.data); onChange(parsed.data.name); setEditing(false); setName(""); setSearch(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("error.generic")); }
    finally { setSaving(false); }
  };
  return <fieldset disabled={disabled || saving} className="min-w-0 space-y-3">
    <legend className="sr-only">{t("finance.category")}</legend>
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 text-sm"><span className="shrink-0 font-medium">{t("finance.category")}</span><span className="truncate text-primary">{financeCategoryDetails(value, kind, categories, t).label}</span></div>
      <Button type="button" size="sm" variant="ghost" aria-expanded={editing} disabled={categories.length >= 100} onClick={() => { setEditing(!editing); setError(""); }}><Plus className="size-4" aria-hidden="true" />{t("finance.addCategory")}</Button>
    </div>
    {editing ? <div role="region" aria-label={t("finance.addCategory")} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <FormField id="finance-category-name" label={t("finance.categoryName")}>{({ id }) => <Input id={id} autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} />}</FormField>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("finance.categoryIcon")}</legend>
        <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto p-1">{financeCategoryIcons.map((item) => <button key={item} type="button" aria-label={t(iconLabels[item])} aria-pressed={icon === item} title={t(iconLabels[item])} onClick={() => setIcon(item)} className={cn("flex min-h-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", icon === item && "bg-primary/10 text-primary ring-1 ring-primary")}><FinanceCategoryIcon name={item} className="size-5" /></button>)}</div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button><Button type="button" size="sm" onClick={() => void save()}>{saving ? t("common.saving") : t("common.save")}</Button></div>
    </div> : <>
      <div className="relative"><Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" aria-hidden="true" /><Input aria-label={t("finance.searchCategories")} placeholder={t("finance.searchCategories")} value={search} className="pl-9" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /></div>
      <div className="grid max-h-[36dvh] grid-cols-5 gap-x-1 gap-y-3 overflow-y-auto overscroll-contain px-1 py-2 sm:max-h-64" role="group" aria-label={t("finance.category")}>
        {filtered.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", value === option.value && "text-primary")}>
          <span className={cn("flex size-11 items-center justify-center rounded-full", value === option.value && "bg-primary/10")}><FinanceCategoryIcon name={option.icon} /></span>
          <span className="w-full text-center text-xs leading-4 wrap-break-word">{option.label}</span>
        </button>)}
      </div>
      {filtered.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t("finance.noCategories")}</p>}
    </>}
  </fieldset>;
}
