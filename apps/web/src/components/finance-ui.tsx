/**
 * 记账页面共用的展示原语。
 *
 * 架构位置：总览、账单、分析和周期计划共享同一套面板、指标和分段控件，
 * 让页面只描述信息结构，不在各处重复拼卡片样式。
 *
 * 注意： 这里只负责外观与可访问语义，金额口径和统计计算留在调用方。
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// 固定顺序的分类色槽位，深浅模式取值由 theme-tokens.css 的 --viz-* 提供。
export const vizColors = Array.from({ length: 8 }, (_, index) => `var(--viz-${index + 1})`);
export const vizOtherColor = "var(--viz-other)";

export function FinancePageHeader({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && <p className="mb-1.5 text-sm text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
    </div>
    {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
  </div>;
}

export function FinancePanel({ title, description, action, children, className, bodyClassName, labelledBy }: {
  title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; labelledBy?: string;
}) {
  return <section aria-labelledby={labelledBy} className={cn("flex min-w-0 flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6", className)}>
    {(title || action) && <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {title && <h2 id={labelledBy} className="text-base font-semibold text-foreground">{title}</h2>}
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>}
    <div className={cn("flex-1", bodyClassName)}>{children}</div>
  </section>;
}

/** 指标块：label 在上、数值在下；数值不染数据色，正负含义交给 tone 的克制强调。 */
export function FinanceMetric({ label, value, hint, tone = "default", icon, className }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "default" | "positive" | "negative"; icon?: ReactNode; className?: string;
}) {
  return <div className={cn("min-w-0 rounded-2xl border border-border/80 bg-card p-4 shadow-card sm:p-5", className)}>
    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
      {icon && <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
      <span className="truncate">{label}</span>
    </dt>
    <dd className={cn("mt-3 text-lg font-semibold tracking-tight wrap-break-word tabular-nums sm:text-2xl", tone === "positive" && "text-success", tone === "negative" && "text-destructive")}>{value}</dd>
    {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

/** 分段控件：按钮组 + aria-pressed，适合在同一视图内切换口径。 */
export function FinanceSegmented<T extends string>({ options, value, onChange, label, className }: {
  options: readonly { value: T; label: ReactNode }[]; value: T; onChange: (value: T) => void; label: string; className?: string;
}) {
  return <div role="group" aria-label={label} className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/80 bg-secondary/60 p-1", className)}>
    {options.map((option) => {
      const active = option.value === value;
      return <button key={option.value} type="button" aria-pressed={active} onClick={() => onChange(option.value)} className={cn(
        "h-8 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}>{option.label}</button>;
    })}
  </div>;
}

export function FinanceEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
    <p>{children}</p>{action}
  </div>;
}

/** 占比条：轨道用同色的浅色阶，填充保持细线，避免和数值抢视觉重量。 */
export function FinanceShareBar({ percent, color }: { percent: number; color: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
    <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, percent))}%`, backgroundColor: color }} />
  </div>;
}

/** 累计趋势迷你图：只表达走势，不承载精确数值；精确值交给上方的主数字和图表。 */
export function FinanceSparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const width = 300, height = 64, pad = 3;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values.map((value, index) => [index / (values.length - 1) * width, height - pad - (value - min) / (max - min) * (height - pad * 2)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  // SVG 非等比拉伸会把圆点压扁，终点圆点用 HTML 定位绘制。
  return <div aria-hidden="true" className={cn("relative h-16 w-full text-primary", className)}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full overflow-visible">
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="currentColor" fillOpacity={0.1} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
    <span className="absolute size-2.5 -translate-1/2 rounded-full bg-current ring-2 ring-card" style={{ left: "100%", top: `${last[1] / height * 100}%` }} />
  </div>;
}
