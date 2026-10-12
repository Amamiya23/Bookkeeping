import Finance from "@/pages/finance";
import SubscriptionStatistics from "@/pages/subscription-statistics";
import { useFinanceCapabilities } from "@/hooks/use-finance";

export default function Statistics() {
  const capabilities = useFinanceCapabilities();
  return capabilities.data?.ledger ? <Finance /> : capabilities.isPending ? null : <SubscriptionStatistics />;
}
