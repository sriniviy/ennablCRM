import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useGetDashboardStats, useGetDashboardActivityFeed, useListTasks } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CircleDollarSign, Target, CheckSquare, Clock, CheckCheck, AlertCircle, CalendarClock, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

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

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetDashboardActivityFeed({ limit: 10 });
  const { data: tasksData, isLoading: tasksLoading } = useListTasks({ filter: "open", pageSize: 8 });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back. Here's what's happening today.</p>
        </div>

        {statsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : stats ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.pipelineValue)}</div>
                <p className="text-xs text-muted-foreground">Across {stats.openDeals} open deals</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Won This Month</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.wonValueThisMonth)}</div>
                <p className="text-xs text-muted-foreground">From {stats.wonDealsThisMonth} deals</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalContacts}</div>
                <p className="text-xs text-muted-foreground">Across {stats.totalCompanies} companies</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tasks Due</CardTitle>
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.tasksDueToday}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive font-medium">{stats.tasksOverdue} overdue</span> tasks
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates from your team</CardDescription>
            </CardHeader>
            <CardContent>
              {feedLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : feed && feed.length > 0 ? (
                <div className="space-y-5">
                  {feed.map(activity => (
                    <div key={activity.id} className="flex items-start gap-4">
                      <div className="bg-muted p-2 rounded-full mt-0.5 shrink-0">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <p className="text-sm font-medium leading-snug">{activity.title}</p>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{activity.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.createdAt).toLocaleString()}
                          {activity.user && ` · ${activity.user.name || "User"}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No recent activity found.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Upcoming Tasks</CardTitle>
              <CardDescription>Open tasks ordered by due date</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {tasksLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : tasksData?.data && tasksData.data.length > 0 ? (
                <div className="space-y-1">
                  {tasksData.data.map(task => {
                    const { label, cls } = dueDateLabel(task.dueDate);
                    const isOverdue = cls.includes("destructive");
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-muted/50",
                          isOverdue && "bg-destructive/5 hover:bg-destructive/10"
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isOverdue
                            ? <AlertCircle className="h-4 w-4 text-destructive" />
                            : <CalendarClock className="h-4 w-4 text-muted-foreground" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium leading-tight line-clamp-1">{task.title}</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", PRIORITY_STYLES[task.priority])}>
                              {task.priority}
                            </Badge>
                          </div>
                          <p className={cn("text-xs mt-0.5", cls)}>{label}</p>
                          {(task.contact || task.deal) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.contact
                                ? `${task.contact.firstName} ${task.contact.lastName ?? ""}`.trim()
                                : task.deal?.title}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <CheckCheck className="h-8 w-8" />
                  <p className="text-sm font-medium">All caught up!</p>
                  <p className="text-xs">No open tasks right now.</p>
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-4 pt-2 border-t mt-auto">
              <Link href="/tasks" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                View all tasks <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </SidebarLayout>
  );
}
