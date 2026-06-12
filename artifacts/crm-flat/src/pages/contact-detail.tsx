import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link, useSearch } from "wouter";
import { useGetContact, useCreateActivity, getGetContactQueryKey, useGetMe, type ActivityType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, Building2, Calendar, MessageSquare, Linkedin, CheckSquare, Pencil, CopyCheck, Send, Eye, MousePointerClick, BellOff, RefreshCw } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { NotesFeed } from "@/components/notes/notes-feed";
import { useNotesCount } from "@/hooks/use-notes-count";
import { AuditHistory } from "@/components/audit/audit-history";
import { formatCurrency } from "@/lib/utils";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ContactDuplicatesDialog } from "@/components/merge/contact-duplicates";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { CustomFieldsForm } from "@/components/custom-fields/custom-fields-form";
import { useSaveCustomFieldValuesForRecord } from "@/hooks/use-custom-fields";
import { AiSuggestions } from "@/components/ai/ai-suggestions";
import { ActivitySummary } from "@/components/ai/activity-summary";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { useContactCampaigns, useSetContactSubscription } from "@/hooks/use-contact-campaigns";

function NotesTabLabel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data } = useNotesCount(entityType, entityId);
  const count = data?.count ?? 0;
  return (
    <span className="flex items-center gap-1.5">
      Notes
      {count > 0 && (
        <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
          {count}
        </span>
      )}
    </span>
  );
}

type CampaignRow = import("@/hooks/use-contact-campaigns").ContactCampaignRow;

