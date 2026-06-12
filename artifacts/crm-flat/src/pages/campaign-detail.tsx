import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import { useGetCampaign } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Mail, MailOpen, MousePointerClick, UserMinus, Search, XCircle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { authClient } from "@/lib/auth-client";

interface Recipient {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  unsubscribedAt: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  SENT: { label: "Sent", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  OPENED: { label: "Opened", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  CLICKED: { label: "Clicked", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  UNSUBSCRIBED: { label: "Unsubscribed", color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  BOUNCED: { label: "Bounced", color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
};

function StatFunnel({ total, sent, opened, clicked, unsubscribed }: { total: number; sent: number; opened: number; clicked: number; unsubscribed: number }) {
  const steps = [
    { label: "Sent", count: sent, icon: <Mail className="h-4 w-4" />, color: "text-blue-600", bar: "bg-blue-500" },
    { label: "Opened", count: opened, icon: <MailOpen className="h-4 w-4" />, color: "text-green-600", bar: "bg-green-500", rate: sent > 0 ? Math.round((opened / sent) * 100) : 0 },
    { label: "Clicked", count: clicked, icon: <MousePointerClick className="h-4 w-4" />, color: "text-purple-600", bar: "bg-purple-500", rate: sent > 0 ? Math.round((clicked / sent) * 100) : 0 },
    { label: "Unsubscribed", count: unsubscribed, icon: <UserMinus className="h-4 w-4" />, color: "text-red-600", bar: "bg-red-400", rate: sent > 0 ? Math.round((unsubscribed / sent) * 100) : 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {steps.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card p-4">
          <div className={`flex items-center gap-1.5 ${s.color} mb-2`}>
            {s.icon}
            <span className="text-xs font-medium">{s.label}</span>
          </div>
          <div className="text-2xl font-bold">{s.count.toLocaleString()}</div>
          {"rate" in s && (
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${s.rate}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{s.rate}% rate</p>
            </div>
          )}
          {total > 0 && !("rate" in s) && (
            <p className="text-xs text-muted-foreground mt-1">of {total} total</p>
          )}
        </div>
      ))}
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "SENT": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "SENDING": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "DRAFT": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    case "SCHEDULED": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "CANCELLED": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-800";
  }
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading } = useGetCampaign(id);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const getHeaders = useCallback(async () => {
    const { data } = await authClient.getSession();
    return { "Authorization": `Bearer ${data?.session?.token ?? ""}` };
  }, []);

  useEffect(() => {
    if (!id) return;
    setRecipientsLoading(true);
    getHeaders().then(headers =>
      fetch(`/api/campaigns/${id}/recipients`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(setRecipients)
        .catch(() => {})
        .finally(() => setRecipientsLoading(false))
    );
  }, [id, getHeaders]);

  const handleCancelSchedule = async () => {
    if (!id || !window.confirm("Cancel this scheduled campaign? It will revert to Draft.")) return;
    setCancelling(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/campaigns/${id}/cancel`, { method: "PATCH", headers });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setCancelling(false);
    }
  };

  const filtered = search
    ? recipients.filter(r =>
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.toLowerCase().includes(search.toLowerCase()) ||
        r.email.toLowerCase().includes(search.toLowerCase())
      )
    : recipients;

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-4 max-w-5xl mx-auto">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-3 md:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      </SidebarLayout>
    );
  }

  if (!campaign) {
    return (
      <SidebarLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Campaign not found</h2>
          <Button asChild variant="outline"><Link href="/campaigns">Back</Link></Button>
        </div>
      </SidebarLayout>
    );
  }

  const stats = campaign.stats as { total: number; sent: number; opened: number; clicked: number; unsubscribed?: number; openRate: number; clickRate: number };

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
            <Link href="/campaigns"><ArrowLeft className="mr-2 h-4 w-4" /> Campaigns</Link>
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Subject: {campaign.subject}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`font-normal text-sm px-3 py-1 border-0 ${getStatusColor(campaign.status)}`}>
                {campaign.status}
              </Badge>
              {campaign.status === "SCHEDULED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={handleCancelSchedule}
                  disabled={cancelling}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {cancelling ? "Cancelling…" : "Cancel Schedule"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <StatFunnel
          total={stats.total}
          sent={stats.sent}
          opened={stats.opened}
          clicked={stats.clicked}
          unsubscribed={stats.unsubscribed ?? 0}
        />

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            {recipients.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" /> Recipients
                    </CardTitle>
                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-sm" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-hidden rounded-b-xl">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-muted/40 border-b">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Contact</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Sent</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Opened</th>
                      </tr></thead>
                      <tbody>
                        {recipientsLoading
                          ? [...Array(3)].map((_, i) => (
                              <tr key={i} className="border-b"><td colSpan={4} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                            ))
                          : filtered.slice(0, 100).map(r => {
                              const st = STATUS_LABELS[r.status] ?? STATUS_LABELS["SENT"];
                              return (
                                <tr key={r.contactId} className="border-b last:border-0 hover:bg-muted/20">
                                  <td className="px-4 py-2.5">
                                    <p className="font-medium">{r.firstName} {r.lastName}</p>
                                    <p className="text-xs text-muted-foreground">{r.email}</p>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                    {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                    {r.openedAt ? new Date(r.openedAt).toLocaleString() : "—"}
                                  </td>
                                </tr>
                              );
                            })
                        }
                      </tbody>
                    </table>
                    {!recipientsLoading && filtered.length > 100 && (
                      <p className="text-center text-xs text-muted-foreground py-2">Showing 100 of {filtered.length}</p>
                    )}
                    {!recipientsLoading && filtered.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">No recipients yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Email Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden bg-[#f9fafb]">
                  <div className="border-b bg-white px-4 py-3 text-sm space-y-0.5">
                    <p><span className="font-medium text-muted-foreground w-16 inline-block">From:</span> {campaign.fromName} &lt;{campaign.fromEmail}&gt;</p>
                    <p><span className="font-medium text-muted-foreground w-16 inline-block">Subject:</span> {campaign.subject}</p>
                  </div>
                  <iframe
                    srcDoc={campaign.htmlContent}
                    title="Email preview"
                    className="w-full"
                    style={{ height: 500, border: "none" }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><p className="text-muted-foreground text-xs mb-1">Created</p><p className="font-medium">{new Date(campaign.createdAt).toLocaleString()}</p></div>
                {campaign.sentAt && <div><p className="text-muted-foreground text-xs mb-1">Sent</p><p className="font-medium">{new Date(campaign.sentAt).toLocaleString()}</p></div>}
                {campaign.scheduledAt && !campaign.sentAt && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Scheduled For</p>
                    <p className="font-medium">{new Date(campaign.scheduledAt).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
