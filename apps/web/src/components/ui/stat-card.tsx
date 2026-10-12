/**
 * 统计卡片原语。
 *
 * 架构位置：dashboard/public-status 共用的指标展示层，负责一致的信息层级和展示密度。
 *
 * 注意： 不在这里计算指标含义；金额换算和日期窗口属于 subscriptions domain。
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'primary' | 'warning';
  density?: "default" | "compact";
  className?: string;
  "data-testid"?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
  density = "default",
  className,
  "data-testid": dataTestId,
}: StatCardProps) {
  const compact = density === "compact";

  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card transition-all duration-300 hover:bg-card-hover hover:border-primary/20 hover:shadow-md",
        compact ? "p-4 lg:p-5" : "p-5 sm:p-6",
        className,
      )}
    >
      <div className={cn("flex items-start justify-between", compact && "gap-3 lg:gap-4")}>
        <div className={cn("grid min-w-0", compact ? "gap-1 lg:gap-1.5" : "gap-1.5")}>
          <p className={cn("font-medium text-muted-foreground", compact ? "truncate text-xs lg:text-sm" : "text-sm")}>
            {title}
          </p>
          <p
            className={cn(
              "font-bold tracking-tight text-foreground",
              compact ? "truncate text-2xl lg:text-3xl" : "text-3xl",
              variant === 'warning' && "text-warning",
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className={cn("text-muted-foreground font-normal", compact ? "truncate text-[11px] leading-4 lg:text-xs" : "text-xs")}>
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
            compact ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5 lg:h-11 lg:w-11 lg:[&_svg]:h-5.5 lg:[&_svg]:w-5.5" : "h-11 w-11 sm:h-12 sm:w-12",
            variant === 'default' && "bg-secondary/80 text-muted-foreground",
            variant === 'primary' && "bg-primary/10 text-primary",
            variant === 'warning' && "bg-warning/10 text-warning",
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
