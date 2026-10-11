import { describe, expect, it } from "vitest";
import fixture from "../../data/finance-contract-fixtures.json";
import { financeAccountInputSchema, financeTransactionInputSchema, financeCapabilitiesResponseSchema, financeLedgerSchema } from "./finance";

describe("finance contract fixtures", () => {
  it("accepts negative opening balances and all four transaction kinds", () => {
    const accounts = new Map(fixture.accounts.map((account, index) => [account.ref, `account0000000${index}`]));
    const transactions = new Map(fixture.transactions.map((transaction, index) => [transaction.ref, `transact000000${index}`]));
    for (const { ref, ...account } of fixture.accounts) {
      expect(ref).toBeTruthy(); expect(financeAccountInputSchema.safeParse(account).success).toBe(true);
    }
    for (const { ref, ...transaction } of fixture.transactions) {
      expect(ref).toBeTruthy();
      expect(financeTransactionInputSchema.safeParse({ ...transaction, account: accounts.get(transaction.account), counterAccount: accounts.get(transaction.counterAccount ?? "") ?? "", refundOf: transactions.get(transaction.refundOf ?? "") ?? "" }).success).toBe(true);
    }
  });
  it("rejects the same invalid amounts as the Go service", () => {
    for (const value of [...fixture.invalidUnsignedAmounts, "0"]) {
      expect(financeTransactionInputSchema.shape.amount.safeParse(value).success, value).toBe(false);
    }
  });
  it("supports explicit runtime capabilities without granting permissions", () => {
    expect(financeCapabilitiesResponseSchema.parse({ ok: true, data: { ledger: false, subscriptionPayments: false, automation: false, protocolVersion: 1 } }).data.ledger).toBe(false);
  });
  it("reads old ledgers and validates custom category identities and safe icons", () => {
    const ledger = { id: "ledger000000001", name: "Personal", baseCurrency: "CNY", timeZone: "UTC", version: 1 };
    expect(financeLedgerSchema.parse(ledger).categories).toEqual([]);
    const category = { name: "烘焙", kind: "expense", icon: "cookie" };
    expect(financeLedgerSchema.parse({ ...ledger, categories: [category] }).categories).toEqual([category]);
    for (const categories of [[{ ...category, icon: "https://example.com/icon.svg" }], [{ ...category, name: "builtin:meals" }], [category, category], Array.from({ length: 101 }, (_, i) => ({ ...category, name: String(i) }))]) {
      expect(financeLedgerSchema.safeParse({ ...ledger, categories }).success).toBe(false);
    }
  });
});
