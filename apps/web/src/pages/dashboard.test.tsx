import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Dashboard from "./dashboard";
vi.mock("@/components/header", () => ({ Header: () => <header>Navigation</header> }));
vi.mock("@/components/finance-dashboard", () => ({ FinanceDashboard: () => <section>Unified overview</section> }));
it("hosts the unified overview in the shared app shell", () => {
  render(<Dashboard />); expect(screen.getByRole("main")).toContainElement(screen.getByText("Unified overview"));
});
