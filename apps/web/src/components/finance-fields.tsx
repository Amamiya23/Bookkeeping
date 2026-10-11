import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

export const financeSelectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function FinanceInput({ id, label, value, onChange, type = "text", required = false, inputMode }: {
  id: string; label: ReactNode; value: string; onChange: (value: string) => void; type?: string; required?: boolean; inputMode?: "decimal";
}) {
  return <FormField id={id} label={label}>{(field) => <Input id={field.id} value={value} type={type} required={required} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />}</FormField>;
}
