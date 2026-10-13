import { z } from "zod";
import { financeTransactionInputSchema, type FinanceTransactionInput } from "@renewlet/shared/schemas/finance";
import { getProductCurrentUserId } from "@/services/product-session";

const draftSchema = z.object({
  form: financeTransactionInputSchema.extend({ amount: z.string().max(40), cnyAmount: z.string().max(40) }),
  tagsText: z.string().max(2100),
});
const preferencesSchema = z.object({ currency: z.string(), expense: z.array(z.string()).max(8), income: z.array(z.string()).max(8) });
export function financeEntryKey(scope: string) {
  return `renewlet:finance:${getProductCurrentUserId()}:${scope}`;
}
export function readFinanceDraft(key: string) {
  try { return draftSchema.parse(JSON.parse(sessionStorage.getItem(key) ?? "null")); } catch { return null; }
}
export function writeFinanceDraft(key: string, form: FinanceTransactionInput, tagsText: string) {
  try { sessionStorage.setItem(key, JSON.stringify({ form, tagsText })); } catch { /* Closing still asks before discarding. */ }
}
export function clearFinanceDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}
export function readFinancePreferences() {
  try { return preferencesSchema.parse(JSON.parse(localStorage.getItem(financeEntryKey("preferences")) ?? "null")); }
  catch { return { currency: "CNY", expense: [] as string[], income: [] as string[] }; }
}
export function rememberFinanceEntry(form: FinanceTransactionInput) {
  if (form.kind !== "expense" && form.kind !== "income") return;
  const preferences = readFinancePreferences();
  preferences.currency = form.currency;
  preferences[form.kind] = [form.category, ...preferences[form.kind].filter((value) => value !== form.category)].filter(Boolean).slice(0, 8);
  try { localStorage.setItem(financeEntryKey("preferences"), JSON.stringify(preferences)); } catch { /* Optional convenience only. */ }
}
