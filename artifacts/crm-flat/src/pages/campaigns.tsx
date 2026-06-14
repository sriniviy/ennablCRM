import { useState, useCallback } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useListCampaigns } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Mail, Calendar, Pencil, Trash2, Loader2, Share2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import { ShareDialog } from "@/components/contacts/share-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { data, isLoading, refetch } = useListCampaigns({ page: 1, pageSize: 50 });
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareCampaign, setShareCampaign] = useState<{ id: string; name: string; subject: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const getHeaders = useCallback(async () => {
    const { data: s } = await authClient.getSession();
    return { "Authorization": `Bearer ${s?.session?.token ?? ""}` };
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete the draft "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Draft deleted" });
      refetch();
    } catch {
      toast({ title: "Failed to delete draft", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

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
            <Button variant="outline" asChild>
              <Link href="/segments">Segments</Link>
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
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((campaign) => {
                  const stats = campaign.stats as { sent: number; openRate: number; clickRate: number; unsubscribed?: number };
                  const isDraft = campaign.status === "DRAFT";
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {isDraft ? (
                          <Link href={`/campaigns/new?id=${campaign.id}`} className="flex items-center gap-2 hover:underline text-primary">
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p>{campaign.name}</p>
                              <p className="text-xs text-muted-foreground font-normal">{campaign.subject || <span className="italic">No subject</span>}</p>
                            </div>
                          </Link>
                        ) : (
                          <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2 hover:underline text-primary">
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <p>{campaign.name}</p>
                              <p className="text-xs text-muted-foreground font-normal">{campaign.subject}</p>
                            </div>
                          </Link>
                        )}
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
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => { setShareCampaign(campaign); setShareOpen(true); }}
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Share campaign</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {isDraft && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Continue editing">
                                <Link href={`/campaigns/new?id=${campaign.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Delete draft" disabled={deletingId === campaign.id}
                                onClick={() => handleDelete(campaign.id, campaign.name)}
                              >
                                {deletingId === campaign.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
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
      <ShareDialog
        record={shareCampaign ? { id: shareCampaign.id, name: shareCampaign.name, subtitle: shareCampaign.subject, type: "campaign" } : null}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </SidebarLayout>
  );
}
