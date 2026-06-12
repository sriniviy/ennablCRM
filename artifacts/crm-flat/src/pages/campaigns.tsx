import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useListCampaigns } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Mail, Calendar } from "lucide-react";

function StatusBadge({ status, scheduledAt }: { status: string; scheduledAt?: string | null }) {
  if (status === "SCHEDULED" && scheduledAt) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="font-normal border-0 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 w-fit">
          Scheduled
        </Badge>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {new Date(scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  }

  const colors: Record<string, string> = {
    SENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    SENDING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <Badge variant="outline" className={`font-normal border-0 ${colors[status] ?? colors.DRAFT}`}>
      {status}
    </Badge>
  );
}

export function CampaignsPage() {
  const { data, isLoading } = useListCampaigns({ page: 1, pageSize: 50 });

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground">Engage your audience with email campaigns.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/sequences">Sequences</Link>
            </Button>
            <Button asChild data-testid="btn-new-campaign">
              <Link href="/campaigns/new">
                <Plus className="mr-2 h-4 w-4" /> Create Campaign
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Click Rate</TableHead>
                <TableHead className="text-right">Unsubscribed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((campaign) => {
                  const stats = campaign.stats as { sent: number; openRate: number; clickRate: number; unsubscribed?: number };
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2 hover:underline text-primary">
                          <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p>{campaign.name}</p>
                            <p className="text-xs text-muted-foreground font-normal">{campaign.subject}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={campaign.status} scheduledAt={campaign.scheduledAt} />
                      </TableCell>
                      <TableCell className="text-right font-medium">{stats.sent.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {stats.sent > 0 ? `${stats.openRate}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {stats.sent > 0 ? `${stats.clickRate}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(stats.unsubscribed ?? 0) > 0 ? (
                          <span className="text-red-500">{stats.unsubscribed}</span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Mail className="h-8 w-8 mb-2 opacity-50" />
                      <p>No campaigns yet.</p>
                      <Button variant="link" asChild className="mt-2">
                        <Link href="/campaigns/new">Create your first campaign</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </SidebarLayout>
  );
}
