import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { appQueryClient } from "@/lib/app-query-client";
import { financeService } from "@/services/finance-service";

export function useFinanceCapabilities() {
  const { data } = authClient.useSession();
  return useQuery({ queryKey: ["finance", data?.user.id, "capabilities"], queryFn: financeService.capabilities, enabled: Boolean(data?.user), staleTime: 60_000, retry: false }, appQueryClient);
}
export function ledgerToday(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
