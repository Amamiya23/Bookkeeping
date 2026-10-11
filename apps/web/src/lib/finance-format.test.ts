import { describe, expect, it } from "vitest";
import { formatFinanceAmount, normalizeFinanceInput } from "./finance-format";
import { ledgerToday } from "@/hooks/use-finance";
import { vi } from "vitest";

describe("ledger amount display", () => {
  it("preserves negative balances, six decimals and large aggregates", () => {
    expect(formatFinanceAmount("-0.000001", "CNY", "zh-CN")).toBe("-0.000001 CNY");
    expect(formatFinanceAmount("100000000000000000.123456", "USD", "en-US")).toBe("100,000,000,000,000,000.123456 USD");
    expect(formatFinanceAmount("-20.3", "RUB", "ru-RU")).toBe("-20,30 RUB");
  });
  it("uses the ledger's local day at a month boundary", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-30T16:30:00Z"));
      expect(ledgerToday("Asia/Shanghai")).toBe("2026-10-01");
      expect(ledgerToday("America/New_York")).toBe("2026-09-30");
    } finally { vi.useRealTimers(); }
  });
  it("normalizes an explicit locale decimal separator without guessing grouping", () => {
    expect(normalizeFinanceInput("-20,3", "ru-RU")).toBe("-20.3");
    expect(normalizeFinanceInput("1,000", "zh-CN")).toBe("1,000");
  });
});
