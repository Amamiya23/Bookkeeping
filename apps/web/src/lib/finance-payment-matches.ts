import type { FinancePlan, FinanceTransaction } from "@renewlet/shared/schemas/finance";

export function paymentMatchScore(plan: FinancePlan, row: FinanceTransaction, today: string) {
  if (row.status !== "posted" || row.kind !== "expense" || row.planId || row.currency !== plan.currency) return 0;
  const days = Math.min(...[plan.nextDue, today].map((date) => Math.abs(Date.parse(row.occurredOn) - Date.parse(date)) / 86400000));
  if (days > 14) return 0;
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, "");
  const merchant = normalize(row.merchant);
  const name = normalize(plan.name);
  const nameMatches = merchant && name && (merchant === name || name.length >= 3 && merchant.includes(name));
  const amountMatches = Number(plan.amount) > 0 && Number(row.amount) === Number(plan.amount);
  if (!nameMatches && !amountMatches) return 0;
  return (nameMatches ? 100 : 0) + (amountMatches ? 50 : 0) + 14 - days;
}
