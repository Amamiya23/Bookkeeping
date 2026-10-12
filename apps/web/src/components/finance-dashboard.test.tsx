import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceDashboard } from "./finance-dashboard";

const mocks = vi.hoisted(() => ({ enabled: true, empty: false, fail: false, summary: vi.fn(), plans: vi.fn() }));
vi.mock("@/hooks/use-finance", () => ({ useFinanceCapabilities: () => ({ data: { ledger: mocks.enabled }, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-zoned-today", () => ({ useZonedToday: () => "2026-10-12" }));
vi.mock("@/hooks/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("@/contexts/CustomConfigContext", async () => {
  const { getDefaultCategories } = await import("@/types/config");
  return { useCustomConfigState: () => ({ config: { categories: getDefaultCategories() } }) };
});
vi.mock("@/hooks/use-exchange-rates", () => ({ useExchangeRates: () => ({ loading: false, sourceDate: "2026-10-12", rates: { USD: 1, CNY: 7.34 }, convert: (value: string) => Number(value) * 7.34 }) }));
vi.mock("@/services/product-session", () => ({ getProductCurrentUserId: () => "test-user" }));
vi.mock("@/components/router-link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/services/finance-service", () => ({ financeService: { ledger: async () => ({ baseCurrency: "CNY", timeZone: "Asia/Shanghai", categories: [] }), summary: mocks.summary, plans: mocks.plans } }));
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
      return { from, to, unconvertedCurrencies: [], cnyTotals: { income: "1000", grossExpense: expense, netIncome: String(1000 - Number(expense)), recurringExpense: mocks.empty ? "0" : "146.8", categories: mocks.empty ? {} : { "builtin:meals": "300", "builtin:work": "146.8" }, daily: { "2026-10-03": { income: "1000", expense } }, merchants: {} } };
    });
  });
  it("shows fixed CNY actual totals and future estimates separately", async () => {
    renderOverview();
    expect((await screen.findAllByText(/446\.80 CNY/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/较上月同期 \+123.4%/)).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "每日收支" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "钱花在哪里" })).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getByText(/553\.20 CNY/)).toBeInTheDocument();
    expect(screen.queryByLabelText("币种")).not.toBeInTheDocument();
  });
  it("uses one period and distinguishes daily from recurring consumption", async () => {
    renderOverview(); await screen.findAllByText(/446\.80 CNY/);
    fireEvent.change(screen.getByLabelText("月份"), { target: { value: "2026-08" } });
    await waitFor(() => expect(mocks.summary).toHaveBeenCalledWith("2026-08-01", "2026-08-31", ""));
    fireEvent.click(await screen.findByRole("button", { name: "日常消费" }));
    await waitFor(() => expect(mocks.summary).toHaveBeenCalledWith("2026-08-01", "2026-08-31", "daily"));
  });
  it("handles empty periods and recoverable errors", async () => {
    mocks.empty = true; const view = renderOverview(); expect(await screen.findByText(/这段时间还没有支出/)).toBeInTheDocument(); view.unmount();
    mocks.fail = true; renderOverview(); expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(screen.queryByRole("img", { name: "每日收支" })).not.toBeInTheDocument();
  });
  it("links unsupported deployments to subscription management", () => {
    mocks.enabled = false; renderOverview(); expect(screen.getByRole("link", { name: "管理订阅" })).toHaveAttribute("href", "/subscriptions");
  });
});
