import { describe, expect, it } from "vitest";
import type { FinancePlan, FinancePlans } from "@renewlet/shared/schemas/finance";
import { getOverviewPaymentSchedule } from "./overview-payment-schedule";

const plan: FinancePlan = {
  id: "plan", ledger: "ledger", name: "Music", type: "subscription", amount: "15", currency: "CNY",
  category: "builtin:subscriptions", unit: "month", interval: 1, nextDue: "2026-11-12", endDate: "",
  status: "active", version: 1, subscriptionId: "subscription", anchorDay: 12, paidCny: "15",
};
const data: FinancePlans = {
  items: [plan], schedule: [], today: "2026-10-12",
  payments: [{ id: "payment", planId: "plan", dueOn: "2026-10-12", transactionId: "transaction", status: "paid", reason: "" }],
};

describe("overview payment arrangements", () => {
  it("keeps a completed month separate from its next payment, even beyond 30 days", () => {
    const result = getOverviewPaymentSchedule(data, "2026-10");
    expect(result.monthComplete).toBe(true);
    expect(result.pending).toEqual([]);
    expect(result.upcoming.map((row) => row.dueOn)).toEqual(["2026-11-12"]);
    expect(data.schedule).toEqual([]);
  });

  it("prioritizes unresolved earlier periods and deduplicates the next occurrence", () => {
    const result = getOverviewPaymentSchedule({
      ...data,
      items: [{ ...plan, nextDue: "2026-09-12" }, { ...plan, id: "future", nextDue: "2026-10-20" }],
      schedule: [
        { planId: "future", dueOn: "2026-10-20", status: "scheduled" },
        { planId: "plan", dueOn: "2026-10-12", status: "pending" },
        { planId: "plan", dueOn: "2026-09-12", status: "pending" },
      ],
    }, "2026-10");
    expect(result.monthComplete).toBe(false);
    expect(result.pending.map((row) => row.dueOn)).toEqual(["2026-09-12", "2026-10-12"]);
    expect(result.upcoming.map((row) => row.plan.id)).toEqual(["future"]);
  });

  it("treats skipped periods as handled, but does not invent completion for an empty month", () => {
    expect(getOverviewPaymentSchedule({ ...data, payments: [{ ...data.payments[0]!, status: "skipped", transactionId: "", reason: "Holiday" }] }, "2026-10").monthComplete).toBe(true);
    expect(getOverviewPaymentSchedule({ ...data, payments: [] }, "2026-10").monthComplete).toBe(false);
    expect(getOverviewPaymentSchedule({ ...data, payments: [{ ...data.payments[0]!, status: "pending" }] }, "2026-10").monthComplete).toBe(false);
  });

  it("previews annual plans while excluding paused, cancelled, and ended plans", () => {
    const result = getOverviewPaymentSchedule({ ...data, items: [
      { ...plan, id: "paused", status: "paused" },
      { ...plan, id: "cancelled", status: "cancelled" },
      { ...plan, id: "ended", endDate: "2026-10-12" },
      { ...plan, id: "annual", unit: "year", nextDue: "2027-10-12" },
    ] }, "2026-10");
    expect(result.upcoming.map((row) => row.plan.id)).toEqual(["annual"]);
  });

  it("shows historical payments and unresolved occurrences without leaking current future plans", () => {
    const result = getOverviewPaymentSchedule({ ...data, today: "2026-11-12", schedule: [
      { planId: "plan", dueOn: "2026-09-12", status: "pending" },
    ], payments: [...data.payments, { ...data.payments[0]!, id: "new", dueOn: "2026-11-12" }] }, "2026-10");
    expect(result.currentMonth).toBe(false);
    expect(result.upcoming).toEqual([]);
    expect(result.pending.map((row) => row.dueOn)).toEqual(["2026-09-12"]);
    expect(result.processed.map((row) => row.id)).toEqual(["payment"]);
  });
});
