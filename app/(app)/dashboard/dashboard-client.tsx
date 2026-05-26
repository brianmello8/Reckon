"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, TrendingUp, Users, Cpu, DollarSign } from "lucide-react";
import { SpendChart } from "./spend-chart";

type DashboardData = {
  stats: {
    totalCostMicros: string;
    priorCostMicros: string;
    deltaPct: number;
    activeDevelopers: number;
    topModel: string;
  };
  dailyByDev: Array<{ date: string; name: string; cost: number }>;
  dailyByProvider: Array<{ date: string; name: string; cost: number }>;
  dailyByModel: Array<{ date: string; name: string; cost: number }>;
  devRanking: Array<{
    developerId: string;
    name: string;
    totalCost: string;
    pctOfOrg: number;
    keyCount: number;
  }>;
};

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "MTD" },
];

function fmtCost(micros: string | bigint | number): string {
  const value = Number(micros) / 1_000_000;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DashboardClient({
  data,
  range,
  from,
  to,
}: {
  data: DashboardData;
  range: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [chartMode, setChartMode] = useState<"developer" | "provider" | "model">("developer");

  const chartData =
    chartMode === "developer"
      ? data.dailyByDev
      : chartMode === "provider"
        ? data.dailyByProvider
        : data.dailyByModel;

  const isEmpty = Number(data.stats.totalCostMicros) === 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              variant={range === r.key ? "default" : "outline"}
              size="sm"
              onClick={() => router.push(`/dashboard?range=${r.key}`)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">Total spend</CardTitle>
            <DollarSign className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtCost(data.stats.totalCostMicros)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">vs prior period</CardTitle>
            <TrendingUp className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold">
                {data.stats.deltaPct > 0 ? "+" : ""}
                {data.stats.deltaPct.toFixed(1)}%
              </p>
              {data.stats.deltaPct > 0 ? (
                <ArrowUp className="h-4 w-4 text-red-500" />
              ) : data.stats.deltaPct < 0 ? (
                <ArrowDown className="h-4 w-4 text-green-500" />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">Active developers</CardTitle>
            <Users className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.stats.activeDevelopers}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">Most-used model</CardTitle>
            <Cpu className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold truncate">{data.stats.topModel}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daily spend</CardTitle>
          <div className="flex gap-1">
            {(["developer", "provider", "model"] as const).map((m) => (
              <Button
                key={m}
                variant={chartMode === m ? "default" : "outline"}
                size="sm"
                onClick={() => setChartMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              No usage data yet. Add provider keys and run ingestion to see data here.
            </div>
          ) : (
            <SpendChart data={chartData} />
          )}
        </CardContent>
      </Card>

      {/* Developer ranking */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Developers by spend</CardTitle>
        </CardHeader>
        <CardContent>
          {data.devRanking.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              No developer data for this period.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Developer</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                    <TableHead className="text-right">% of org</TableHead>
                    <TableHead className="text-right">Keys</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.devRanking.map((dev) => (
                    <TableRow key={dev.developerId}>
                      <TableCell>
                        <Link
                          href={`/developers/${dev.developerId}`}
                          className="font-medium hover:underline"
                        >
                          {dev.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtCost(dev.totalCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {dev.pctOfOrg.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {dev.keyCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent anomalies placeholder */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent anomalies</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-zinc-500">
            No anomalies yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
