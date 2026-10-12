import { z } from "zod";
import { apiSuccessResponseSchema } from "./api";
import { isValidDateOnly, isValidTimeZone } from "../runtime";

const date = z.string().refine(isValidDateOnly, "INVALID_DATE");
const id = z.string().regex(/^[a-z0-9]{15}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const decimalPattern = /^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
const decimal = z.string().regex(decimalPattern);
const inputAmount = decimal.refine((value) => {
  if (value.length > 24 || !decimalPattern.test(value)) return false;
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return BigInt(`${whole}${fraction.padEnd(6, "0")}`) <= 1_000_000_000_000_000n;
}, "INVALID_AMOUNT");
const positiveAmount = inputAmount.refine((value) => !value.startsWith("-") && /[1-9]/.test(value), "INVALID_AMOUNT");
const categoryValue = z.string().max(93).refine((value) => value.startsWith("subscription:") || value.length <= 80);

export const financeCapabilitiesSchema = z.object({
  ledger: z.boolean(), subscriptionPayments: z.boolean(), automation: z.boolean(), protocolVersion: z.literal(1),
}).strict();
export const financeCapabilitiesResponseSchema = apiSuccessResponseSchema(financeCapabilitiesSchema);
export const financeCategoryIcons = ["utensils", "cookie", "shirt", "bus", "plane", "baby", "paw-print", "phone", "wine", "book-open", "shopping-basket", "house", "sparkles", "heart-pulse", "gift", "fuel", "gamepad-2", "party-popper", "camera", "dumbbell", "grid-2x2", "zap", "hand-heart", "washing-machine", "leaf", "coffee", "shopping-bag", "shield-check", "receipt", "briefcase-business", "banknote", "wallet", "clock", "trending-up", "award", "landmark", "coins", "laptop", "music", "bike"] as const;
export const financeCategorySchema = z.object({ name: z.string().trim().min(1).max(80).refine((name) => !name.startsWith("builtin:")), kind: z.enum(["expense", "income"]), icon: z.enum(financeCategoryIcons) }).strict();
const financeCategoriesSchema = z.array(financeCategorySchema).max(100).default([]).refine((items) => new Set(items.map((item) => `${item.kind}:${item.name.toLowerCase()}`)).size === items.length, "DUPLICATE_CATEGORY");
export type FinanceCategory = z.infer<typeof financeCategorySchema>;
export type FinanceCategoryIconName = typeof financeCategoryIcons[number];
export const financeLedgerSchema = z.object({ id, name: z.string().min(1).max(120), baseCurrency: currency, timeZone: z.string().refine(isValidTimeZone), categories: financeCategoriesSchema, version: z.number().int().positive() }).strict();
export const financeLedgerResponseSchema = apiSuccessResponseSchema(financeLedgerSchema);
export const financeAccountInputSchema = z.object({
  name: z.string().trim().min(1).max(120), currency, openingBalance: inputAmount, openingDate: date,
  archived: z.boolean().default(false), version: z.number().int().nonnegative().default(0),
}).strict();
export const financeAccountSchema = financeAccountInputSchema.extend({ id, ledger: id, balance: decimal, version: z.number().int().positive() });
export const financeAccountResponseSchema = apiSuccessResponseSchema(financeAccountSchema);
export const financeAccountsResponseSchema = apiSuccessResponseSchema(z.object({ items: z.array(financeAccountSchema).max(500) }).strict());
export const financeTransactionInputSchema = z.object({
  kind: z.enum(["expense", "income", "transfer", "refund"]), amount: positiveAmount, currency, account: z.union([id, z.literal("")]).default(""),
  counterAccount: z.string().default(""), occurredOn: date, category: categoryValue.default(""),
  merchant: z.string().max(120).default(""), tags: z.array(z.string().min(1).max(40)).max(50).default([]),
  notes: z.string().max(5000).default(""), refundOf: z.string().default(""),
  externalSource: z.string().max(120).default(""), externalId: z.string().max(120).default(""),
  cnyAmount: z.union([positiveAmount, z.literal("")]).default(""),
  version: z.number().int().nonnegative().default(0),
}).strict();
export const financeTransactionSchema = financeTransactionInputSchema.extend({
  id, ledger: id, status: z.enum(["posted", "void"]), source: z.string(), voidReason: z.string(), created: z.iso.datetime(),
  version: z.number().int().positive(),
  planId: z.union([id, z.literal("")]).default(""), dueOn: z.union([date, z.literal("")]).default(""),
});
export const financeTransactionResponseSchema = apiSuccessResponseSchema(financeTransactionSchema);
export const financeTransactionsResponseSchema = apiSuccessResponseSchema(z.object({ items: z.array(financeTransactionSchema).max(100), nextCursor: z.string() }).strict());
const totals = z.object({ income: decimal, grossExpense: decimal, refunds: decimal, netExpense: decimal, netIncome: decimal, categories: z.record(z.string(), decimal), daily: z.record(z.string(), z.object({ income: decimal, expense: decimal }).strict()).default({}), recurringExpense: decimal.default("0"), merchants: z.record(z.string(), decimal).default({}) }).strict();
export const financeSummarySchema = z.object({
  from: date, to: date, timeZone: z.string(), basis: z.literal("posted-cash-flow"), baseCurrency: currency,
  byCurrency: z.record(currency, totals), unconvertedCurrencies: z.array(currency),
  cnyTotals: totals.optional(),
}).strict();
export const financeSummaryResponseSchema = apiSuccessResponseSchema(financeSummarySchema);
export const financeBudgetInputSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), currency, category: z.string().max(80), amount: positiveAmount, version: z.number().int().nonnegative() }).strict();
export const financeBudgetSchema = financeBudgetInputSchema.extend({ id });
export const financeBudgetResponseSchema = apiSuccessResponseSchema(financeBudgetSchema);
export const financeBudgetsResponseSchema = apiSuccessResponseSchema(z.object({ items: z.array(financeBudgetSchema.extend({ spent: decimal, remaining: decimal })) }).strict());
export const financeAuditResponseSchema = apiSuccessResponseSchema(z.object({ items: z.array(z.object({
  id, actor: z.string(), action: z.string(), target: z.string(), requestId: z.string(), created: z.iso.datetime(), before: z.unknown(), after: z.unknown(),
}).strict()) }).strict());

