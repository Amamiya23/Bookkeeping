import { Header } from "@/components/header";
import { FinanceDashboard } from "@/components/finance-dashboard";

export default function Dashboard() {
  return <div className="app-page bg-background"><Header /><main className="app-main mx-auto max-w-7xl"><FinanceDashboard /></main></div>;
}
