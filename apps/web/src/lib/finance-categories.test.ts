import { describe, expect, it } from "vitest";
import { builtInFinanceCategories, financeCategoryDetails, financeCategoryOptions } from "./finance-categories";
import type { MessageKey } from "@/i18n/messages";

const t = (key: MessageKey) => `translated:${key}`;
describe("finance categories", () => {
  it("keeps stable identities while localizing labels and separating income from expenses", () => {
    const expenses = financeCategoryOptions("expense", [], t);
    const income = financeCategoryOptions("income", [], t);
    expect(expenses).toHaveLength(32); expect(income).toHaveLength(12);
    expect(income.map((item) => item.value)).toContain("builtin:refund");
    expect(income.map((item) => item.value)).toContain("builtin:transfer");
    expect(new Set(builtInFinanceCategories.map((item) => item.value)).size).toBe(44);
    expect(expenses.find((item) => item.value === "builtin:meals")).toMatchObject({ label: "translated:finance.category.meals", icon: "utensils" });
    expect(income.some((item) => item.value === "builtin:meals")).toBe(false);
  });
  it("preserves old free text and resolves custom category icons without changing transactions", () => {
    const custom = [{ name: "烘焙", kind: "expense" as const, icon: "cookie" as const }];
    expect(financeCategoryDetails("烘焙", "refund", custom, t)).toEqual({ label: "烘焙", icon: "cookie" });
    expect(financeCategoryDetails("餐饮", "expense", [], t).icon).toBe("utensils");
    expect(financeCategoryDetails("旧分类", "expense", [], t)).toEqual({ label: "旧分类", icon: "grid-2x2" });
    expect(financeCategoryDetails("烘焙", "income", custom, t).icon).toBe("grid-2x2");
  });
});
