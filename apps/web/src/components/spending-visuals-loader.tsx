import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/I18nProvider";
import type { SpendingVisualsProps } from "@/components/spending-visuals";

const LazySpendingVisuals = lazy(() =>
  import("@/components/spending-visuals").then((module) => ({ default: module.SpendingVisuals })),
);

/** Load the chart bundle once summary data is ready, keeping page controls responsive. */
export function DeferredSpendingVisuals(props: SpendingVisualsProps) {
  const { t } = useI18n();
  return <Suspense fallback={<div role="status" aria-label={t("common.loading")} className="grid gap-10 lg:grid-cols-[1.5fr_1fr]"><Skeleton className="h-80 w-full rounded-lg" /><Skeleton className="h-80 w-full rounded-lg" /></div>}>
    <LazySpendingVisuals {...props} />
  </Suspense>;
}
