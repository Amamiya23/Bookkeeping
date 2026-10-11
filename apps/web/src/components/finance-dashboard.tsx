import { useQuery } from "@tanstack/react-query";
import { useFinanceCapabilities, ledgerToday } from "@/hooks/use-finance";
import { getProductCurrentUserId } from "@/services/product-session";
import { financeService } from "@/services/finance-service";
import { FinanceReport } from "@/components/finance-report";
import { Button } from "@/components/ui/button";
import Link from "@/components/router-link";
import { useI18n } from "@/i18n/I18nProvider";

export function FinanceDashboard() {
  const capabilities = useFinanceCapabilities(); const user = getProductCurrentUserId(); const { t } = useI18n();
  const ledger = useQuery({ queryKey: ["finance", user, "ledger"], queryFn: financeService.ledger, enabled: capabilities.data?.ledger === true });
  const to = ledgerToday(ledger.data?.timeZone ?? "UTC"); const from = to.slice(0, 7) + "-01";
  const summary = useQuery({ queryKey: ["finance", user, "summary", from, to], queryFn: () => financeService.summary(from, to), enabled: capabilities.data?.ledger === true && Boolean(ledger.data) });
  if (!capabilities.data?.ledger) return null;
  return <div className="mb-8 space-y-4">
    {summary.data && <FinanceReport summary={summary.data} categories={ledger.data?.categories ?? []} />}
    {summary.error && <p role="alert">{t("error.generic")}</p>}
    <Button asChild variant="outline"><Link href="/transactions">{t("finance.add")}</Link></Button>
    <p className="text-sm text-muted-foreground">{t("finance.subscriptionBasis")}</p>
  </div>;
}
