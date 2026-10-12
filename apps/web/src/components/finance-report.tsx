import { useI18n } from "@/i18n/I18nProvider";
import type { FinanceSummary, FinanceCategory } from "@renewlet/shared/schemas/finance";
import { formatFinanceAmount } from "@/lib/finance-format";
import { DeferredSpendingVisuals as SpendingVisuals } from "@/components/spending-visuals-loader";
import Link from "@/components/router-link";

export function FinanceReport({ summary, categories = [], group = "" }: { summary: FinanceSummary; categories?: FinanceCategory[]; group?: string }) {
  const { t, locale } = useI18n();
  const amount = (value: string) => formatFinanceAmount(value, "CNY", locale);
  const totals = summary.cnyTotals ?? summary.byCurrency["CNY"];
  if (!totals) return null;
  return <section className="space-y-8" aria-label={t("finance.reports")}>
    <p className="text-sm text-muted-foreground">{t("finance.historyFixed")}</p>
    {summary.unconvertedCurrencies.length > 0 && <p role="status" className="rounded-lg border p-3 text-sm">{t("finance.missingConversions")}</p>}
    <dl className="grid grid-cols-2 gap-6 border-y py-6 sm:grid-cols-4">{[[t("finance.income"), totals.income], [t("finance.totalSpend"), totals.grossExpense], [t("finance.netIncome"), totals.netIncome], [t("finance.recurringSpend"), totals.recurringExpense]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 wrap-break-word text-2xl font-semibold tabular-nums">{amount(value!)}</dd></div>)}</dl>
    <SpendingVisuals totals={totals} from={summary.from} to={summary.to} categories={categories} group={group} />
    <section className="border-t pt-6"><h2 className="mb-4 text-lg font-semibold">{t("finance.merchants")}</h2><div className="divide-y">{Object.entries(totals.merchants).sort((a, b) => Number(b[1]) - Number(a[1])).map(([merchant, value]) => <Link key={merchant} href={`/transactions?${new URLSearchParams({ from: summary.from, to: summary.to, group, merchant })}`} className="flex justify-between gap-4 py-3 text-sm hover:text-primary"><span>{merchant}</span><span className="tabular-nums">{amount(value)}</span></Link>)}</div></section>
  </section>;
}
