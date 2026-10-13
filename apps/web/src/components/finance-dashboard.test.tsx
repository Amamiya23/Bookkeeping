import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceDashboard } from "./finance-dashboard";

const mocks = vi.hoisted(() => ({ enabled: true, empty: false, fail: false, summary: vi.fn(), plans: vi.fn() }));
vi.mock("@/hooks/use-finance", () => ({ useFinanceCapabilities: () => ({ data: { ledger: mocks.enabled }, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-zoned-today", () => ({ useZonedToday: () => "2026-10-12" }));
vi.mock("@/hooks/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("@/hooks/use-subscriptions", () => ({ useSubscriptionDetail: () => ({ data: undefined }) }));
vi.mock("@/contexts/CustomConfigContext", async () => {
  const { getDefaultCategories } = await import("@/types/config");
  return { useCustomConfigState: () => ({ config: { categories: getDefaultCategories() } }) };
});
vi.mock("@/hooks/use-exchange-rates", () => ({ useExchangeRates: () => ({ loading: false, sourceDate: "2026-10-12", rates: { USD: 1, CNY: 7.34 }, convert: (value: string) => Number(value) * 7.34 }) }));
vi.mock("@/services/product-session", () => ({ getProductCurrentUserId: () => "test-user" }));
vi.mock("@/components/router-link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/services/finance-service", () => ({ financeService: { ledger: async () => ({ baseCurrency: "CNY", timeZone: "Asia/Shanghai", categories: [] }), summary: mocks.summary, plans: mocks.plans, transactions: async () => ({ items: [], nextCursor: "" }) } }));
function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FinanceDashboard /></QueryClientProvider>);
}
describe("unified cash-flow overview", () => {
  beforeEach(() => {
    mocks.enabled = true; mocks.empty = false; mocks.fail = false;
    mocks.plans.mockReset().mockResolvedValue({ items: [{ id: "plan", name: "Tool", amount: "20", currency: "USD", type: "subscription", nextDue: "2026-10-15", status: "active", category: "builtin:work" }], schedule: [{ planId: "plan", dueOn: "2026-10-15", status: "scheduled" }], payments: [], today: "2026-10-12" });
    mocks.summary.mockReset().mockImplementation(async (from: string, to: string) => {
      if (mocks.fail) throw new Error("offline");
      const expense = mocks.empty ? "0" : from.startsWith("2026-09") ? "200" : "446.8";
      return { from, to, unconvertedCurrencies: [], cnyTotals: { income: "1000", grossExpense: expense, netExpense: expense, refunds: "0", netIncome: String(1000 - Number(expense)), recurringExpense: mocks.empty ? "0" : "146.8", categories: mocks.empty ? {} : { "builtin:meals": "300", "builtin:work": "146.8" }, daily: { "2026-10-03": { income: "1000", expense } }, merchants: {} } };
    });
  });
  it("shows fixed CNY actual totals and future estimates separately", async () => {
    renderOverview();
    expect((await screen.findAllByText(/446\.80 CNY/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/较上月同期 \+123.4%/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "支出排行" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最近账单" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "分析" })).toHaveAttribute("href", "/statistics?from=2026-10-01&to=2026-10-12");
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getByText(/553\.20 CNY/)).toBeInTheDocument();
    expect(screen.queryByLabelText("币种")).not.toBeInTheDocument();
  });
  it("uses one month for every overview section", async () => {
    renderOverview(); await screen.findAllByText(/446\.80 CNY/);
    fireEvent.change(screen.getByLabelText("月份"), { target: { value: "2026-08" } });
    await waitFor(() => expect(mocks.summary).toHaveBeenCalledWith("2026-08-01", "2026-08-31"));
    // 口径筛选只属于分析页，总览不再重复提供。
    expect(screen.queryByRole("button", { name: "日常消费" })).not.toBeInTheDocument();
  });
  it("previews next month's payment without including it in this month's estimate", async () => {
    mocks.plans.mockResolvedValue({
      items: [{ id: "plan", name: "Next month", amount: "20", currency: "USD", type: "subscription", nextDue: "2026-11-15", endDate: "", status: "active", category: "builtin:work" }],
      schedule: [], today: "2026-10-12",
      payments: [{ id: "payment", planId: "plan", dueOn: "2026-10-10", transactionId: "transaction", status: "paid", reason: "" }],
    });
    renderOverview();
    expect(await screen.findByText("Next month")).toBeInTheDocument();
    expect(screen.getByText("2026-10 付款安排已处理")).toBeInTheDocument();
    const estimate = screen.getByText("本月计划待付").closest("div")!;
    expect(within(estimate).getByText("0.00 CNY")).toBeInTheDocument();
    expect(mocks.plans).toHaveBeenCalledWith("2026-10-01", "2026-10-31");
  });
  it("handles empty periods and recoverable errors", async () => {
    mocks.empty = true; const view = renderOverview(); expect(await screen.findByText(/这段时间还没有支出/)).toBeInTheDocument(); view.unmount();
    mocks.fail = true; renderOverview(); expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "支出排行" })).not.toBeInTheDocument();
  });
  it("links unsupported deployments to subscription management", () => {
    mocks.enabled = false; renderOverview(); expect(screen.getByRole("link", { name: "管理订阅" })).toHaveAttribute("href", "/subscriptions");
  });
});
