import { apiFetch } from "@/lib/api-client";
import {
  financeCapabilitiesResponseSchema, financeLedgerResponseSchema, financeAccountsResponseSchema,
  financeAccountResponseSchema, financeAccountInputSchema, financeTransactionResponseSchema,
  financeTransactionsResponseSchema, financeTransactionInputSchema, financeSummaryResponseSchema,
  financeBudgetResponseSchema, financeBudgetInputSchema, financeBudgetsResponseSchema, financeAuditResponseSchema,
  financeSnapshotResponseSchema, financeSnapshotSchema, financeRestoreResponseSchema,
  type FinanceAccountInput, type FinanceTransactionInput, type FinanceLedger,
} from "@renewlet/shared/schemas/finance";

const base = "/api/app/finance";
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const financeService = {
  capabilities: () => apiFetch(`${base}/capabilities`, financeCapabilitiesResponseSchema),
  ledger: () => apiFetch(`${base}/ledger`, financeLedgerResponseSchema),
  updateLedger: (ledger: FinanceLedger) => apiFetch(`${base}/ledger`, financeLedgerResponseSchema, json("PATCH", ledger)),
  accounts: () => apiFetch(`${base}/accounts`, financeAccountsResponseSchema),
  saveAccount: (input: FinanceAccountInput, id?: string) => apiFetch(`${base}/accounts${id ? `/${encodeURIComponent(id)}` : ""}`, financeAccountResponseSchema, json(id ? "PATCH" : "POST", financeAccountInputSchema.parse(input))),
  transactions: (query: Record<string, string>) => apiFetch(`${base}/transactions?${new URLSearchParams(query)}`, financeTransactionsResponseSchema),
  saveTransaction: (input: FinanceTransactionInput, id?: string) => apiFetch(`${base}/transactions${id ? `/${encodeURIComponent(id)}` : ""}`, financeTransactionResponseSchema, json(id ? "PATCH" : "POST", financeTransactionInputSchema.parse(input))),
  voidTransaction: (id: string, version: number, reason: string) => apiFetch(`${base}/transactions/${encodeURIComponent(id)}/void`, financeTransactionResponseSchema, json("POST", { version, reason })),
  summary: (from: string, to: string) => apiFetch(`${base}/reports/summary?${new URLSearchParams({ from, to })}`, financeSummaryResponseSchema),
  budgets: (month: string) => apiFetch(`${base}/budgets?${new URLSearchParams({ month })}`, financeBudgetsResponseSchema),
  saveBudget: (input: unknown) => apiFetch(`${base}/budgets`, financeBudgetResponseSchema, json("PUT", financeBudgetInputSchema.parse(input))),
  audit: () => apiFetch(`${base}/audit`, financeAuditResponseSchema),
  export: (signal?: AbortSignal) => apiFetch(`${base}/export`, financeSnapshotResponseSchema, signal ? { signal } : undefined),
  restore: (snapshot: unknown) => apiFetch(`${base}/restore`, financeRestoreResponseSchema, { ...json("POST", financeSnapshotSchema.parse(snapshot)), timeoutMs: 120_000 }),
  async exportIfSupported(signal?: AbortSignal) {
    const capabilities = await apiFetch(`${base}/capabilities`, financeCapabilitiesResponseSchema, signal ? { signal } : undefined);
    return capabilities.ledger ? this.export(signal) : undefined;
  },
};
