import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

export const financeSelectClass = "h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export function FinanceInput({ id, label, value, onChange, type = "text", required = false, inputMode }: {
  id: string; label: ReactNode; value: string; onChange: (value: string) => void; type?: string; required?: boolean; inputMode?: "decimal";
}) {
  return <FormField id={id} label={label}>{(field) => <Input id={field.id} value={value} type={type} className={type === "date" ? "min-w-0 px-2 sm:px-3" : undefined} required={required} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />}</FormField>;
}
