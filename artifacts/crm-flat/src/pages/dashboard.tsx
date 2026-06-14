import { useState } from "react";
import { Link } from "wouter";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import {
  useGetDashboardStats,
  useGetDashboardActivityFeed,
  useListTasks,
  useCompleteTask,
  getListTasksQueryKey,
  useListCampaigns,
  CampaignStatus,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, CircleDollarSign, Target, CheckSquare, Clock, CheckCheck,
  AlertCircle, ArrowRight, Mail, Zap, Send, CalendarDays, Globe,
  TrendingUp, Sparkles, ExternalLink, Radio,
} from "lucide-react";

// ─── Priority styles ──────────────────────────────────────────────────────────
const PRIORITY_STYLES: Record<string, string> = {
  HIGH:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  LOW:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function dueDateLabel(dueDate: string | null | undefined): { label: string; cls: string } {
  if (!dueDate) return { label: "No due date", cls: "text-muted-foreground" };
  const due = new Date(dueDate);
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  if (due < todayStart) return { label: `Overdue · ${due.toLocaleDateString()}`, cls: "text-destructive font-medium" };
  if (due <= todayEnd) return { label: "Due today", cls: "text-amber-600 dark:text-amber-400 font-medium" };
  const diff = Math.ceil((due.getTime() - todayEnd.getTime()) / 86_400_000);
  if (diff === 1) return { label: "Due tomorrow", cls: "text-muted-foreground" };
  return { label: `Due ${due.toLocaleDateString()}`, cls: "text-muted-foreground" };
}

// ─── Insurance industry events (curated) ─────────────────────────────────────
const INSURANCE_EVENTS = [
  {
    id: 1,
    name: "IIABA Legislative Summit",
    org: "Independent Insurance Agents & Brokers of America",
    location: "Washington, D.C.",
    date: new Date("2026-04-14"),
    endDate: new Date("2026-04-15"),
    type: "Legislative",
    url: "https://www.iiaba.net",
    hot: false,
  },
  {
    id: 2,
    name: "RIMS Annual Conference & Exhibition",
    org: "Risk and Insurance Management Society",
    location: "San Antonio, TX",
    date: new Date("2026-04-27"),
    endDate: new Date("2026-04-30"),
    type: "Conference",
    url: "https://www.rims.org",
    hot: true,
  },
  {
    id: 3,
    name: "Dig In — Digital Insurance",
    org: "Digital Insurance",
    location: "Nashville, TN",
    date: new Date("2026-05-12"),
    endDate: new Date("2026-05-14"),
    type: "Insurtech",
    url: "https://www.dig-in.com",
    hot: true,
  },
  {
    id: 4,
    name: "NABIP Annual Convention",
    org: "National Association of Benefits & Insurance Professionals",
    location: "Nashville, TN",
    date: new Date("2026-06-20"),
    endDate: new Date("2026-06-23"),
    type: "Benefits",
    url: "https://www.nabip.org",
    hot: true,
  },
  {
    id: 5,
    name: "PIA National Convention",
    org: "Professional Insurance Agents",
    location: "Denver, CO",
    date: new Date("2026-07-10"),
    endDate: new Date("2026-07-12"),
    type: "Conference",
    url: "https://www.pianet.com",
    hot: false,
  },
  {
    id: 6,
    name: "Applied Net",
    org: "Applied Systems",
    location: "San Diego, CA",
    date: new Date("2026-09-21"),
    endDate: new Date("2026-09-24"),
    type: "Technology",
    url: "https://www.applied.com",
    hot: true,
  },
  {
    id: 7,
    name: "InsureTech Connect (ITC Vegas)",
    org: "ITC",
    location: "Las Vegas, NV",
    date: new Date("2026-10-06"),
    endDate: new Date("2026-10-08"),
    type: "Insurtech",
    url: "https://itcvegas.com",
    hot: true,
  },
  {
    id: 8,
    name: "SIIA National Summit",
    org: "Self-Insurance Institute of America",
    location: "Chicago, IL",
    date: new Date("2026-10-19"),
    endDate: new Date("2026-10-21"),
    type: "Benefits",
    url: "https://www.siia.org",
    hot: false,
  },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  Legislative: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  Conference: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  Insurtech: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Benefits: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Technology: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
};

function formatEventDate(start: Date, end: Date) {
  const same = start.getMonth() === end.getMonth();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (same) {
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${end.getDate()}`;
  }
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

// ─── Market Intelligence data ─────────────────────────────────────────────────
const MARKET_INTEL = [
  {
    id: 1,
    headline: "Hard market persists in commercial lines",
    summary:
      "Commercial property and casualty rates rose 6–9% in Q1 2026, driven by reinsurance cost increases and elevated nat-cat losses. Brokers with analytics-backed renewal narratives are achieving better retention.",
    tag: "Market Conditions",
    tagClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    date: "May 2026",
  },
  {
    id: 2,
    headline: "AI underwriting compresses quote timelines",
    summary:
      "Several top-10 carriers launched AI-assisted underwriting pilots, cutting mid-market SME quote turnaround from 5 days to under 4 hours. Brokers report needing to upgrade submission quality to avoid instant declines.",
    tag: "Technology",
    tagClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    date: "Apr 2026",
  },
  {
    id: 3,
    headline: "Mental health parity enforcement intensifies",
    summary:
      "DOL and IRS issued new final rules requiring quantitative NQTLs comparisons in annual compliance filings. Benefits brokers advising groups with 100+ lives face increased liability without specialist support.",
    tag: "Compliance",
    tagClass: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    date: "Mar 2026",
  },
  {
    id: 4,
    headline: "Embedded P&C pressures SMB broker distribution",
    summary:
      "Fintechs and B2B SaaS platforms are bundling commercial P&C and group benefits products directly into payroll and HR software, capturing SMB accounts historically owned by independent brokers. Key defence: consultative advisory, complex risk placement, and claims advocacy that digital-only channels cannot replicate.",
    tag: "Competitive",
    tagClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    date: "Mar 2026",
  },
  {
    id: 5,
    headline: "Cyber insurance stabilising after three years of volatility",
    summary:
      "Cyber rates declined 3–5% on average in 2026 renewals as carrier competition returned following improved loss ratios. Brokers citing client security controls and incident response plans are achieving best-in-class terms.",
    tag: "Cyber",
    tagClass: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    date: "Feb 2026",
  },
];

// ─── Sequence type ────────────────────────────────────────────────────────────
type SequenceSummary = {
  id: string;
  name: string;
  stepCount: number;
  activeEnrollments: number;
  totalEnrollments: number;
};

// ─── Main component ───────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetDashboardActivityFeed({ limit: 5 });
  const { data: tasksData, isLoading: tasksLoading } = useListTasks({ filter: "open", pageSize: 5 });
  const { data: campaignsData, isLoading: campaignsLoading } = useListCampaigns({ pageSize: 20 });
  const completeTask = useCompleteTask();
  const queryClient = useQueryClient();
  const getToken = useSessionToken();

  const [intelTab, setIntelTab] = useState<"events" | "market">("events");

  // Sequences — direct fetch (no generated hook)
  const { data: sequences = [], isLoading: seqLoading } = useQuery<SequenceSummary[]>({
    queryKey: ["sequences-dashboard"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/sequences", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load sequences");
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleComplete = (id: string) => {
    queryClient.setQueryData(getListTasksQueryKey({ filter: "open", pageSize: 5 }), (old: any) => {
      if (!old?.data) return old;
      return { ...old, data: old.data.filter((t: any) => t.id !== id) };
    });
    completeTask.mutate({ id, data: { completed: true } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      },
    });
  };

  // Filter to active campaigns
  const activeCampaigns = (campaignsData?.data ?? []).filter(
    (c) => c.status === CampaignStatus.SENDING || c.status === CampaignStatus.SCHEDULED,
  );
  const activeSequences = sequences.filter((s) => s.activeEnrollments > 0);

  // Upcoming events (from today onward)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = INSURANCE_EVENTS.filter((e) => e.endDate >= today).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const nextEvent = upcomingEvents[0];
  const daysUntilNext = nextEvent
    ? Math.ceil((nextEvent.date.getTime() - today.getTime()) / 86_400_000)
    : null;

  return (
    <SidebarLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back. Here's what's happening today.</p>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        {statsLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : stats ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card className="py-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4 pt-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Pipeline Value</CardTitle>
                <CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-0">
                <div className="text-xl font-bold">{formatCurrency(stats.pipelineValue)}</div>
                <p className="text-xs text-muted-foreground">Across {stats.openDeals} open deals</p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4 pt-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Won This Month</CardTitle>
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-0">
                <div className="text-xl font-bold">{formatCurrency(stats.wonValueThisMonth)}</div>
                <p className="text-xs text-muted-foreground">From {stats.wonDealsThisMonth} deals</p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4 pt-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Contacts</CardTitle>
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-0">
                <div className="text-xl font-bold">{stats.totalContacts}</div>
                <p className="text-xs text-muted-foreground">Across {stats.totalCompanies} companies</p>
              </CardContent>
            </Card>

            <Card className="py-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-4 pt-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Tasks Due</CardTitle>
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-0">
                <div className="text-xl font-bold">{stats.tasksDueToday}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive font-medium">{stats.tasksOverdue} overdue</span> tasks
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* ── Row 2: Activity · Tasks · Ongoing Engage ────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Compact Recent Activity */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
                <span className="text-[10px] text-muted-foreground">Last 5 events</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-3">
              {feedLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
              ) : feed && feed.length > 0 ? (
                <div className="space-y-0 divide-y">
                  {feed.map(activity => (
                    <div key={activity.id} className="flex items-start gap-2.5 py-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-snug line-clamp-1">{activity.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(activity.createdAt).toLocaleString("en-US", {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}
                          {activity.user && ` · ${activity.user.name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                  No recent activity.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compact Upcoming Tasks */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Upcoming Tasks</CardTitle>
                <Link href="/tasks" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  View all <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-3">
              {tasksLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
              ) : tasksData?.data && tasksData.data.length > 0 ? (
                <div className="space-y-0 divide-y">
                  {tasksData.data.map(task => {
                    const { label, cls } = dueDateLabel(task.dueDate);
                    const isOverdue = cls.includes("destructive");
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start gap-2.5 py-2 rounded-sm transition-colors",
                          isOverdue && "bg-destructive/5",
                        )}
                      >
                        <Checkbox
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          checked={false}
                          onCheckedChange={() => handleComplete(task.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium line-clamp-1 leading-tight">{task.title}</span>
                            <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-3.5 shrink-0", PRIORITY_STYLES[task.priority])}>
                              {task.priority}
                            </Badge>
                          </div>
                          <p className={cn("text-[10px] mt-0.5", cls)}>{label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-muted-foreground">
                  <CheckCheck className="h-6 w-6" />
                  <p className="text-xs font-medium">All caught up!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ongoing Campaigns & Sequences */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Ongoing Engage</CardTitle>
                <div className="flex gap-2">
                  <Link href="/campaigns" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">Campaigns</Link>
                  <span className="text-[10px] text-muted-foreground">/</span>
                  <Link href="/sequences" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">Sequences</Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-3 space-y-3">
              {/* Active Campaigns */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Campaigns
                </p>
                {campaignsLoading ? (
                  <div className="space-y-1.5">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : activeCampaigns.length > 0 ? (
                  <div className="space-y-1">
                    {activeCampaigns.slice(0, 3).map((c) => (
                      <Link key={c.id} href={`/campaigns/${c.id}`}>
                        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors group cursor-pointer">
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            c.status === CampaignStatus.SENDING ? "bg-green-500 animate-pulse" : "bg-amber-400",
                          )} />
                          <p className="flex-1 text-xs font-medium truncate">{c.name}</p>
                          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                            {c.status === CampaignStatus.SENDING ? "Live" : "Sched"}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground pl-1">No active campaigns</p>
                )}
              </div>

              <div className="border-t" />

              {/* Active Sequences */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Sequences
                </p>
                {seqLoading ? (
                  <div className="space-y-1.5">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : activeSequences.length > 0 ? (
                  <div className="space-y-1">
                    {activeSequences.slice(0, 3).map((s) => (
                      <Link key={s.id} href={`/sequences/${s.id}`}>
                        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="h-1.5 w-1.5 rounded-full shrink-0 bg-blue-500 animate-pulse" />
                          <p className="flex-1 text-xs font-medium truncate">{s.name}</p>
                          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                            {s.activeEnrollments} active
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground pl-1">No active sequences</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3: Insurance Intel · Deep Email Analysis ─────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Insurance Events + Market Intel — tabbed, 2/3 width */}
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="pb-0 pt-4 px-4">
              <div className="flex items-center justify-between mb-3">
                <CardTitle className="text-sm font-semibold">Industry Intelligence</CardTitle>
                {intelTab === "events" && daysUntilNext != null && (
                  <span className="text-[10px] text-muted-foreground">
                    Next event in <span className="font-semibold text-foreground">{daysUntilNext}d</span>
                  </span>
                )}
              </div>
              {/* Tabs */}
              <div className="flex gap-1 border-b">
                {(["events", "market"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setIntelTab(tab)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                      intelTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab === "events" ? <CalendarDays className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {tab === "events" ? "Insurance Events" : "Market Intelligence"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pt-3 pb-3">

              {intelTab === "events" && (
                <div className="space-y-0 divide-y">
                  {upcomingEvents.map((event) => {
                    const isPast = event.endDate < today;
                    const isThisMonth =
                      event.date.getFullYear() === today.getFullYear() &&
                      event.date.getMonth() === today.getMonth();
                    return (
                      <div key={event.id} className={cn("flex items-start gap-3 py-2.5", isPast && "opacity-40")}>
                        {/* Date block */}
                        <div className={cn(
                          "flex flex-col items-center justify-center h-10 w-10 rounded-lg shrink-0 text-center",
                          isThisMonth ? "bg-primary/10" : "bg-muted",
                        )}>
                          <span className="text-[9px] uppercase font-semibold text-muted-foreground leading-none">
                            {event.date.toLocaleDateString("en-US", { month: "short" })}
                          </span>
                          <span className="text-sm font-bold leading-tight">{event.date.getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold">{event.name}</p>
                            {event.hot && (
                              <span className="text-[9px] bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 px-1.5 py-0.5 rounded font-semibold">
                                🔥 Key event
                              </span>
                            )}
                            <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 shrink-0", EVENT_TYPE_COLORS[event.type] ?? "")}>
                              {event.type}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatEventDate(event.date, event.endDate)} · {event.location}
                          </p>
                        </div>
                        {event.url !== "#" && (
                          <a href={event.url} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-1">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {intelTab === "market" && (
                <div className="space-y-0 divide-y">
                  {MARKET_INTEL.map((item) => (
                    <div key={item.id} className="py-3">
                      <div className="flex items-start gap-2 mb-1">
                        <p className="flex-1 text-xs font-semibold leading-snug">{item.headline}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", item.tagClass)}>
                            {item.tag}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{item.date}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{item.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deep Email Analysis — 1/3 width */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-100 dark:bg-purple-950/40">
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Email Insights</CardTitle>
                  <CardDescription className="text-[10px]">AI-surfaced from your inbox</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-4">
              <div className="rounded-xl border bg-muted/30 p-4 flex flex-col items-center text-center gap-3 h-full justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Gmail not connected</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Once you connect Gmail, the AI Email Summarization agent will surface key themes, sentiment signals, and follow-up opportunities here.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <Link href="/settings/integrations">
                    <button className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                      <Globe className="h-3 w-3" />
                      Connect Gmail
                    </button>
                  </Link>
                  <Link href="/automations">
                    <button className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      <Radio className="h-3 w-3" />
                      Configure analysis
                    </button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </SidebarLayout>
  );
}
