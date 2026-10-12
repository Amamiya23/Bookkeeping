// 真实筛选控件和 skeleton 共用同一宽度预算，避免中间视口下加载态与真实态出现列数漂移。
export const subscriptionFilterLayout = {
  desktopRow: "flex flex-wrap items-center gap-3 lg:gap-3.5",
  desktopSearch: "relative min-w-0 flex-[1_1_14rem]",
  desktopCategoryTrigger: "h-10 w-[min(9.5rem,100%)] justify-start rounded-xl border-border/80 bg-secondary/80 hover:bg-secondary px-3 transition-colors",
  desktopStatusTrigger: "w-[min(8.75rem,100%)] rounded-xl border-border/80 bg-secondary/80 hover:bg-secondary transition-colors",
  desktopPaymentTypeTrigger: "w-[min(9.5rem,100%)] rounded-xl border-border/80 bg-secondary/80 hover:bg-secondary transition-colors",
  desktopSortTrigger: "w-[min(12rem,100%)] rounded-xl border-border/80 bg-secondary/80 hover:bg-secondary transition-colors",
  skeletonSearch: "h-10 min-w-0 flex-[1_1_14rem] rounded-xl",
  skeletonCategory: "h-10 w-[min(9.5rem,100%)] rounded-xl",
  skeletonStatus: "h-10 w-[min(8.75rem,100%)] rounded-xl",
  skeletonPaymentType: "h-10 w-[min(9.5rem,100%)] rounded-xl",
  skeletonSort: "h-10 w-[min(12rem,100%)] rounded-xl",
} as const;
