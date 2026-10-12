import { Cell, Pie, PieChart, Sector, Tooltip, type PieSectorShapeProps } from "recharts";
import { RechartsFrame } from "@/components/recharts-frame";

export { vizColors as donutColors, vizOtherColor as donutOtherColor } from "@/components/finance-ui";

type DonutDatum = { key: string; name: string; value: number; color: string; description: string };

function RoundedSector(props: PieSectorShapeProps) {
  const span = Math.abs(props.endAngle - props.startAngle);
  const corner = Math.min(5, props.innerRadius * Math.sin(Math.min(span, 90) * Math.PI / 360) * .45);
  return <Sector cx={props.cx} cy={props.cy} innerRadius={props.innerRadius} outerRadius={props.outerRadius} startAngle={props.startAngle} endAngle={props.endAngle} fill={props.fill ?? "currentColor"} stroke="none" cornerRadius={corner} className="transition-opacity hover:opacity-80" />;
}

function DonutTooltip(props: unknown) {
  if (!props || typeof props !== "object" || !("active" in props) || !props.active || !("payload" in props) || !Array.isArray(props.payload)) return null;
  const entry: unknown = props.payload[0];
  if (!entry || typeof entry !== "object" || !("payload" in entry)) return null;
  const data: unknown = entry.payload;
  if (!data || typeof data !== "object" || !("description" in data) || typeof data.description !== "string") return null;
  return <div className="max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">{data.description}</div>;
}

/** Rounded sectors stay inside their allocation, including very small categories. */
export function RoundedDonut({ data, label }: { data: DonutDatum[]; label: string }) {
  const positive = data.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const spacingLimit = 45 / Math.max(1, positive.length);
  return <div role="img" aria-label={label} className="w-48 shrink-0">
    <RechartsFrame height={192} testId="finance-donut-chart-frame">
      <PieChart accessibilityLayer title={label} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pie data={positive} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="68%" outerRadius="94%" startAngle={0} endAngle={360} minAngle={Math.min(0.5, spacingLimit)} paddingAngle={positive.length > 1 ? Math.min(2, spacingLimit) : 0} strokeWidth={0} shape={RoundedSector} isAnimationActive={false}>
          {positive.map((item) => <Cell key={item.key} fill={item.color} />)}
        </Pie>
        <Tooltip content={DonutTooltip} isAnimationActive={false} offset={12} wrapperStyle={{ pointerEvents: "none", zIndex: 10 }} />
      </PieChart>
    </RechartsFrame>
  </div>;
}
