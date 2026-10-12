import { useQuery } from "@tanstack/react-query";
import { useFinanceCapabilities } from "@/hooks/use-finance";
import { financeService } from "@/services/finance-service";
import { getProductCurrentUserId } from "@/services/product-session";

export function useRecurringPlans(from = "", to = "") {
  const capabilities = useFinanceCapabilities();
  const user = getProductCurrentUserId();
  return useQuery({ queryKey: ["finance", user, "plans", from, to], queryFn: () => financeService.plans(from, to), enabled: capabilities.data?.ledger === true, refetchInterval: 60_000 });
}
