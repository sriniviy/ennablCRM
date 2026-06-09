import { useState, useCallback } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Trophy, XCircle, Target, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Range = "month" | "quarter" | "all";

const RANGE_LABELS: Record<Range, string> = {
  month: "This Month",
  quarter: "This Quarter",
  all: "All Time",
};

interface PipelineRow {
  stageId: string;
  stageName: string;
  stageColor: string;
  stageOrder: number;
  dealCount: number;
  totalValue: number;
  avgValue: number;
}

interface WinLossData {
  range: string;
  won: { count: number; value: number };
  lost: { count: number; value: number };
  winRate: number;
}

interface ForecastData {
  forecastValue: number;
  openDeals: number;
  totalPipelineValue: number;
  stageBreakdown: {
    stageName: string;
    stageOrder: number;
    dealCount: number;
    weightedValue: number;
    rawValue: number;
  }[];
  byAssignee: {
    assigneeId: string;
    assigneeName: string | null;
    dealCount: number;
    totalValue: number;
    weightedValue: number;
  }[];
}

function useReportsData(range: Range) {
  const { getToken } = useAuth();

  const authFetch = useCallback(
    async (url: string) => {
      const token = await getToken();
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [getToken],
  );

  const pipeline = useQuery<PipelineRow[]>({
    queryKey: ["reports", "pipeline"],
    queryFn: () => authFetch(`${BASE}/api/reports/pipeline`),
    staleTime: 60_000,
  });

  const winLoss = useQuery<WinLossData>({
    queryKey: ["reports", "win-loss", range],
    queryFn: () => authFetch(`${BASE}/api/reports/win-loss?range=${range}`),
    staleTime: 60_000,
  });

  const forecast = useQuery<ForecastData>({
    queryKey: ["reports", "forecast"],
    queryFn: () => authFetch(`${BASE}/api/reports/forecast`),
    staleTime: 60_000,
  });

  return { pipeline, winLoss, forecast };
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const customTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

export function ReportsPage() {
  const [range, setRange] = useState<Range>("month");
  const { pipeline, winLoss, forecast } = useReportsData(range);

  const pipelineData = pipeline.data ?? [];
  const openStages = pipelineData.filter(
    (s) => s.stageName !== "Won" && s.stageName !== "Lost",
  );

  return (
    <SidebarLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
              Pipeline health, win rates, and revenue forecast.
            </p>
          </div>
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            {(["month", "quarter", "all"] as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? "default" : "ghost"}
                className="text-xs h-7"
                onClick={() => setRange(r)}
              >
                {RANGE_LABELS[r]}
              </Button>
            ))}
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Forecast Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {forecast.isLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(forecast.data?.forecastValue ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Probability-weighted open pipeline
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deals Won</CardTitle>
              <Trophy className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              {winLoss.isLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {winLoss.data?.won.count ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(winLoss.data?.won.value ?? 0)} ·{" "}
                    {RANGE_LABELS[range].toLowerCase()}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deals Lost</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {winLoss.isLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-destructive">
                    {winLoss.data?.lost.count ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(winLoss.data?.lost.value ?? 0)} ·{" "}
                    {RANGE_LABELS[range].toLowerCase()}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {winLoss.isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {winLoss.data?.winRate ?? 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Won / (Won + Lost) · {RANGE_LABELS[range].toLowerCase()}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Pipeline Funnel Chart ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline by Stage</CardTitle>
              <CardDescription>Deal count per stage across all open opportunities</CardDescription>
            </CardHeader>
            <CardContent>
              {pipeline.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : openStages.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={openStages} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number, name: string) => {
                        if (name === "totalValue") return [formatCurrency(value), "Total Value"];
                        return [value, "Deals"];
                      }}
                    />
                    <Legend
                      formatter={(v) => v === "dealCount" ? "# Deals" : "Value"}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="dealCount" name="dealCount" radius={[4, 4, 0, 0]}>
                      {openStages.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No open deals yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Value Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Value by Stage</CardTitle>
              <CardDescription>Total deal value in each stage</CardDescription>
            </CardHeader>
            <CardContent>
              {pipeline.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : openStages.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={openStages} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number) => [formatCurrency(value), "Total Value"]}
                    />
                    <Bar dataKey="totalValue" name="totalValue" radius={[4, 4, 0, 0]}>
                      {openStages.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No open deals yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Forecast Stage Breakdown + Assignee Table ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Weighted Forecast by Stage</CardTitle>
              <CardDescription>
                Open pipeline value × stage probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecast.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (forecast.data?.stageBreakdown ?? []).filter(s => s.dealCount > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={(forecast.data?.stageBreakdown ?? []).filter(s => s.dealCount > 0)}
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={customTooltipStyle}
                      formatter={(value: number, name: string) => {
                        if (name === "weightedValue") return [formatCurrency(value), "Weighted"];
                        return [formatCurrency(value as number), "Raw Value"];
                      }}
                    />
                    <Legend
                      formatter={(v) => v === "weightedValue" ? "Weighted" : "Raw"}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="rawValue" name="rawValue" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weightedValue" name="weightedValue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No open deals yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Deals by Assignee
              </CardTitle>
              <CardDescription>
                Open pipeline value attributed to each team member
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecast.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (forecast.data?.byAssignee ?? []).length > 0 ? (
                <div className="space-y-0 divide-y divide-border">
                  <div className="grid grid-cols-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Assignee</span>
                    <span className="text-right">Deals</span>
                    <span className="text-right">Pipeline Value</span>
                  </div>
                  {(forecast.data?.byAssignee ?? []).map((row) => (
                    <div key={row.assigneeId} className="grid grid-cols-3 py-3 text-sm">
                      <span className="font-medium truncate pr-2">
                        {row.assigneeName ?? "Unknown"}
                      </span>
                      <span className="text-right text-muted-foreground">{row.dealCount}</span>
                      <span className="text-right font-medium">{formatCurrency(row.totalValue)}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 py-3 text-sm border-t-2">
                    <span className="font-semibold text-muted-foreground">Unassigned</span>
                    <span />
                    <span className="text-right text-muted-foreground text-xs">
                      (not shown above)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <Users className="h-8 w-8 opacity-30" />
                  <p>No assigned deals yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Win / Loss Detail ── */}
        <Card>
          <CardHeader>
            <CardTitle>Win / Loss Breakdown — {RANGE_LABELS[range]}</CardTitle>
            <CardDescription>
              Closed deals split by outcome for the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {winLoss.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Won</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {winLoss.data?.won.count ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(winLoss.data?.won.value ?? 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Lost</p>
                  <p className="text-3xl font-bold text-destructive">
                    {winLoss.data?.lost.count ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(winLoss.data?.lost.value ?? 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Win Rate</p>
                  <p className="text-3xl font-bold">{winLoss.data?.winRate ?? 0}%</p>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${winLoss.data?.winRate ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarLayout>
  );
}