function PerCampaignChart({ data }: { data: CampaignRow[] }) {
  const chartData = data.map(row => ({
    name: row.campaignName.length > 18 ? row.campaignName.slice(0, 17) + "…" : row.campaignName,
    Opened: row.openedAt ? 1 : 0,
    Clicked: row.clickedAt ? 1 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide domain={[0, 1]} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(value: number, name: string) => [value === 1 ? "Yes" : "No", name]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="Opened" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
        <Bar dataKey="Clicked" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function OverTimeChart({ data }: { data: CampaignRow[] }) {
  const byDate: Record<string, { date: string; Sent: number; Opened: number; Clicked: number }> = {};

  const bucket = (iso: string | null) => iso ? iso.slice(0, 10) : null;

  data.forEach(row => {
    const sentDate = bucket(row.sentAt);
    const openDate = bucket(row.openedAt);
    const clickDate = bucket(row.clickedAt);

    const allDates = [...new Set([sentDate, openDate, clickDate].filter(Boolean))] as string[];
    allDates.forEach(d => {
      if (!byDate[d]) byDate[d] = { date: d, Sent: 0, Opened: 0, Clicked: 0 };
    });

    if (sentDate) byDate[sentDate].Sent += 1;
    if (openDate) byDate[openDate].Opened += 1;
    if (clickDate) byDate[clickDate].Clicked += 1;
  });

  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No dated events to display.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            color: "hsl(var(--foreground))",
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="Sent" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="Opened" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="Clicked" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CampaignEngagementChart({ data }: { data: CampaignRow[] }) {
  const [view, setView] = useState<"per-campaign" | "over-time">("per-campaign");
  if (data.length < 2) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {view === "per-campaign" ? "Engagement per Campaign" : "Engagement Over Time"}
        </p>
        <div className="flex items-center gap-1 rounded-md border bg-muted p-0.5">
          <button
            onClick={() => setView("per-campaign")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              view === "per-campaign"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Per Campaign
          </button>
          <button
            onClick={() => setView("over-time")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              view === "over-time"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Over Time
          </button>
        </div>
      </div>
      {view === "per-campaign" ? <PerCampaignChart data={data} /> : <OverTimeChart data={data} />}
    </div>
  );
}

function ContactCampaignsTab({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const { data, isLoading } = useContactCampaigns(contactId);
  const setSubscription = useSetContactSubscription(contactId);
  const { toast } = useToast();

  const handleSubscriptionToggle = async (action: "unsubscribe" | "resubscribe") => {
    try {
      await setSubscription.mutateAsync(action);
      toast({
        title: action === "unsubscribe" ? "Contact unsubscribed" : "Contact re-subscribed",
        description: action === "unsubscribe"
          ? "This contact will no longer receive campaign emails."
          : "This contact will now receive campaign emails.",
      });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Could not update subscription status",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm">This contact has not received any campaigns yet.</p>;
  }

  const totalSent = data.length;
  const totalOpened = data.filter(r => r.openedAt).length;
  const totalClicked = data.filter(r => r.clickedAt).length;
  const isUnsubscribed = data.some(r => r.status === "UNSUBSCRIBED");
  const openPct = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickPct = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  return (
    <div className="space-y-3">
      {isUnsubscribed ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-destructive/40 bg-destructive/10">
          <span className="flex items-center gap-2 text-destructive text-sm font-medium">
            <BellOff className="h-4 w-4 flex-shrink-0" />
            This contact is unsubscribed and will not receive future campaigns.
          </span>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={setSubscription.isPending}
              onClick={() => handleSubscriptionToggle("resubscribe")}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Re-subscribe
            </Button>
          )}
        </div>
      ) : (
        canEdit && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive hover:border-destructive/50"
              disabled={setSubscription.isPending}
              onClick={() => handleSubscriptionToggle("unsubscribe")}
            >
              <BellOff className="h-3.5 w-3.5 mr-1.5" />
              Unsubscribe
            </Button>
          </div>
        )
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <Send className="h-3.5 w-3.5" />
            Sent
          </span>
          <span className="text-2xl font-semibold tabular-nums">{totalSent}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <Eye className="h-3.5 w-3.5" />
            Opened
          </span>
          <span className="text-2xl font-semibold tabular-nums text-blue-600">{totalOpened}</span>
          <span className="text-xs text-muted-foreground">{openPct}% open rate</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <MousePointerClick className="h-3.5 w-3.5" />
            Clicked
          </span>
          <span className="text-2xl font-semibold tabular-nums text-green-600">{totalClicked}</span>
          <span className="text-xs text-muted-foreground">{clickPct}% click rate</span>
        </div>
      </div>
      <CampaignEngagementChart data={data} />
      {data.map(row => (
        <div key={row.campaignId} className="flex items-start justify-between gap-4 p-4 border rounded-lg bg-card">
          <div className="min-w-0 flex-1">
            <Link href={`/campaigns/${row.campaignId}?from=/contacts/${contactId}`} className="font-medium hover:underline">
              {row.campaignName}
            </Link>
            <p className="text-sm text-muted-foreground mt-0.5">{row.campaignSubject}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              {row.sentAt && (
                <span className="flex items-center gap-1">
                  <Send className="h-3 w-3" />
                  Sent {new Date(row.sentAt).toLocaleString()}
                </span>
              )}
              {row.openedAt && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Eye className="h-3 w-3" />
                  Opened {new Date(row.openedAt).toLocaleString()}
                </span>
              )}
              {row.clickedAt && (
                <span className="flex items-center gap-1 text-green-600">
                  <MousePointerClick className="h-3 w-3" />
                  Clicked {new Date(row.clickedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {row.status === "UNSUBSCRIBED" ? (
              <Badge variant="destructive" className="text-xs">Unsubscribed</Badge>
            ) : row.clickedAt ? (
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Clicked</Badge>
            ) : row.openedAt ? (
              <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50">Opened</Badge>
            ) : row.sentAt ? (
              <Badge variant="outline" className="text-xs">Sent</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Pending</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryString = useSearch();
  const fromParam = new URLSearchParams(queryString).get("from");
  const backHref = fromParam ?? "/contacts";
  const backLabel = fromParam?.startsWith("/campaigns/") ? "Campaign" : "Back";
  const { data: contact, isLoading } = useGetContact(id);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const [actType, setActType] = useState<string>("NOTE");
  const [actTitle, setActTitle] = useState("");
  const [note, setNote] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [actCfValues, setActCfValues] = useState<Record<string, string | null>>({});
  const createActivity = useCreateActivity();
  const saveActivityCf = useSaveCustomFieldValuesForRecord("activity");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEmailType = actType.startsWith("EMAIL");

  const createActivityMutate = useRef(createActivity.mutateAsync);
  createActivityMutate.current = createActivity.mutateAsync;

  const resetActivityForm = () => {
    setActType("NOTE"); setActTitle(""); setNote(""); setEndDate("");
    setEmailSubject(""); setEmailBody(""); setAiSummary(""); setActCfValues({});
  };

  const canLog = !!(note.trim() || actTitle.trim() || emailSubject.trim());

  const handleLogActivity = async () => {
    if (!canLog) return;
    const title =
      actTitle.trim() ||
      (isEmailType ? emailSubject.trim() : "") ||
      note.trim().slice(0, 60) ||
      "Activity logged";
    try {
      const created = await createActivityMutate.current({
        data: {
          type: actType as ActivityType,
          title,
          description: note.trim() || undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          emailSubject: emailSubject.trim() || undefined,
          emailBody: emailBody.trim() || undefined,
          aiSummary: aiSummary.trim() || undefined,
          contactId: id,
        }
      });
      const cfEntries = Object.entries(actCfValues).map(([fieldId, value]) => ({ fieldId, value }));
      if (created?.id && cfEntries.length > 0) {
        await saveActivityCf.mutateAsync({ recordId: created.id, values: cfEntries }).catch(() => undefined);
      }
      resetActivityForm();
      queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions", "contact", id] });
      toast({ title: "Activity logged" });
    } catch (e) {
      toast({ title: "Error", description: "Could not save activity", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-6 md:col-span-1">
              <Skeleton className="h-[300px] w-full" />
            </div>
            <div className="md:col-span-2">
              <Skeleton className="h-[500px] w-full" />
            </div>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (!contact) {
    return (
      <SidebarLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Contact not found</h2>
          <Button asChild variant="outline">
            <Link href="/contacts">Back to contacts</Link>
          </Button>
        </div>
      </SidebarLayout>
    );
  }

  return (
    <>
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
            <Link href={backHref}><ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}</Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-2xl">
                {contact.firstName[0]}{contact.lastName[0]}
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{contact.firstName} {contact.lastName}</h1>
                <p className="text-muted-foreground">{contact.title || "No title"} at {contact.company?.name || "No company"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-sm px-3 py-1">
                {contact.status}
              </Badge>
              {isAdmin && (
                <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
                  <CopyCheck className="mr-2 h-4 w-4" /> Merge duplicates
                </Button>
              )}
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column - Info */}
          <div className="space-y-6 md:col-span-1">
            <CollapsibleCard title="Contact Info" previewHeight={120} contentClassName="space-y-4">
              {contact.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Link href={`/companies/${contact.companyId}`} className="hover:underline">{contact.company.name}</Link>
                </div>
              )}
              {contact.linkedIn && (
                <div className="flex items-center gap-3 text-sm">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <a href={contact.linkedIn} target="_blank" rel="noreferrer" className="hover:underline text-blue-600">LinkedIn Profile</a>
                </div>
              )}
              <div className="flex items-center justify-between text-sm pt-3 border-t">
                <span className="text-muted-foreground">Review status</span>
                <Badge variant="outline" className="font-normal">{(contact.reviewStatus ?? "REVIEWED").replace(/_/g, " ")}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ennabl user</span>
                <span className="font-medium">{contact.ennablUser ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Email marketing</span>
                <span className="font-medium">{contact.emailMarketingContact ? "Subscribed" : "No"}</span>
              </div>
            </CollapsibleCard>

            {contact.tags && contact.tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tags</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {contact.tags.map(tag => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}

            <CustomFieldsSection objectType="contact" recordId={id} />
            <AiSuggestions objectType="contact" recordId={id} contactId={id} />
          </div>

          {/* Right Column - Tabs */}
          <div className="md:col-span-2">
            <Tabs defaultValue="activity">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
                <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Activity
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  <NotesTabLabel entityType="contact" entityId={id} />
                </TabsTrigger>
                <TabsTrigger value="deals" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Deals ({contact.deals?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Tasks ({contact.tasks?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  History
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Campaigns
                </TabsTrigger>
                <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Files
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="activity" className="pt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Log Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Type</Label>
                          <Select value={actType} onValueChange={setActType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["NOTE", "CALL", "EMAIL_SENT", "MEETING"].map(t => (
                                <SelectItem key={t} value={t}>
                                  {t.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="act-end">End date</Label>
                          <Input id="act-end" type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="act-title">Title</Label>
                        <Input id="act-title" placeholder="Short title (optional)" value={actTitle} onChange={e => setActTitle(e.target.value)} />
                      </div>
                      {isEmailType && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="act-subj">Email subject</Label>
                            <Input id="act-subj" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="act-body">Email body</Label>
                            <Textarea id="act-body" value={emailBody} onChange={e => setEmailBody(e.target.value)} className="resize-none" />
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="act-note">Notes</Label>
                        <Textarea 
                          id="act-note"
                          placeholder="Details about this activity..." 
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="resize-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="act-ai">AI summary</Label>
                        <Textarea id="act-ai" placeholder="Leave blank to auto-generate for emails & meetings" value={aiSummary} onChange={e => setAiSummary(e.target.value)} className="resize-none" />
                      </div>
                      <CustomFieldsForm objectType="activity" values={actCfValues} onChange={(fid, v) => setActCfValues(p => ({ ...p, [fid]: v }))} />
                      <div className="flex justify-end">
                        <Button 
                          onClick={handleLogActivity} 
                          disabled={!canLog || createActivity.isPending}
                        >
                          {createActivity.isPending ? "Saving..." : "Log Activity"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <div className="mt-8 space-y-4">
                  <h3 className="text-lg font-semibold">Timeline</h3>
                  {contact.activities && contact.activities.length > 0 ? (
                    <div className="space-y-4">
                      {contact.activities.map(activity => (
                        <div key={activity.id} className="flex gap-4 p-4 border rounded-lg bg-card">
                          <div className="mt-1">
                            {activity.type === 'NOTE' ? <MessageSquare className="h-5 w-5 text-blue-500" /> :
                             activity.type === 'CALL' ? <Phone className="h-5 w-5 text-green-500" /> :
                             <Calendar className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{activity.title}</p>
                            {activity.emailSubject && (
                              <p className="text-sm mt-1"><span className="text-muted-foreground">Subject: </span>{activity.emailSubject}</p>
                            )}
                            {activity.description && <p className="text-sm mt-1 text-muted-foreground">{activity.description}</p>}
                            {activity.emailBody && (
                              <p className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">{activity.emailBody}</p>
                            )}
                            <ActivitySummary
                              activityId={activity.id}
                              type={activity.type}
                              summary={activity.aiSummary}
                              onUpdated={() => queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) })}
                            />
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(activity.createdAt).toLocaleString()}
                              {activity.endDate ? ` · ends ${new Date(activity.endDate).toLocaleString()}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="pt-6">
                <NotesFeed entityType="contact" entityId={id} />
              </TabsContent>

              <TabsContent value="deals" className="pt-6">
                {contact.deals && contact.deals.length > 0 ? (
                  <div className="space-y-4">
                    {contact.deals.map(deal => (
                      <Card key={deal.id}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-medium"><Link href={`/deals`} className="hover:underline">{deal.title}</Link></p>
                            <p className="text-sm text-muted-foreground">Stage: {deal.stage.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(deal.value || 0)}</p>
                            <p className="text-xs text-muted-foreground">{deal.probability}% probability</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No deals associated with this contact.</p>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="pt-6">
                {contact.tasks && contact.tasks.length > 0 ? (
                  <div className="space-y-4">
                    {contact.tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <CheckSquare className={`h-5 w-5 ${task.completed ? 'text-green-500' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <p className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                          {task.dueDate && <p className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No tasks for this contact.</p>
                )}
              </TabsContent>

              <TabsContent value="history" className="pt-6">
                <AuditHistory objectType="contact" objectId={contact.id} />
              </TabsContent>

              <TabsContent value="campaigns" className="pt-6">
                <ContactCampaignsTab contactId={id} canEdit={me?.role === "ADMIN" || me?.role === "MEMBER"} />
              </TabsContent>

              <TabsContent value="files" className="pt-6">
                <AttachmentsPanel objectType="contact" recordId={contact.id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </SidebarLayout>

    {contact && (
      <ContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={contact}
      />
    )}
    <ContactDuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} focusId={id} />
  </>
  );
}
