import { cn } from "@/lib/utils";

export const headerLayout = {
  shell: "sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl relative transition-all duration-200",
  inner: "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4",
  primaryCluster: "flex min-w-0 items-center gap-3 lg:gap-5 xl:gap-8",
  brandCluster: "flex min-w-0 items-center gap-3",
  brandTextGroup: "grid min-w-0 gap-1",
  brandTitleLink:
    "block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  brandTitle: "truncate text-xl font-extrabold tracking-tight text-foreground transition-colors hover:text-primary",
  desktopNav: "hidden min-w-0 items-center gap-1.5 lg:flex",
  desktopNavIcon: "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-105",
  desktopNavLabel: "whitespace-nowrap tracking-wide",
  desktopNavSkeletonLabel: "h-4 w-16",
  actions: "flex min-w-0 shrink-0 items-center justify-end gap-2",
  mobileNav: "flex border-t border-border bg-card/95 backdrop-blur-md lg:hidden",
  mobileNavIcon: "h-5 w-5 transition-transform duration-200",
} as const;

const headerDesktopNavLinkBase =
  "group flex h-10 w-auto items-center justify-start gap-2 rounded-xl px-3 text-sm font-medium transition-all duration-200 active:scale-[0.98] xl:px-4";

const headerDesktopNavSkeletonItem =
  "flex h-10 w-auto items-center justify-start gap-2 rounded-xl px-3 xl:px-4";

const headerMobileNavLinkBase = "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors active:scale-95";

export function getHeaderDesktopNavLinkClass(isActive: boolean) {
  return cn(
    headerDesktopNavLinkBase,
    isActive
      ? "bg-primary/15 text-primary shadow-xs font-semibold"
      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
  );
}

export function getHeaderDesktopNavSkeletonItemClass() {
  return headerDesktopNavSkeletonItem;
}

export function getHeaderMobileNavLinkClass(isActive: boolean) {
  return cn(
    headerMobileNavLinkBase,
    isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
  );
}
