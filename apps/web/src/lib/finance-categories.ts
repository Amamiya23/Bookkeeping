import type { FinanceCategory, FinanceCategoryIconName } from "@renewlet/shared/schemas/finance";
import type { MessageKey } from "@/i18n/messages";
import type { ConfigItem } from "@/types/config";
import { localizedLabel, type Locale } from "@/i18n/locales";

export const subscriptionCategoryPrefix = "subscription:";
export type FinanceCategoryOption = { value: string; label: string; icon: FinanceCategoryIconName };
export function isSubscriptionFinanceCategory(value: string) {
  return value.startsWith(subscriptionCategoryPrefix) || value === "builtin:subscriptions";
}
export function subscriptionFinanceCategoryOptions(categories: ConfigItem[], locale: Locale, t: (key: MessageKey) => string): FinanceCategoryOption[] {
  return categories.filter((item) => item.enabled !== false).map((item) => ({ value: subscriptionCategoryPrefix + item.value, label: `${t("finance.navSubscriptions")}-${localizedLabel(item.labels, locale) || item.value}`, icon: "laptop" }));
}

type BuiltInCategory = { value: string; kind: FinanceCategory["kind"]; icon: FinanceCategoryIconName; label: MessageKey; aliases: string[] };
export const builtInFinanceCategories: BuiltInCategory[] = [
  { value: "builtin:refund", kind: "income", icon: "receipt", label: "finance.category.refund", aliases: ["退款", "Refunds", "Возвраты"] },
  { value: "builtin:transfer", kind: "income", icon: "banknote", label: "finance.category.transfer", aliases: ["转账收入", "Received transfers", "Полученные переводы"] },
  { value: "builtin:meals", kind: "expense", icon: "utensils", label: "finance.category.meals", aliases: ["三餐","Meals","Питание","餐饮"] },
  { value: "builtin:snacks", kind: "expense", icon: "cookie", label: "finance.category.snacks", aliases: ["零食","Snacks","Перекусы"] },
  { value: "builtin:clothes", kind: "expense", icon: "shirt", label: "finance.category.clothes", aliases: ["衣服","Clothing","Одежда"] },
  { value: "builtin:transport", kind: "expense", icon: "bus", label: "finance.category.transport", aliases: ["交通","Transport","Транспорт"] },
  { value: "builtin:travel", kind: "expense", icon: "plane", label: "finance.category.travel", aliases: ["旅行","Travel","Путешествия"] },
  { value: "builtin:children", kind: "expense", icon: "baby", label: "finance.category.children", aliases: ["孩子","Children","Дети"] },
  { value: "builtin:pets", kind: "expense", icon: "paw-print", label: "finance.category.pets", aliases: ["宠物","Pets","Питомцы"] },
  { value: "builtin:telecom", kind: "expense", icon: "phone", label: "finance.category.telecom", aliases: ["话费网费","Phone & internet","Связь и интернет"] },
  { value: "builtin:tobacco", kind: "expense", icon: "wine", label: "finance.category.tobacco", aliases: ["烟酒","Tobacco & alcohol","Табак и алкоголь"] },
  { value: "builtin:learning", kind: "expense", icon: "book-open", label: "finance.category.learning", aliases: ["学习","Education","Образование"] },
  { value: "builtin:daily", kind: "expense", icon: "shopping-basket", label: "finance.category.daily", aliases: ["日用品","Daily essentials","Бытовые товары"] },
  { value: "builtin:housing", kind: "expense", icon: "house", label: "finance.category.housing", aliases: ["住房","Housing","Жильё"] },
  { value: "builtin:beauty", kind: "expense", icon: "sparkles", label: "finance.category.beauty", aliases: ["美妆","Beauty","Косметика"] },
  { value: "builtin:medical", kind: "expense", icon: "heart-pulse", label: "finance.category.medical", aliases: ["医疗","Healthcare","Медицина"] },
  { value: "builtin:red-packet", kind: "expense", icon: "gift", label: "finance.category.red-packet", aliases: ["发红包","Red packets","Денежные подарки"] },
  { value: "builtin:car", kind: "expense", icon: "fuel", label: "finance.category.car", aliases: ["汽车/加油","Car & fuel","Авто и топливо"] },
  { value: "builtin:entertainment", kind: "expense", icon: "gamepad-2", label: "finance.category.entertainment", aliases: ["娱乐","Entertainment","Развлечения"] },
  { value: "builtin:hosting", kind: "expense", icon: "party-popper", label: "finance.category.hosting", aliases: ["请客送礼","Hosting & gifts","Угощения и подарки"] },
  { value: "builtin:electronics", kind: "expense", icon: "camera", label: "finance.category.electronics", aliases: ["电器数码","Electronics","Электроника"] },
  { value: "builtin:sports", kind: "expense", icon: "dumbbell", label: "finance.category.sports", aliases: ["运动","Sports","Спорт"] },
  { value: "builtin:utilities", kind: "expense", icon: "zap", label: "finance.category.utilities", aliases: ["水电煤","Utilities","Коммунальные услуги"] },
  { value: "builtin:social", kind: "expense", icon: "hand-heart", label: "finance.category.social", aliases: ["人情","Social occasions","Семейные события"] },
  { value: "builtin:laundry", kind: "expense", icon: "washing-machine", label: "finance.category.laundry", aliases: ["洗衣","Laundry","Стирка"] },
  { value: "builtin:wellness", kind: "expense", icon: "leaf", label: "finance.category.wellness", aliases: ["养生保健","Wellness","Здоровье и уход"] },
  { value: "builtin:drinks", kind: "expense", icon: "coffee", label: "finance.category.drinks", aliases: ["饮料","Drinks","Напитки"] },
  { value: "builtin:shopping", kind: "expense", icon: "shopping-bag", label: "finance.category.shopping", aliases: ["购物","Shopping","Покупки"] },
  { value: "builtin:insurance", kind: "expense", icon: "shield-check", label: "finance.category.insurance", aliases: ["保险","Insurance","Страхование"] },
  { value: "builtin:tax", kind: "expense", icon: "receipt", label: "finance.category.tax", aliases: ["税费","Taxes & fees","Налоги и сборы"] },
  { value: "builtin:work", kind: "expense", icon: "briefcase-business", label: "finance.category.work", aliases: ["工作","Work","Работа"] },
  { value: "builtin:subscriptions", kind: "expense", icon: "laptop", label: "finance.category.subscriptions", aliases: ["订阅服务","Subscriptions","Подписки"] },
  { value: "builtin:repayment", kind: "expense", icon: "landmark", label: "finance.category.repayment", aliases: ["还款","Repayments","Погашение долгов"] },
  { value: "builtin:other-expense", kind: "expense", icon: "grid-2x2", label: "finance.category.other-expense", aliases: ["其它","Other","Прочее"] },
  { value: "builtin:salary", kind: "income", icon: "wallet", label: "finance.category.salary", aliases: ["工资","Salary","Зарплата"] },
  { value: "builtin:allowance", kind: "income", icon: "banknote", label: "finance.category.allowance", aliases: ["生活费","Allowance","Деньги на жизнь"] },
  { value: "builtin:received-gift", kind: "income", icon: "gift", label: "finance.category.received-gift", aliases: ["收红包","Received gifts","Подарки"] },
  { value: "builtin:side-income", kind: "income", icon: "clock", label: "finance.category.side-income", aliases: ["外快","Side income","Подработка"] },
  { value: "builtin:investment", kind: "income", icon: "trending-up", label: "finance.category.investment", aliases: ["股票基金","Stocks & funds","Акции и фонды"] },
  { value: "builtin:bonus", kind: "income", icon: "award", label: "finance.category.bonus", aliases: ["奖金","Bonus","Премия"] },
  { value: "builtin:interest", kind: "income", icon: "coins", label: "finance.category.interest", aliases: ["利息","Interest","Проценты"] },
  { value: "builtin:rent", kind: "income", icon: "house", label: "finance.category.rent", aliases: ["租金","Rental income","Доход от аренды"] },
  { value: "builtin:reimbursement", kind: "income", icon: "receipt", label: "finance.category.reimbursement", aliases: ["报销","Reimbursement","Возмещение расходов"] },
  { value: "builtin:other-income", kind: "income", icon: "grid-2x2", label: "finance.category.other-income", aliases: ["其它","Other","Прочее"] },
];

