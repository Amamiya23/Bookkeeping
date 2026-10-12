import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider";

interface MonthPickerProps {
  id?: string;
  value: string; // "YYYY-MM"
  max?: string; // "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
}

export function MonthPicker({ id, value, max, onChange, className }: MonthPickerProps) {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const currentYear = Number(value.slice(0, 4)) || new Date().getFullYear();
  const currentMonth = Number(value.slice(5, 7)) || new Date().getMonth() + 1;
  const [displayYear, setDisplayYear] = useState(currentYear);

  const maxYear = max ? Number(max.slice(0, 4)) : 9999;
  const maxMonth = max ? Number(max.slice(5, 7)) : 12;

  const isMonthDisabled = (year: number, month: number) => {
    if (year > maxYear) return true;
    if (year === maxYear && month > maxMonth) return true;
    return false;
  };

  const handlePrevMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonth - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    const val = `${nextY}-${String(nextM).padStart(2, "0")}`;
    onChange(val);
  };

  const handleNextMonth = () => {
    let nextY = currentYear;
    let nextM = currentMonth + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    if (isMonthDisabled(nextY, nextM)) return;
    const val = `${nextY}-${String(nextM).padStart(2, "0")}`;
    onChange(val);
  };

  const canGoNext = !isMonthDisabled(
    currentMonth === 12 ? currentYear + 1 : currentYear,
    currentMonth === 12 ? 1 : currentMonth + 1
  );

  const monthNames = Array.from({ length: 12 }, (_, index) => formatDateTime(new Date(2024, index, 1), { month: "short" }));
  const selectedLabel = formatDateTime(new Date(currentYear, currentMonth - 1, 1), { year: "numeric", month: "long" });
  const latestMonth = max ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className={cn("inline-flex max-w-full items-center", className)}>
      {/* 保留原生月份值，统一表单输入与快捷切月的数据流。 */}
      <input
        id={id}
        type="month"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />

      <Popover open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) setDisplayYear(currentYear);
        setOpen(nextOpen);
      }}>
        <PopoverAnchor asChild>
          <div className="inline-flex items-center gap-0.5 rounded-2xl border border-border/80 bg-card p-1 shadow-xs transition-colors focus-within:border-primary/40 hover:border-primary/30">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              onClick={handlePrevMonth}
              title={t("calendar.previousMonth")}
              aria-label={t("calendar.previousMonth")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 min-w-36 gap-2 rounded-xl px-2.5 text-foreground hover:bg-secondary/70 data-[state=open]:bg-primary/5"
                aria-label={`${t("finance.month")}: ${selectedLabel}`}
              >
                <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                <span className="flex-1 text-center font-semibold tabular-nums">{selectedLabel}</span>
                <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canGoNext}
              className="size-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
              onClick={handleNextMonth}
              title={t("calendar.nextMonth")}
              aria-label={t("calendar.nextMonth")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </PopoverAnchor>

        <PopoverContent className="w-(--radix-popover-trigger-width) rounded-2xl border-border/80 bg-card p-3 shadow-lg" align="end" sideOffset={10} mobileTitle={t("finance.month")} mobileDetent="compact" aria-label={t("finance.month")}>
          <div className="mb-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={t("finance.previousYear")}
              onClick={() => setDisplayYear((y) => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground tabular-nums" aria-live="polite">{formatDateTime(new Date(displayYear, 0, 1), { year: "numeric" })}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={t("finance.nextYear")}
              disabled={displayYear >= maxYear}
              onClick={() => setDisplayYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {monthNames.map((name, idx) => {
              const mNum = idx + 1;
              const disabled = isMonthDisabled(displayYear, mNum);
              const isSelected = displayYear === currentYear && mNum === currentMonth;

              return (
                <Button
                  key={name}
                  type="button"
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "h-10 min-w-0 rounded-xl px-1 text-xs font-medium transition-colors disabled:opacity-30",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-secondary/40 text-foreground hover:bg-secondary"
                  )}
                  onClick={() => {
                    const nextVal = `${displayYear}-${String(mNum).padStart(2, "0")}`;
                    onChange(nextVal);
                    setOpen(false);
                  }}
                >
                  {name}
                </Button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-border/60 pt-3">
            <Button type="button" variant="ghost" size="sm" className="w-full rounded-xl text-primary hover:bg-primary/5 hover:text-primary" disabled={value === latestMonth} onClick={() => {
              onChange(latestMonth);
              setOpen(false);
            }}>
              {t("finance.backToCurrentMonth")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