export type FinanceLedger = z.infer<typeof financeLedgerSchema>;
export type FinanceAccount = z.infer<typeof financeAccountSchema>;
export type FinanceAccountInput = z.infer<typeof financeAccountInputSchema>;
export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;
export type FinanceTransactionInput = z.infer<typeof financeTransactionInputSchema>;
export type FinanceSummary = z.infer<typeof financeSummarySchema>;

export const financePlanInputSchema = z.object({
  name: z.string().trim().min(1).max(120), type: z.enum(["subscription", "bill", "other"]),
  amount: inputAmount.refine((value) => !value.startsWith("-")), currency, category: categoryValue,
  unit: z.enum(["day", "week", "month", "year"]), interval: z.number().int().min(1).max(365),
  nextDue: date, endDate: z.union([date, z.literal("")]), status: z.enum(["active", "paused", "cancelled"]),
  version: z.number().int().nonnegative(),
}).strict();
export const financePlanSchema = financePlanInputSchema.extend({ id, ledger: id, subscriptionId: z.union([id, z.literal("")]), anchorDay: z.number().int().min(1).max(31), paidCny: decimal.default("0") });
export const financePaymentSchema = z.object({ id, planId: id, dueOn: date, transactionId: z.union([id, z.literal("")]), status: z.enum(["paid", "skipped", "pending"]), reason: z.string().max(500) }).strict();
export const financePlansResponseSchema = apiSuccessResponseSchema(z.object({ items: z.array(financePlanSchema).max(1000), schedule: z.array(z.object({ planId: id, dueOn: date, status: z.enum(["scheduled", "pending"]) }).strict()).max(5000), payments: z.array(financePaymentSchema).max(10000), today: date }).strict());
export const financePlanResponseSchema = apiSuccessResponseSchema(financePlanSchema);
export const financePaymentResponseSchema = apiSuccessResponseSchema(financePaymentSchema);
export type FinancePlan = z.infer<typeof financePlanSchema>;
export type FinancePlanInput = z.infer<typeof financePlanInputSchema>;
export type FinancePayment = z.infer<typeof financePaymentSchema>;
export type FinancePlans = z.infer<typeof financePlansResponseSchema>["data"];

export const financeSnapshotSchema = z.object({
  schemaVersion: z.literal(1), ledger: financeLedgerSchema, accounts: z.array(financeAccountSchema).max(500),
  transactions: z.array(financeTransactionSchema).max(10000), budgets: z.array(financeBudgetSchema).max(500),
  audit: financeAuditResponseSchema.shape.data.shape.items.max(10000),
  plans: z.array(financePlanSchema).max(1000).default([]), payments: z.array(financePaymentSchema).max(10000).default([]),
}).strict();
export const financeSnapshotResponseSchema = apiSuccessResponseSchema(financeSnapshotSchema);
export const financeRestoreResponseSchema = apiSuccessResponseSchema(z.object({ restored: z.literal(true) }).strict());
export type FinanceSnapshot = z.infer<typeof financeSnapshotSchema>;
