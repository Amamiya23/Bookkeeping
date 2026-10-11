import { useI18n } from "@/i18n/I18nProvider";
import type { FinanceSummary, FinanceCategory } from "@renewlet/shared/schemas/finance";
import { formatFinanceAmount } from "@/lib/finance-format";
import { financeCategoryDetails } from "@/lib/finance-categories";
import { FinanceCategoryIcon } from "@/components/finance-category-icon";

export function FinanceReport({ summary, categories = [] }: { summary: FinanceSummary; categories?: FinanceCategory[] }) {
  const { t, locale } = useI18n();
  const formatCurrency = (amount: string, currency: string) => formatFinanceAmount(amount, currency, locale);
  return <section className="space-y-4" aria-label={t("finance.reports")}>
    <h2 className="text-xl font-semibold">{t("finance.reports")}</h2>
    <p className="text-sm text-muted-foreground">{t("finance.basis")}</p>
    {Object.entries(summary.byCurrency).map(([currency, totals]) => <div key={currency} className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 font-semibold">{currency}</h3>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">{t("finance.income")}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totals.income, currency)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("finance.netExpense")}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totals.netExpense, currency)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t("finance.netIncome")}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totals.netIncome, currency)}</dd></div>
      </dl>
      <dl className="mt-4 divide-y">{Object.entries(totals.categories).map(([category, amount]) => <div key={category} className="flex justify-between gap-4 py-2 text-sm"><dt className="flex items-center gap-2"><FinanceCategoryIcon name={financeCategoryDetails(category, "expense", categories, t).icon} className="size-4 text-muted-foreground" />{financeCategoryDetails(category, "expense", categories, t).label}</dt><dd className="tabular-nums">{formatCurrency(amount, currency)}</dd></div>)}</dl>
    </div>)}
    {summary.unconvertedCurrencies.length > 0 && <p className="text-sm text-muted-foreground">{t("finance.unconverted")}</p>}
  </section>;
}
