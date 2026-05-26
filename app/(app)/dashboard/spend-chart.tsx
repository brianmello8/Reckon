"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#18181b", "#71717a", "#a1a1aa", "#3f3f46", "#52525b",
  "#d4d4d8", "#27272a", "#e4e4e7", "#404040", "#737373",
];

type ChartRow = { date: string; name: string; cost: number };

function pivotData(rows: ChartRow[]) {
  const dates = new Map<string, Record<string, number>>();
  const names = new Set<string>();

  for (const row of rows) {
    names.add(row.name);
    const existing = dates.get(row.date) ?? {};
    existing[row.name] = (existing[row.name] ?? 0) + row.cost;
    dates.set(row.date, existing);
  }

  const sortedDates = Array.from(dates.keys()).sort();
  const data = sortedDates.map((date) => ({
    date,
    ...dates.get(date),
  }));

  return { data, names: Array.from(names) };
}

function fmtAxis(value: number) {
  const dollars = value / 1_000_000;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(0)}k`;
  if (dollars >= 1) return `$${dollars.toFixed(0)}`;
  return `$${dollars.toFixed(2)}`;
}

function fmtTooltip(value: number) {
  const dollars = value / 1_000_000;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SpendChart({ data: rows }: { data: ChartRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No data for this period.
      </div>
    );
  }

  const { data, names } = pivotData(rows);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} width={60} />
        <Tooltip
          formatter={(value: unknown, name: unknown) => [fmtTooltip(Number(value)), String(name)]}
          labelFormatter={(label: unknown) => String(label)}
        />
        {names.map((name, i) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            stackId="1"
            fill={COLORS[i % COLORS.length]}
            stroke={COLORS[i % COLORS.length]}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
