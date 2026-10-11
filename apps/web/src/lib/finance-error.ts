import { ApiError } from "./api-client";
import type { MessageKey } from "@/i18n/messages";

const financeErrors: Record<string, MessageKey> = {
  VERSION_CONFLICT: "finance.versionConflict", REFUND_LIMIT_EXCEEDED: "finance.refundLimit", REFUNDS_EXIST: "finance.refundsExist",
  BEFORE_OPENING_DATE: "finance.beforeOpening", ACCOUNT_ARCHIVED: "finance.archivedAccount", ACCOUNT_CURRENCY_LOCKED: "finance.currencyLocked",
  INVALID_TRANSFER: "finance.invalidTransfer", CURRENCY_MISMATCH: "finance.invalidTransfer", EXTERNAL_REFERENCE_LOCKED: "finance.externalLocked",
  FINANCE_RESTORE_REQUIRES_EMPTY_LEDGER: "finance.restoreEmpty",
  INVALID_CATEGORIES: "finance.categoryInvalid",
};
export function financeErrorMessage(error: unknown, t: (key: MessageKey) => string) {
  if (!(error instanceof ApiError)) return t("error.generic");
  return t(financeErrors[error.code ?? ""] ?? (error.status < 500 ? "finance.invalid" : "error.generic"));
}