export function financeCategoryDetails(value: string, kind: string, custom: FinanceCategory[], t: (key: MessageKey) => string, subscriptions: FinanceCategoryOption[] = []) {
  const categoryKind = kind === "income" ? "income" : "expense";
  if (categoryKind === "expense" && value.startsWith(subscriptionCategoryPrefix)) {
    const subscription = subscriptions.find((item) => item.value === value);
    return { label: subscription?.label ?? `${t("finance.navSubscriptions")}${value === subscriptionCategoryPrefix ? "" : "-" + value.slice(subscriptionCategoryPrefix.length)}`, icon: "laptop" as const };
  }
  const own = custom.find((item) => item.name === value && item.kind === categoryKind);
  if (own) return { label: own.name, icon: own.icon };
  const builtin = builtInFinanceCategories.find((item) => item.kind === categoryKind && (item.value === value || item.aliases.includes(value)));
  return builtin ? { label: t(builtin.label), icon: builtin.icon } : { label: value || t("common.none"), icon: "grid-2x2" as const };
}

export function financeCategoryOptions(kind: FinanceCategory["kind"], custom: FinanceCategory[], t: (key: MessageKey) => string, subscriptions: FinanceCategoryOption[] = []) {
  const options = [...builtInFinanceCategories.filter((item) => item.kind === kind).map((item) => ({ value: item.value, label: t(item.label), icon: item.icon })), ...(kind === "expense" ? subscriptions : []), ...custom.filter((item) => item.kind === kind).map((item) => ({ value: item.name, label: item.name, icon: item.icon }))];
  return options.filter((item, index) => options.findIndex((other) => other.value === item.value) === index);
}

export function groupSpendingCategories(categories: Record<string, string>) {
  const result: Record<string, number> = {};
  for (const [category, value] of Object.entries(categories)) {
    const key = isSubscriptionFinanceCategory(category) ? subscriptionCategoryPrefix : category;
    result[key] = (result[key] ?? 0) + Number(value);
  }
  return Object.entries(result).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
}
