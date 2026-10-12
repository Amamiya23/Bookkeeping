import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FinancePlans } from "@renewlet/shared/schemas/finance";
import { OverviewPaymentSchedule } from "./overview-payment-schedule";

const { pay } = vi.hoisted(() => ({ pay: vi.fn() }));
vi.mock("@/components/cashflow-context", () => ({ useCashflow: () => ({ enabled: true, pay }) }));
vi.mock("@/hooks/use-subscriptions", () => ({ useSubscriptionDetail: () => ({ data: { logo: "https://example.com/music.png" } }) }));
vi.mock("@/components/router-link", () => ({ default: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a> }));

const data: FinancePlans = {
  today: "2026-10-12", schedule: [],
  items: [{ id: "plan", ledger: "ledger", name: "Music", type: "subscription", amount: "15", currency: "CNY",
    category: "builtin:subscriptions", unit: "month", interval: 1, nextDue: "2026-11-12", endDate: "", status: "active",
    version: 1, subscriptionId: "subscription", anchorDay: 12, paidCny: "15" }],
  payments: [{ id: "payment", planId: "plan", dueOn: "2026-10-12", transactionId: "transaction", status: "paid", reason: "" }],
};

describe("overview payment card", () => {
  it("shows completion and the next payment with an explicit early confirmation action", () => {
    render(<OverviewPaymentSchedule data={data} month="2026-10" />);
    expect(screen.getByRole("status")).toHaveTextContent("2026-10 付款安排已处理");
    expect(screen.getByRole("region", { name: "接下来" })).toHaveTextContent("Music");
    expect(screen.getByRole("img", { name: "Music" })).toHaveAttribute("src", "https://example.com/music.png");
    expect(screen.getByText("距今 31 天")).toBeInTheDocument();
    expect(screen.getByText("未来 30 天没有付款安排，下次付款如下。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提前确认" }));
    expect(pay).toHaveBeenCalledWith(data.items[0]);
  });

  it("preserves chronological confirmation for overdue periods", () => {
    const overdue: FinancePlans = { ...data, items: [{ ...data.items[0]!, nextDue: "2026-09-12" }], schedule: [
      { planId: "plan", dueOn: "2026-09-12", status: "pending" },
      { planId: "plan", dueOn: "2026-10-12", status: "pending" },
    ] };
    render(<OverviewPaymentSchedule data={overdue} month="2026-10" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("已过期 30 天，待确认")).toBeInTheDocument();
    expect(screen.getByText("今天到期，待确认")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "确认付款" });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("shows historical skipped records without calling them paid or showing future actions", () => {
    render(<OverviewPaymentSchedule data={{ ...data, today: "2026-11-12", payments: [{ ...data.payments[0]!, status: "skipped", transactionId: "" }] }} month="2026-10" />);
    expect(within(screen.getByRole("region", { name: "付款历史" })).getByText(/已跳过/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提前确认" })).not.toBeInTheDocument();
    expect(screen.queryByText(/已付款/)).not.toBeInTheDocument();
  });

  it("offers management shortcuts for an empty plan list without a success claim", () => {
    render(<OverviewPaymentSchedule data={{ ...data, items: [], payments: [] }} month="2026-10" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "添加周期计划" })).toHaveAttribute("href", "/transactions?view=plans&action=new");
    expect(screen.getByRole("link", { name: "管理订阅" })).toHaveAttribute("href", "/subscriptions");
  });

  it("falls back to subscription initials if its logo cannot load", () => {
    render(<OverviewPaymentSchedule data={data} month="2026-10" />);
    fireEvent.error(screen.getByRole("img", { name: "Music" }));
    expect(screen.getByText("MU")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
