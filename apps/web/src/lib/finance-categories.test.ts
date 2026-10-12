import { describe, expect, it } from "vitest";
import { builtInFinanceCategories, financeCategoryDetails, financeCategoryOptions, subscriptionFinanceCategoryOptions, groupSpendingCategories } from "./finance-categories";
import { getDefaultCategories } from "@/types/config";
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
  it("derives prefixed categories from subscriptions and localizes without changing their identities", () => {
    const config = [...getDefaultCategories(), { id: "custom", value: "my_service", labels: { "zh-CN": "家庭服务", "en-US": "Family services" } }];
    const translate = (key: MessageKey) => key === "finance.navSubscriptions" ? "订阅" : t(key);
    const subscriptions = subscriptionFinanceCategoryOptions(config, "zh-CN", translate);
    expect(financeCategoryDetails("subscription:productivity", "expense", [], translate, subscriptions)).toEqual({ label: "订阅-生产力", icon: "laptop" });
    expect(financeCategoryDetails("subscription:streaming", "expense", [], translate, subscriptions).label).toBe("订阅-影音流媒体");
    expect(financeCategoryDetails("subscription:other", "expense", [], translate, subscriptions).label).toBe("订阅-其他");
    expect(financeCategoryOptions("expense", [], translate, subscriptions)).toContainEqual({ value: "subscription:my_service", label: "订阅-家庭服务", icon: "laptop" });
    expect(financeCategoryOptions("income", [], translate, subscriptions).some((item) => item.value.startsWith("subscription:"))).toBe(false);
    const english = subscriptionFinanceCategoryOptions(config, "en-US", () => "Subscriptions");
    expect(english.find((item) => item.value === "subscription:my_service")?.label).toBe("Subscriptions-Family services");
    expect(english.map((item) => item.value)).toEqual(subscriptions.map((item) => item.value));
    expect(financeCategoryDetails("subscription:deleted", "expense", [], translate, subscriptions).label).toBe("订阅-deleted");
  });
  it("groups subscription categories once while keeping rent and daily expenses separate", () => {
    expect(groupSpendingCategories({ "subscription:productivity": "20.5", "subscription:streaming": "10", "builtin:subscriptions": "9.5", "builtin:housing": "2000", "builtin:meals": "30", "subscription:other": "0" })).toEqual([["builtin:housing", 2000], ["subscription:", 40], ["builtin:meals", 30]]);
  });
});
