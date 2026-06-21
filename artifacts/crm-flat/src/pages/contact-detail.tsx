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
import { ArrowLeft, Mail, Phone, Building2, Calendar as CalendarIcon, MessageSquare, Linkedin, CheckSquare, Pencil, CopyCheck, Send, Eye, MousePointerClick, BellOff, RefreshCw, Sparkles, Paperclip, ArrowUpRight, ArrowDownLeft, Video, ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { NotesFeed } from "@/components/notes/notes-feed";
import { useNotesCount } from "@/hooks/use-notes-count";
import { AuditHistory } from "@/components/audit/audit-history";
import { formatCurrency } from "@/lib/utils";
import { toLabel } from "@/lib/fmt";
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

function buildContactSummary(
  firstName: string,
  lastName: string,
  status: string,
  companyName: string | undefined,
  activities: any[],
  deals: any[],
): string {
  const name = `${firstName} ${lastName}`.trim();
  const n = activities.length;

  const typeCounts: Record<string, number> = {};
  const sorted = [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  sorted.forEach(a => {
    const t = a.type === 'NOTE' ? 'notes' : a.type === 'CALL' ? 'calls' : a.type.startsWith('EMAIL') ? 'emails' : a.type === 'MEETING' ? 'meetings' : 'interactions';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const breakdown = Object.entries(typeCounts).map(([t, c]) => `${c} ${c === 1 ? t.replace(/s$/, '') : t}`).join(', ');
  const last = sorted[0];
  const lastStr = last
    ? ` Most recently, a ${last.type.replace(/_/g, ' ').toLowerCase().replace('email sent', 'email')} — "${last.title}" — was logged on ${new Date(last.createdAt).toLocaleDateString()}.`
    : '';

  const companyStr = companyName ? ` at ${companyName}` : '';
  const statusStr = status ? status.charAt(0) + status.slice(1).toLowerCase() : '';
  const dealCount = deals.length;
  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0);
  const dealStr = dealCount > 0
    ? ` There ${dealCount === 1 ? 'is' : 'are'} ${dealCount} deal${dealCount !== 1 ? 's' : ''} in the pipeline${totalValue > 0 ? ` worth ${formatCurrency(totalValue)}` : ''}.`
    : '';

  if (n === 0) {
    return `${name} is a ${statusStr} contact${companyStr}. No activities have been recorded yet — consider logging a call, note, or email to get started.${dealStr}`;
  }

  return `${name} is a ${statusStr} contact${companyStr} with ${n} interaction${n !== 1 ? 's' : ''} on record — ${breakdown}.${lastStr}${dealStr}`;
}

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
  const [meetingSummaryLoading, setMeetingSummaryLoading] = useState(false);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueTime, setDueTime] = useState("09:00");

  const [activityTab, setActivityTab] = useState<"open" | "closed">("open");

  // Edit activity dialog
  const [editingActivity, setEditingActivity] = useState<null | { id: string; type: string; title: string; description: string; endDate: string; isClosed: boolean; closureComment: string }>(null);
  const [editDueTime, setEditDueTime] = useState("09:00");
  const [editDueDateOpen, setEditDueDateOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Close activity dialog
  const [closingActivity, setClosingActivity] = useState<null | { id: string; title: string }>(null);
  const [closureComment, setClosureComment] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);
  const [taskTab, setTaskTab] = useState<"open" | "closed">("open");
  const [closingTask, setClosingTask] = useState<null | { id: string; title: string }>(null);
  const [taskCloseComment, setTaskCloseComment] = useState("");
  const [taskCloseSaving, setTaskCloseSaving] = useState(false);

  const patchActivity = async (actId: string, body: Record<string, unknown>) => {
    const token = document.cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1]
      ?? localStorage.getItem("better-auth.session_token") ?? "";
    const res = await fetch(`/api/activities/${actId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const createNote = async (noteBody: string, status = "open") => {
    const token = document.cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1]
      ?? localStorage.getItem("better-auth.session_token") ?? "";
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
      body: JSON.stringify({ body: noteBody, entityType: "contact", entityId: id, status }),
    });
  };

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
    setDueTime("09:00");
  };

  const canLog = !!(note.trim() || actTitle.trim() || emailSubject.trim());

  const handleLogActivity = async () => {
    if (!canLog) return;
    const title =
      actTitle.trim() ||
      (isEmailType ? emailSubject.trim() : "") ||
      note.trim().slice(0, 60) ||
      "Activity logged";

    // MEETING: use the AI meeting summary endpoint to auto-generate structured summary
    if (actType === "MEETING" && note.trim()) {
      setMeetingSummaryLoading(true);
      try {
        const res = await fetch("/api/ai/meeting-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title || "Meeting",
            transcript: note.trim(),
            contactId: id,
            meetingDate: endDate || undefined,
          }),
        });
        if (!res.ok) throw new Error("Summary failed");
        resetActivityForm();
        queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: ["ai-suggestions", "contact", id] });
        toast({ title: "Meeting logged", description: "AI summary generated automatically." });
      } catch {
        toast({ title: "Error", description: "Could not save meeting", variant: "destructive" });
      } finally {
        setMeetingSummaryLoading(false);
      }
      return;
    }

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

            {/* 1 — Latest Summary — re-keys on activity count so it visually updates */}
            <Card key={`summary-${(contact.activities ?? []).length}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Latest Summary
                </CardTitle>
                {(contact.activities ?? []).length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Updated · {new Date(
                      [...(contact.activities ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt
                    ).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {buildContactSummary(
                    contact.firstName,
                    contact.lastName,
                    contact.status,
                    contact.company?.name,
                    contact.activities ?? [],
                    contact.deals ?? [],
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 2 — Pipeline Snapshot */}
            {(contact.deals ?? []).length > 0 && (() => {
              const deals = contact.deals ?? [];
              const totalValue = deals.reduce((s: number, d: any) => s + (d.value || 0), 0);
              const openDeals = deals.filter((d: any) => d.stage?.name !== 'Won' && d.stage?.name !== 'Lost');
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pipeline Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">{formatCurrency(totalValue)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total deal value</p>
                    <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Open deals</p>
                        <p className="font-semibold">{openDeals.length}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Total deals</p>
                        <p className="font-semibold">{deals.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* 3 — Contact Info */}
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
                <Badge variant="outline" className="font-normal">{toLabel(contact.reviewStatus ?? "REVIEWED")}</Badge>
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
                  {contact.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}

            <AiSuggestions objectType="contact" recordId={id} contactId={id} />
            <CustomFieldsSection objectType="contact" recordId={id} />
          </div>

          {/* Right Column - Tabs */}
          <div className="md:col-span-2">
            <Tabs defaultValue="history">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 flex-wrap">
                <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  All Activities
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Campaigns
                </TabsTrigger>
                <TabsTrigger value="deals" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Deals ({contact.deals?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="email" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Email
                </TabsTrigger>
                <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Files
                </TabsTrigger>
                <TabsTrigger value="meetings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Meetings ({(contact.activities ?? []).filter(a => a.type === "MEETING").length})
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Tasks
                </TabsTrigger>
              </TabsList>

              {/* ACTIVITIES — timeline + audit trail */}
              <TabsContent value="history" className="pt-6">
                {(() => {
                  const allActs = [...(contact.activities ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  const openActs = allActs.filter(a => (a.metadata as any)?.status !== "closed");
                  const closedActs = allActs.filter(a => (a.metadata as any)?.status === "closed");
                  const displayActs = activityTab === "open" ? openActs : closedActs;

                  const openEditActivity = (activity: typeof allActs[0]) => {
                    const ed = activity.endDate ? new Date(activity.endDate) : null;
                    setEditingActivity({
                      id: activity.id, type: activity.type, title: activity.title,
                      description: (activity as any).description ?? "",
                      endDate: ed ? ed.toISOString() : "",
                      isClosed: (activity.metadata as any)?.status === "closed",
                      closureComment: (activity.metadata as any)?.closureComment ?? "",
                    });
                    setEditDueTime(ed ? `${String(ed.getHours()).padStart(2, "0")}:${String(ed.getMinutes()).padStart(2, "0")}` : "09:00");
                    setEditDueDateOpen(false);
                  };

                  return (
                    <>
                      {/* Open / Closed sub-tabs */}
                      <div className="flex border-b mb-5">
                        {(["open", "closed"] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setActivityTab(tab)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                              activityTab === tab
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {tab === "open" ? "Open" : "Closed"} ({tab === "open" ? openActs.length : closedActs.length})
                          </button>
                        ))}
                      </div>

                      {/* Activity list */}
                      {displayActs.length > 0 ? (
                        <div className="space-y-3">
                          {displayActs.map(activity => {
                            const isClosed = (activity.metadata as any)?.status === "closed";
                            const closureNote = (activity.metadata as any)?.closureComment as string | undefined;
                            return (
                              <div key={activity.id} className={`flex items-start gap-3 p-4 border rounded-lg bg-card ${isClosed ? "opacity-70" : ""}`}>
                                <button
                                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                  title={isClosed ? "Reopen activity" : "Close activity"}
                                  onClick={async () => {
                                    if (isClosed) {
                                      await patchActivity(activity.id, { status: "open" });
                                      queryClient.setQueryData(getGetContactQueryKey(id), (old: any) => {
                                        if (!old) return old;
                                        return { ...old, activities: (old.activities ?? []).map((a: any) => a.id === activity.id ? { ...a, metadata: { ...(a.metadata ?? {}), status: "open" } } : a) };
                                      });
                                    } else { setClosingActivity({ id: activity.id, title: activity.title }); setClosureComment(""); }
                                  }}
                                >
                                  {isClosed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5" />}
                                </button>
                                <div className="mt-0.5 shrink-0">
                                  {activity.type === "NOTE" ? <MessageSquare className="h-5 w-5 text-blue-500" /> :
                                   activity.type === "CALL" ? <Phone className="h-5 w-5 text-green-500" /> :
                                   activity.type.startsWith("EMAIL") ? <Mail className="h-5 w-5 text-purple-500" /> :
                                   <CalendarIcon className="h-5 w-5 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`font-medium ${isClosed ? "line-through text-muted-foreground" : ""}`}>{activity.title}</p>
                                  {activity.emailSubject && <p className="text-sm mt-1"><span className="text-muted-foreground">Subject: </span>{activity.emailSubject}</p>}
                                  {(activity as any).description && <p className="text-sm mt-1 text-muted-foreground">{(activity as any).description}</p>}
                                  {activity.emailBody && <p className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">{activity.emailBody}</p>}
                                  {closureNote && (
                                    <p className="text-xs mt-2 text-muted-foreground italic border-l-2 border-muted pl-2">Note: {closureNote}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {new Date(activity.createdAt).toLocaleString()}
                                    {activity.endDate ? ` · due ${new Date(activity.endDate).toLocaleString()}` : ""}
                                  </p>
                                </div>
                                <button
                                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                                  title="Edit activity"
                                  onClick={() => openEditActivity(activity)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          {activityTab === "open" ? "No open activities." : "No closed activities yet."}
                        </p>
                      )}
                    </>
                  );
                })()}

                {/* Edit Activity Dialog */}
                {editingActivity && (
                  <Dialog open onOpenChange={() => setEditingActivity(null)}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader><DialogTitle>Edit Activity</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-2">
                        {!editingActivity.isClosed && (
                          <>
                            <div className="space-y-1.5">
                              <Label>Type</Label>
                              <Select value={editingActivity.type} onValueChange={v => setEditingActivity(p => p ? { ...p, type: v } : null)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["NOTE", "CALL", "MEETING"].map(t => (
                                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Title</Label>
                              <Input value={editingActivity.title} onChange={e => setEditingActivity(p => p ? { ...p, title: e.target.value } : null)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Notes</Label>
                              <Textarea className="resize-none" rows={3} value={editingActivity.description} onChange={e => setEditingActivity(p => p ? { ...p, description: e.target.value } : null)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Due by</Label>
                              <Button type="button" variant="outline" className="w-full justify-start font-normal text-left" onClick={() => setEditDueDateOpen(v => !v)}>
                                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                {editingActivity.endDate ? format(new Date(editingActivity.endDate), "MMM d, yyyy 'at' h:mm a") : <span className="text-muted-foreground">Pick a date &amp; time</span>}
                              </Button>
                              {editDueDateOpen && (
                                <div className="border rounded-md overflow-hidden bg-background shadow-sm">
                                  <Calendar mode="single" className="w-full" classNames={{ root: "w-full" }}
                                    selected={editingActivity.endDate ? new Date(editingActivity.endDate) : undefined}
                                    onSelect={date => {
                                      if (!date) { setEditingActivity(p => p ? { ...p, endDate: "" } : null); return; }
                                      const [h, m] = editDueTime.split(":").map(Number);
                                      date.setHours(h ?? 9, m ?? 0, 0, 0);
                                      setEditingActivity(p => p ? { ...p, endDate: date.toISOString() } : null);
                                    }}
                                  />
                                  <div className="border-t px-3 py-2.5 flex items-center gap-2 bg-muted/30">
                                    <span className="text-xs text-muted-foreground font-medium">Time</span>
                                    <input type="time" value={editDueTime} className="text-sm border rounded px-2 py-1 flex-1 bg-background"
                                      onChange={e => {
                                        setEditDueTime(e.target.value);
                                        if (editingActivity.endDate) {
                                          const d = new Date(editingActivity.endDate);
                                          const [h, m] = e.target.value.split(":").map(Number);
                                          d.setHours(h ?? 9, m ?? 0, 0, 0);
                                          setEditingActivity(p => p ? { ...p, endDate: d.toISOString() } : null);
                                        }
                                      }}
                                    />
                                    <Button size="sm" type="button" onClick={() => setEditDueDateOpen(false)}>Done</Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                        <div className="space-y-1.5">
                          <Label>{editingActivity.isClosed ? "Closing comment" : "Closing comment (if closed)"}</Label>
                          <Textarea
                            className="resize-none"
                            rows={3}
                            placeholder="Notes on how this was resolved…"
                            value={editingActivity.closureComment}
                            onChange={e => setEditingActivity(p => p ? { ...p, closureComment: e.target.value } : null)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingActivity(null)}>Cancel</Button>
                        <Button disabled={editSaving} onClick={async () => {
                          if (!editingActivity) return;
                          setEditSaving(true);
                          try {
                            const patch: Record<string, unknown> = { closureComment: editingActivity.closureComment };
                            if (!editingActivity.isClosed) {
                              Object.assign(patch, { title: editingActivity.title, description: editingActivity.description, type: editingActivity.type, endDate: editingActivity.endDate || null });
                            }
                            await patchActivity(editingActivity.id, patch);
                            queryClient.setQueryData(getGetContactQueryKey(id), (old: any) => {
                              if (!old) return old;
                              const updateAct = (a: any) => a.id !== editingActivity.id ? a : { ...a, ...(!editingActivity.isClosed ? { title: editingActivity.title, description: editingActivity.description, type: editingActivity.type } : {}), metadata: { ...(a.metadata ?? {}), closureComment: editingActivity.closureComment } };
                              return { ...old, activities: (old.activities ?? []).map(updateAct) };
                            });
                            toast({ title: "Activity updated" });
                            setEditingActivity(null);
                          } catch { toast({ title: "Failed to update", variant: "destructive" }); }
                          finally { setEditSaving(false); }
                        }}>{editSaving ? "Saving…" : "Save changes"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Close Activity Dialog */}
                {closingActivity && (
                  <Dialog open onOpenChange={() => setClosingActivity(null)}>
                    <DialogContent className="sm:max-w-sm">
                      <DialogHeader><DialogTitle>Close Activity</DialogTitle></DialogHeader>
                      <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">Add a closing comment for <span className="font-medium text-foreground">"{closingActivity.title}"</span>.</p>
                        <Textarea
                          placeholder="e.g. Spoke with client, follow-up scheduled for next week…"
                          className="resize-none"
                          rows={3}
                          value={closureComment}
                          onChange={e => setClosureComment(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setClosingActivity(null)}>Cancel</Button>
                        <Button disabled={closingSaving || !closureComment.trim()} onClick={async () => {
                          if (!closingActivity) return;
                          setClosingSaving(true);
                          try {
                            await patchActivity(closingActivity.id, { status: "closed", closureComment: closureComment.trim() });
                            await createNote(`Closed activity "${closingActivity.title}": ${closureComment.trim()}`, "closed");
                            queryClient.setQueryData(getGetContactQueryKey(id), (old: any) => {
                              if (!old) return old;
                              return { ...old, activities: (old.activities ?? []).map((a: any) => a.id === closingActivity.id ? { ...a, metadata: { ...(a.metadata ?? {}), status: "closed", closureComment: closureComment.trim(), closedAt: new Date().toISOString() } } : a) };
                            });
                            toast({ title: "Activity closed", description: "Comment saved to Notes." });
                            setClosingActivity(null); setClosureComment("");
                          } catch { toast({ title: "Failed to close", variant: "destructive" }); }
                          finally { setClosingSaving(false); }
                        }}>{closingSaving ? "Closing…" : "Close Activity"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                <div className="mt-10 pt-8 border-t">
                  <h3 className="text-lg font-semibold mb-4">Audit Trail</h3>
                  <AuditHistory objectType="contact" objectId={contact.id} />
                </div>
              </TabsContent>

              {/* MEETINGS */}
              <TabsContent value="meetings" className="pt-6">
                {(() => {
                  const meetings = [...(contact.activities ?? [])]
                    .filter(a => a.type === "MEETING")
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  if (meetings.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground text-sm space-y-1">
                        <Video className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No meetings logged yet</p>
                        <p>Log a meeting from the Tasks tab — AI will auto-generate a structured summary.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {meetings.map(activity => {
                        const summary = activity.aiSummary ?? "";
                        const lines = summary.split("\n");
                        const twoSentences = lines[0] ?? "";
                        const decisionsStart = lines.findIndex(l => l.startsWith("Key decisions:"));
                        const actionsStart = lines.findIndex(l => l.startsWith("Action items:"));
                        const decisions = decisionsStart >= 0
                          ? lines.slice(decisionsStart + 1, actionsStart > decisionsStart ? actionsStart : undefined).filter(l => l.startsWith("- ")).map(l => l.slice(2))
                          : [];
                        const actionItems = actionsStart >= 0
                          ? lines.slice(actionsStart + 1).filter(l => l.startsWith("- ")).map(l => l.slice(2))
                          : [];
                        const isExpanded = expandedTranscripts[activity.id] ?? false;
                        const meta = activity.metadata as { attendees?: string[] } | null;
                        const attendees = meta?.attendees ?? [];
                        return (
                          <div key={activity.id} className="border rounded-lg bg-card overflow-hidden">
                            <div className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Video className="h-4 w-4 text-orange-500 shrink-0" />
                                  <p className="font-medium">{activity.title}</p>
                                </div>
                                <p className="text-xs text-muted-foreground shrink-0">{new Date(activity.createdAt).toLocaleDateString()}</p>
                              </div>
                              {attendees.length > 0 && (
                                <p className="text-xs text-muted-foreground">Attendees: {attendees.join(", ")}</p>
                              )}
                              {twoSentences && (
                                <p className="text-sm">{twoSentences}</p>
                              )}
                              {decisions.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Key decisions</p>
                                  <ul className="space-y-1">
                                    {decisions.map((d, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">•</span>{d}</li>)}
                                  </ul>
                                </div>
                              )}
                              {actionItems.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Action items</p>
                                  <ul className="space-y-1">
                                    {actionItems.map((a, i) => <li key={i} className="text-sm flex gap-2"><span className="text-orange-500">→</span>{a}</li>)}
                                  </ul>
                                </div>
                              )}
                              {!summary && activity.description && (
                                <p className="text-sm text-muted-foreground">{activity.description.slice(0, 200)}</p>
                              )}
                              {activity.description && (
                                <button
                                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  onClick={() => setExpandedTranscripts(p => ({ ...p, [activity.id]: !isExpanded }))}
                                >
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  {isExpanded ? "Hide" : "Show"} transcript
                                </button>
                              )}
                              {isExpanded && activity.description && (
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded p-3 mt-1">{activity.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </TabsContent>

              {/* NOTES */}
              <TabsContent value="notes" className="pt-6">
                <NotesFeed entityType="contact" entityId={id} />
              </TabsContent>

              {/* DEALS */}
              <TabsContent value="deals" className="pt-6">
                {contact.deals && contact.deals.length > 0 ? (
                  <div className="space-y-4">
                    {[...contact.deals].sort((a, b) => a.title.localeCompare(b.title)).map(deal => (
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

              {/* TASKS — includes Log Activity form */}
              <TabsContent value="tasks" className="pt-6 space-y-8">
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
                              {["NOTE", "CALL", "MEETING"].map(t => (
                                <SelectItem key={t} value={t}>
                                  {t.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Due by</Label>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start font-normal text-left"
                            onClick={() => setDueDateOpen(v => !v)}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                            {endDate
                              ? format(new Date(endDate), "MMM d, yyyy 'at' h:mm a")
                              : <span className="text-muted-foreground">Pick a date &amp; time</span>}
                          </Button>
                          {dueDateOpen && (
                            <div className="border rounded-md overflow-hidden bg-background shadow-sm">
                              <Calendar
                                mode="single"
                                selected={endDate ? new Date(endDate) : undefined}
                                onSelect={(date) => {
                                  if (!date) { setEndDate(""); return; }
                                  const [h, m] = dueTime.split(":").map(Number);
                                  date.setHours(h ?? 9, m ?? 0, 0, 0);
                                  setEndDate(date.toISOString());
                                }}
                                className="w-full"
                                classNames={{ root: "w-full" }}
                              />
                              <div className="border-t px-3 py-2.5 flex items-center gap-2 bg-muted/30">
                                <span className="text-xs text-muted-foreground font-medium">Time</span>
                                <input
                                  type="time"
                                  value={dueTime}
                                  className="text-sm border rounded px-2 py-1 flex-1 bg-background"
                                  onChange={e => {
                                    setDueTime(e.target.value);
                                    if (endDate) {
                                      const d = new Date(endDate);
                                      const [h, m] = e.target.value.split(":").map(Number);
                                      d.setHours(h ?? 9, m ?? 0, 0, 0);
                                      setEndDate(d.toISOString());
                                    }
                                  }}
                                />
                                <Button size="sm" type="button" onClick={() => setDueDateOpen(false)}>Done</Button>
                              </div>
                            </div>
                          )}
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
                        <Label htmlFor="act-note">{actType === "MEETING" ? "Transcript / Notes" : "Notes"}</Label>
                        <Textarea
                          id="act-note"
                          placeholder={actType === "MEETING" ? "Paste meeting transcript or notes — AI will generate a structured summary automatically." : "Details about this activity..."}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className={`resize-none ${actType === "MEETING" ? "min-h-[120px]" : ""}`}
                        />
                        {actType === "MEETING" && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-orange-400" />
                            AI will extract key decisions, action items, and attendees automatically.
                          </p>
                        )}
                      </div>
                      <CustomFieldsForm objectType="activity" values={actCfValues} onChange={(fid, v) => setActCfValues(p => ({ ...p, [fid]: v }))} />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleLogActivity}
                          disabled={!canLog || createActivity.isPending || meetingSummaryLoading}
                        >
                          {meetingSummaryLoading ? "Generating summary..." : createActivity.isPending ? "Saving..." : actType === "MEETING" ? "Log Meeting + Summarize" : "Log Activity"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {(() => {
                  const allTasks = [...(contact.tasks ?? [])].sort((a, b) => a.title.localeCompare(b.title));
                  const openTasks = allTasks.filter(t => !t.completed);
                  const closedTasks = allTasks.filter(t => t.completed);
                  const displayTasks = taskTab === "open" ? openTasks : closedTasks;
                  return (
                    <div>
                      <div className="flex border-b mb-4">
                        {(["open", "closed"] as const).map(tab => (
                          <button key={tab} onClick={() => setTaskTab(tab)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${taskTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                            {tab === "open" ? "Open" : "Closed"} ({tab === "open" ? openTasks.length : closedTasks.length})
                          </button>
                        ))}
                      </div>
                      {displayTasks.length > 0 ? (
                        <div className="space-y-3">
                          {displayTasks.map(task => (
                            <div key={task.id} className={`flex items-center gap-3 p-3 border rounded-lg transition-opacity ${task.completed ? "opacity-60" : ""}`}>
                              <button
                                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                title={task.completed ? "Reopen task" : "Complete task"}
                                onClick={async () => {
                                  if (task.completed) {
                                    const token = document.cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1] ?? localStorage.getItem("better-auth.session_token") ?? "";
                                    await fetch(`/api/tasks/${task.id}/complete`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, credentials: "include", body: JSON.stringify({ completed: false }) });
                                    queryClient.setQueryData(getGetContactQueryKey(id), (old: any) => { if (!old) return old; return { ...old, tasks: (old.tasks ?? []).map((t: any) => t.id === task.id ? { ...t, completed: false, completionNote: null, completedAt: null } : t) }; });
                                  } else { setClosingTask({ id: task.id, title: task.title }); setTaskCloseComment(""); }
                                }}
                              >
                                {task.completed
                                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  : <Circle className="h-5 w-5" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                                {task.dueDate && <p className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
                                {task.completed && (task as any).completionNote && (
                                  <p className="text-xs mt-1 text-muted-foreground italic border-l-2 border-muted pl-2">Note: {(task as any).completionNote}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          {taskTab === "open" ? "No open tasks." : "No completed tasks yet."}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Complete Task Dialog */}
                {closingTask && (
                  <Dialog open onOpenChange={() => setClosingTask(null)}>
                    <DialogContent className="sm:max-w-sm">
                      <DialogHeader><DialogTitle>Complete Task</DialogTitle></DialogHeader>
                      <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">Add a note for <span className="font-medium text-foreground">"{closingTask.title}"</span>.</p>
                        <Textarea
                          placeholder="e.g. Sent proposal, waiting on response…"
                          className="resize-none" rows={3}
                          value={taskCloseComment}
                          onChange={e => setTaskCloseComment(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setClosingTask(null)}>Cancel</Button>
                        <Button disabled={taskCloseSaving || !taskCloseComment.trim()} onClick={async () => {
                          if (!closingTask) return;
                          setTaskCloseSaving(true);
                          try {
                            const token = document.cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1] ?? localStorage.getItem("better-auth.session_token") ?? "";
                            await fetch(`/api/tasks/${closingTask.id}/complete`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              credentials: "include",
                              body: JSON.stringify({ completed: true, completionNote: taskCloseComment.trim() }),
                            });
                            queryClient.setQueryData(getGetContactQueryKey(id), (old: any) => {
                              if (!old) return old;
                              return { ...old, tasks: (old.tasks ?? []).map((t: any) => t.id === closingTask.id ? { ...t, completed: true, completionNote: taskCloseComment.trim(), completedAt: new Date().toISOString() } : t) };
                            });
                            toast({ title: "Task completed" });
                            setClosingTask(null); setTaskCloseComment("");
                          } catch { toast({ title: "Failed to complete task", variant: "destructive" }); }
                          finally { setTaskCloseSaving(false); }
                        }}>{taskCloseSaving ? "Saving…" : "Mark Complete"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </TabsContent>

              {/* CAMPAIGNS */}
              <TabsContent value="campaigns" className="pt-6">
                <ContactCampaignsTab contactId={id} canEdit={me?.role === "ADMIN" || me?.role === "MEMBER"} />
              </TabsContent>

              {/* EMAIL — synced emails */}
              <TabsContent value="email" className="pt-6">
                {(() => {
                  const emails = [...(contact.activities ?? [])]
                    .filter(a => a.type.startsWith("EMAIL"))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  if (emails.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground text-sm space-y-1">
                        <Mail className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No emails synced yet</p>
                        <p>Emails will appear here automatically once Gmail sync is active.</p>
                        <p className="text-[11px] pt-1">Connect Gmail in <strong>Settings → Integrations</strong> to get started.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {emails.map(activity => {
                        const meta = activity.metadata as { direction?: string; from?: string; to?: string; attachmentCount?: number } | null;
                        const isSent = meta?.direction === "sent";
                        const hasAttachments = (meta?.attachmentCount ?? 0) > 0;
                        return (
                          <div key={activity.id} className="p-4 border rounded-lg bg-card space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`shrink-0 rounded-full p-1 ${isSent ? "bg-blue-50 text-blue-500" : "bg-green-50 text-green-600"}`}>
                                  {isSent
                                    ? <ArrowUpRight className="h-3 w-3" />
                                    : <ArrowDownLeft className="h-3 w-3" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium truncate text-sm">{activity.emailSubject || activity.title || "(no subject)"}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {isSent ? `To: ${meta?.to ?? ""}` : `From: ${meta?.from ?? ""}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {hasAttachments && (
                                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                    <Paperclip className="h-3 w-3" />
                                    {meta?.attachmentCount}
                                  </span>
                                )}
                                <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
                              </div>
                            </div>
                            {(activity.emailBody || activity.description) && (
                              <p className="text-sm text-muted-foreground pl-7 line-clamp-3">{activity.emailBody || activity.description}</p>
                            )}
                            <ActivitySummary
                              activityId={activity.id}
                              type={activity.type}
                              summary={activity.aiSummary}
                              onUpdated={() => queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) })}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </TabsContent>

              {/* FILES */}
              <TabsContent value="files" className="pt-6">
                <p className="text-xs text-muted-foreground mb-4">
                  Files uploaded here, or automatically synced from email attachments and deals.
                </p>
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
