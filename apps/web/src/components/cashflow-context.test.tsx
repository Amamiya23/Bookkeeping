import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancePlan } from "@renewlet/shared/schemas/finance";
import { CashflowProvider, emptyTransaction, useCashflow } from "./cashflow-context";

const mocks = vi.hoisted(() => ({ save: vi.fn(), settle: vi.fn(), plans: vi.fn(), success: vi.fn<(message: string, options: { action: { label: string; onClick: () => void }; duration: number }) => void>() }));
vi.mock("@/hooks/use-finance", () => ({ useFinanceCapabilities: () => ({ data: { ledger: true } }), ledgerToday: () => "2026-10-14" }));
vi.mock("@/services/product-session", () => ({ getProductCurrentUserId: () => "cashflow-test" }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }));
vi.mock("@/services/finance-service", () => ({ financeService: {
  ledger: async () => ({ categories: [], timeZone: "UTC" }), saveTransaction: mocks.save, settlePlan: mocks.settle, plans: mocks.plans,
} }));
vi.mock("@/components/finance-transaction-dialog", () => ({ FinanceTransactionDialog: ({ onSave }: { onSave: (input: unknown, keepOpen: boolean) => void }) => <button onClick={() => onSave({ ...emptyTransaction("2026-09-29"), amount: "12.5" }, true)}>Save test entry</button> }));
vi.mock("@/components/plan-payment-dialog", () => ({ PlanPaymentDialog: ({ onSettle }: { onSettle: (input: unknown) => void }) => <button onClick={() => onSettle({ action: "pay", dueOn: "2026-10-14", version: 1 })}>Complete test payment</button> }));
const plan = { id: "plan", name: "Rent", nextDue: "2026-10-14", version: 1 } as FinancePlan;
function Controls() {
  const cashflow = useCashflow(); const location = useLocation();
  return <><button onClick={() => cashflow?.pay(plan)}>Pay plan</button><output data-testid="location">{location.pathname + location.search}</output></>;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><CashflowProvider><Controls /></CashflowProvider></QueryClientProvider></MemoryRouter>);
  return client;
}
beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue({ id: "saved-entry", occurredOn: "2026-09-29" });
  mocks.settle.mockReset().mockResolvedValue({ dueOn: "2026-10-14" });
  mocks.plans.mockReset().mockResolvedValue({ items: [{ ...plan, nextDue: "2026-11-14", status: "active" }] });
  mocks.success.mockReset();
});
describe("cashflow completion feedback", () => {
  it("opens the exact backdated entry and closes continuous entry mode", async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole("button", { name: "记一笔" }));
    await user.click(await screen.findByText("Save test entry"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    const [message, options] = mocks.success.mock.calls[0]!;
    expect(message).toContain("2026/9/29");
    expect(message).toContain("其他月份");
    expect(screen.getByText("Save test entry")).toBeInTheDocument();
    // Run the action through a user gesture, as Sonner would.
    render(<button onClick={options.action.onClick}>View saved entry</button>);
    await user.click(screen.getByText("View saved entry"));
    expect(screen.getByTestId("location")).toHaveTextContent("/transactions?id=saved-entry&from=2026-09-29&to=2026-09-29");
    expect(screen.queryByText("Save test entry")).not.toBeInTheDocument();
  });
  it("names the completed period and server-calculated next payment even if refresh fails", async () => {
    const user = userEvent.setup(); const client = setup();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("offline"));
    await user.click(screen.getByText("Pay plan"));
    await user.click(await screen.findByText("Complete test payment"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.success.mock.calls[0]![0]).toContain("Rent · 2026/10/14 本期付款已完成");
    expect(mocks.success.mock.calls[0]![0]).toContain("下次待付款：2026/11/14");
    expect(screen.queryByText("Complete test payment")).not.toBeInTheDocument();
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });
});
