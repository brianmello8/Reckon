"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowUp, ArrowDown } from "lucide-react";
import { initials } from "@/lib/reckon/format";
import { fmtPct } from "@/lib/reckon/format";
import {
  PROVIDER_BY_KEY,
  providerColor,
  providerName,
  SEVERITY,
  KEY_STATUS,
  type Severity,
  type KeyStatus,
} from "@/lib/reckon/providers";
import { seriesToPoints, smoothPath } from "@/lib/reckon/svg";

/* ---------------- Brand spike glyph ---------------- */
export function Spike({
  size = 22,
  color = "var(--brand)",
  width = 2.4,
  className,
}: {
  size?: number;
  color?: string;
  width?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M2 16 L7 16 L10 9 L13.5 19 L16 7 L18.5 14 L22 14"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------- Logo ---------------- */
export function Logo({
  size = 26,
  withWord = true,
  wordSize = 17,
}: {
  size?: number;
  withWord?: boolean;
  wordSize?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/reckon-icon.png"
        width={size}
        height={size}
        alt="Reckon"
        className="block shadow-sm"
        style={{ borderRadius: size * 0.28 }}
      />
      {withWord && (
        <span
          className="font-semibold text-ink"
          style={{ fontSize: wordSize, letterSpacing: "-.02em" }}
        >
          Reckon
        </span>
      )}
    </span>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({
  name,
  hue = 220,
  size = 32,
}: {
  name: string;
  hue?: number;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        fontSize: size * 0.38,
        color: `oklch(0.42 0.12 ${hue})`,
        background: `oklch(0.92 0.05 ${hue})`,
        border: `1px solid oklch(0.86 0.06 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------- Provider dot / tag ---------------- */
export function ProviderDot({ k, size = 8 }: { k: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0"
      style={{ width: size, height: size, borderRadius: "50%", background: providerColor(k) }}
    />
  );
}

export function ProviderTag({ k }: { k: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <ProviderDot k={k} /> {providerName(k)}
    </span>
  );
}

/* ---------------- Badges ---------------- */
const badgeBase =
  "inline-flex items-center gap-1.5 h-[21px] px-2.5 rounded-full text-[11.5px] font-medium whitespace-nowrap border border-transparent";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return (
    <span className={badgeBase} style={{ background: s.bg, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: KeyStatus }) {
  const s = KEY_STATUS[status] ?? KEY_STATUS.revoked;
  return (
    <span className={badgeBase} style={{ background: s.bg, color: s.color }}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: s.color,
          animation: status === "backfilling" ? "pulse 1.6s infinite" : undefined,
        }}
      />
      {s.label}
    </span>
  );
}

/* ---------------- Delta pill (spend up = bad/red, down = good/green) ---------------- */
export function Delta({ value, size = 13 }: { value: number; size?: number }) {
  const up = value > 0;
  const flat = Math.abs(value) < 0.0005;
  const color = flat ? "var(--ink-3)" : up ? "var(--neg)" : "var(--pos)";
  return (
    <span
      className="mono inline-flex items-center gap-0.5 font-medium"
      style={{ color, fontSize: size }}
    >
      {!flat &&
        (up ? (
          <ArrowUp size={size} strokeWidth={2.4} />
        ) : (
          <ArrowDown size={size} strokeWidth={2.4} />
        ))}
      {fmtPct(value)}
    </span>
  );
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({
  values,
  w = 96,
  h = 30,
  color = "var(--ink-3)",
  fill = false,
  dot = true,
  highlightSpike = false,
}: {
  values: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
  dot?: boolean;
  highlightSpike?: boolean;
}) {
  const gid = React.useId().replace(/:/g, "");
  if (!values.length) return <svg width={w} height={h} />;
  const pts = seriesToPoints(values, w, h, 3);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  const maxIdx = values.indexOf(Math.max(...values));
  const areaD = `${d} L ${last[0]},${h} L ${pts[0][0]},${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block h-auto max-w-full overflow-visible">
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {highlightSpike && (
        <circle cx={pts[maxIdx][0]} cy={pts[maxIdx][1]} r="2.6" fill="var(--brand)" />
      )}
      {dot && <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />}
    </svg>
  );
}

/* ---------------- Share bar (stacked horizontal provider split) ---------------- */
export function ShareBar({
  parts,
  total,
  h = 8,
}: {
  parts: { k: string; value: number }[];
  total?: number;
  h?: number;
}) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="flex overflow-hidden rounded-full bg-bg-2" style={{ height: h, gap: 2 }}>
      {parts.map((p) => {
        const pct = sum > 0 ? (p.value / sum) * 100 : 0;
        if (pct <= 0) return null;
        return (
          <div
            key={p.k}
            title={`${providerName(p.k)}: ${pct.toFixed(0)}%`}
            style={{
              width: `${pct}%`,
              background: providerColor(p.k),
              borderRadius: 999,
              transition: "width .5s cubic-bezier(.2,.7,.2,1)",
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------- Stat tile ---------------- */
export function StatTile({
  label,
  value,
  sub,
  delta,
  spark,
  sparkColor,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number;
  spark?: number[];
  sparkColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && <span className="text-ink-4">{icon}</span>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span
          className="mono font-semibold leading-none"
          style={{ fontSize: 26, letterSpacing: "-.02em" }}
        >
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div
        className="mt-2.5 flex items-end justify-between"
        style={{ minHeight: spark ? 30 : 0 }}
      >
        {sub && <span className="text-[12.5px] text-ink-3">{sub}</span>}
        {spark && (
          <div className="ml-auto">
            <Sparkline values={spark} color={sparkColor ?? "var(--ink-4)"} w={90} h={28} fill />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-line bg-bg-2 p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-on={on}
            onClick={() => onChange(o.value)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors data-[on=false]:text-ink-3 data-[on=false]:hover:text-ink data-[on=true]:bg-paper data-[on=true]:text-ink data-[on=true]:shadow-sm"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export { PROVIDER_BY_KEY };
