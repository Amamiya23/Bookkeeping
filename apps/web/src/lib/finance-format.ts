import type { Locale } from "@/i18n/locales";

export function normalizeFinanceInput(value: string, locale: Locale) {
  const text = value.trim();
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  if (decimal === "," && /^-?(0|[1-9][0-9]*),[0-9]{1,6}$/.test(text)) return text.replace(",", ".");
  return text;
}

// A ledger aggregate can exceed the per-transaction money limit and can be
// negative. Never pass it through subscription MoneyString normalization.
export function formatFinanceAmount(value: string, currency: string, locale: Locale) {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) throw new Error("INVALID_AMOUNT");
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const sign = negative ? new Intl.NumberFormat(locale).formatToParts(-1).find((part) => part.type === "minusSign")?.value ?? "-" : "";
  return `${sign}${formatter.format(BigInt(whole))}${decimal}${fraction.padEnd(2, "0")} ${currency}`;
}
