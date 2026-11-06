"use client";

import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import type { Analytics, NdviGrid } from "@/lib/api/types";
import { ndviColor } from "@/lib/format";
import { useFormat } from "@/lib/hooks/use-format";
import { useT } from "@/providers/i18n-provider";

// Validated for colour-blind separation on white. Assigned by field order, never by rank.
const SERIES_COLORS = ["#2E8058", "#3F6FB5", "#C2672E", "#8A5AA8"];
const STATUS_COLORS: Record<string, string> = {
  healthy: "#2E8058", attention: "#E8A23A", critical: "#D95757", unknown: "#AEB6AE",
};
const AXIS = { fontSize: 13, fill: "#646E66" };
const GRID = "#E7ECE4";
const TOOLTIP = {
  contentStyle: { borderRadius: 6, border: "1px solid #DFE5DC", fontSize: 14 },
  cursor: { fill: "#EEF1EC" },
};

const LEGEND = { fontSize: 14 };
const inkLabel = (value: string) => <span style={{ color: "#1E2923" }}>{value}</span>;

export function NdviTrendChart({ series, data }: { series: Analytics["series"]; data: Analytics["trend"] }) {
  const format = useFormat();
  const rows = data.map((point) => ({ date: point.date, ...point.values }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickFormatter={format.shortDate} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={32} />
          <YAxis domain={[0.2, 0.9]} ticks={[0.2, 0.4, 0.6, 0.8]} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP} cursor={{ stroke: "#AEB6AE" }} labelFormatter={(value) => format.date(String(value))}
            formatter={(value) => format.ndvi(Number(value))} />
          {series.length > 1 && <Legend wrapperStyle={LEGEND} iconType="plainline" formatter={inkLabel} />}
          {series.map((item, index) => (
            <Line key={item.id} dataKey={item.id} name={item.name} stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FieldComparisonChart({ data, labels }: {
  data: Analytics["fields"]; labels: { healthy: string; attention: string; critical: string };
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barSize={22}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={120} />
          <Tooltip {...TOOLTIP} formatter={(value) => `${Number(value).toFixed(0)}%`} />
          <Legend wrapperStyle={LEGEND} iconType="square" formatter={inkLabel} itemSorter={null} />
          {(["healthy", "attention", "critical"] as const).map((key) => (
            <Bar key={key} dataKey={`${key}_pct`} name={labels[key]} stackId="share" fill={STATUS_COLORS[key]} stroke="#fff" strokeWidth={2} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HealthDonut({ data, total }: { data: Analytics["health"]; total: string }) {
  const format = useFormat();
  const slices = data.filter((slice) => slice.area > 0);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="area" nameKey="label" innerRadius="66%" outerRadius="96%" paddingAngle={2} stroke="none">
              {slices.map((slice) => <Cell key={slice.status} fill={STATUS_COLORS[slice.status]} />)}
            </Pie>
            <Tooltip {...TOOLTIP} formatter={(value) => format.area(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          <span className="text-lg font-semibold">{total}</span>
        </div>
      </div>
      <ul className="space-y-2">
        {slices.map((slice) => (
          <li key={slice.status} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: STATUS_COLORS[slice.status] }} aria-hidden />
              {slice.label}
            </span>
            <span className="text-muted-foreground">{format.area(slice.area)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CountBars({ data }: { data: Analytics["anomalies_by_type"] }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <ul className="space-y-3">
      {data.map((item) => (
        <li key={item.key}>
          <div className="flex justify-between text-sm"><span>{item.label}</span><span className="font-semibold">{item.count}</span></div>
          <div className="mt-1 h-2 rounded-sm bg-muted"><div className="h-2 rounded-sm bg-brand-2" style={{ width: `${(item.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function NdviHeatmap({ grid }: { grid: NdviGrid }) {
  const { t } = useT();
  const format = useFormat();
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
        role="img" aria-label={t("analytics.ndviMapAlt", { field: grid.field_name, mean: format.ndvi(grid.mean) })}
        onMouseLeave={() => setHover(null)}>
        {grid.values.flatMap((row, y) => row.map((value, x) => (
          <div key={`${x}-${y}`} className="aspect-square"
            style={{ background: value === null ? "transparent" : ndviColor(value) }}
            onMouseEnter={() => setHover(value)} />
        )))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">{t("analytics.low")}</span>
        <span className="h-2.5 w-40 rounded-sm" style={{ background: `linear-gradient(90deg, ${ndviColor(0.2)}, ${ndviColor(0.5)}, ${ndviColor(0.8)})` }} />
        <span className="text-muted-foreground">{t("analytics.high")}</span>
        <span className="ml-auto font-medium">{hover === null ? t("analytics.hoverHint") : `NDVI ${format.ndvi(hover)}`}</span>
      </div>
    </div>
  );
}
