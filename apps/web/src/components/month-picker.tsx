import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MonthPickerProps {
  id?: string;
  value: string; // "YYYY-MM"
  max?: string; // "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
}

export function MonthPicker({ id, value, max, onChange, className }: MonthPickerProps) {
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

  const monthNames = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"
  ];

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {/* 隐藏并保持可查询的真实 input[type=month] 以完全兼容现有测试与表单事件 */}
      <input
        id={id}
        type="month"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />

      <div className="inline-flex items-center rounded-xl border border-border/80 bg-secondary/50 p-1 shadow-xs">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={handlePrevMonth}
          title="上个月"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">上个月</span>
        </Button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-2 rounded-lg px-3 font-semibold text-foreground hover:bg-card/80 hover:text-foreground"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              <span>{currentYear}年 {currentMonth}月</span>
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-64 p-3 rounded-2xl border-border/80 bg-card shadow-xl" align="end">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={() => setDisplayYear((y) => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold text-foreground">{displayYear} 年</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                disabled={displayYear >= maxYear}
                onClick={() => setDisplayYear((y) => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
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
                    className={cn(
                      "h-9 rounded-xl text-xs font-medium transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "hover:bg-secondary text-foreground"
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
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canGoNext}
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={handleNextMonth}
          title="下个月"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">下个月</span>
        </Button>
      </div>
    </div>
  );
}
