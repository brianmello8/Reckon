"use client";

import * as React from "react";
import { smoothPath, niceCeil, type Point } from "@/lib/reckon/svg";
import { fmtCompact, fmtMoney } from "@/lib/reckon/format";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/* ----------------------------------------------------------------
   AreaChart — stacked smooth areas with hover crosshair + tooltip.
   series bottom→top; dates same length as each series' values.
---------------------------------------------------------------- */
export function AreaChart({
  series,
  dates,
  height = 300,
  yFmt = fmtCompact,
  valueFmt = fmtMoney,
  animateKey,
}: {
  series: ChartSeries[];
  dates: string[];
  height?: number;
  yFmt?: (v: number) => string;
  valueFmt?: (v: number) => string;
  animateKey?: string;
}) {
  const W = 920;
  const H = height;
  const PAD = { l: 52, r: 14, t: 14, b: 26 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const n = dates.length;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, [animateKey]);

  const totals = React.useMemo(
    () => dates.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0)),
    [series, dates]
  );
  const yMax = niceCeil(Math.max(...totals, 1));

  const xAt = (i: number) =>
    PAD.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.t + innerH - (v / yMax) * innerH;

  // stacked bands
  let cum = new Array(n).fill(0);
  const bands = series.map((s) => {
    const lower = cum.slice();
    const upper = cum.map((c, i) => c + (s.values[i] || 0));
    cum = upper;
    const topPts: Point[] = upper.map((v, i) => [xAt(i), yAt(v)]);
    const botPts: Point[] = lower.map((v, i) => [xAt(i), yAt(v)]);
    const topD = smoothPath(topPts);
    const botD = smoothPath(botPts.slice().reverse());
    const d = `${topD} L ${botPts[n - 1][0]},${botPts[n - 1][1]} ${botD.replace(/^M[^C]*/, "")} Z`;
    return { ...s, topPts, area: d, lineD: topD };
  });

  const ticks = 4;
  const gl = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hx = hover != null ? xAt(hover) : 0;

  return (
    <div
      ref={wrapRef}
      className="relative w-full min-w-0 overflow-hidden"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full max-w-full"
      >
        {gl.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yAt(v)} y2={yAt(v)} stroke="var(--line)" strokeWidth="1" />
            <text
              x={PAD.l - 8}
              y={yAt(v) + 3.5}
              textAnchor="end"
              fontSize="11"
              fill="var(--ink-4)"
              fontFamily="var(--font-mono)"
            >
              {yFmt(v)}
            </text>
          </g>
        ))}
        <g style={{ opacity: mounted ? 1 : 0, transition: "opacity .5s ease" }}>
          {bands.map((b) => (
            <path key={b.key} d={b.area} fill={b.color} fillOpacity={0.16} />
          ))}
          {bands.map((b) => (
            <path
              key={b.key + "l"}
              d={b.lineD}
              fill="none"
              stroke={b.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>
        {dates.map((d, i) =>
          i % 5 === 0 || i === n - 1 ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-4)"
              fontFamily="var(--font-mono)"
            >
              {d}
            </text>
          ) : null
        )}
        {hover != null && (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={PAD.t}
              y2={PAD.t + innerH}
              stroke="var(--brand)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {bands.map((b) => (
              <circle
                key={b.key}
                cx={hx}
                cy={b.topPts[hover][1]}
                r="3.5"
                fill="var(--paper)"
                stroke={b.color}
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <ChartTooltip
          x={hx / W}
          dateLabel={dates[hover]}
          rows={series
            .map((s) => ({ label: s.label, color: s.color, value: s.values[hover] || 0 }))
            .filter((r) => r.value > 0.005)
            .sort((a, b) => b.value - a.value)}
          total={totals[hover]}
          valueFmt={valueFmt}
        />
      )}
    </div>
  );
}

function ChartTooltip({
  x,
  dateLabel,
  rows,
  total,
  valueFmt,
}: {
  x: number;
  dateLabel: string;
  rows: { label: string; color: string; value: number }[];
  total: number;
  valueFmt: (v: number) => string;
}) {
  const left = `calc(${(x * 100).toFixed(2)}% ${x > 0.62 ? "- 200px" : "+ 14px"})`;
  return (
    <div
      className="pointer-events-none absolute z-[5] w-[186px] rounded-xl border border-line-2 bg-paper px-3 py-2.5 shadow-lg"
      style={{ top: 8, left }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
        {dateLabel}
      </div>
      <div className="mono my-1 text-[18px] font-semibold">{valueFmt(total)}</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5 text-[12.5px]">
            <span
              className="shrink-0"
              style={{ width: 7, height: 7, borderRadius: 2, background: r.color }}
            />
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="mono ml-auto text-ink">{valueFmt(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Donut — provider split
---------------------------------------------------------------- */
export function Donut({
  parts,
  size = 140,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  parts: { k: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-2)" strokeWidth={thickness} />
        {parts.map((p) => {
          const frac = sum > 0 ? p.value / sum : 0;
          const len = frac * circ;
          const seg = (
            <circle
              key={p.k}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)" }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue && <span className="mono text-[20px] font-semibold">{centerValue}</span>}
        {centerLabel && <span className="eyebrow mt-0.5">{centerLabel}</span>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   MiniBars — small vertical bars with one spike day highlighted
---------------------------------------------------------------- */
export function MiniBars({
  values,
  w = 120,
  h = 40,
  spikeIdx,
  color = "var(--ink-3)",
  spikeColor = "var(--brand)",
}: {
  values: number[];
  w?: number;
  h?: number;
  spikeIdx?: number;
  color?: string;
  spikeColor?: string;
}) {
  const max = Math.max(...values, 1);
  const n = values.length;
  const bw = (w / n) * 0.62;
  const gap = (w / n) * 0.38;
  return (
    <svg width={w} height={h} className="block">
      {values.map((v, i) => {
        const bh = Math.max(2, (v / max) * (h - 2));
        const x = i * (bw + gap) + gap / 2;
        return (
          <rect
            key={i}
            x={x}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.5}
            fill={i === spikeIdx ? spikeColor : color}
            opacity={i === spikeIdx ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}
