import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import {
  useGetCompany, useGetMe, useCreateActivity, useListActivities,
  getGetCompanyQueryKey, getListTasksQueryOptions,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Globe, MapPin, Phone, Pencil, CopyCheck,
  Mail, MessageSquare, Calendar as CalendarIcon, CheckSquare, Sparkles, Users, ChevronDown, ChevronUp,
  Paperclip, ArrowUpRight, ArrowDownLeft, CheckCircle2, Circle,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { NotesFeed } from "@/components/notes/notes-feed";
import { useNotesCount } from "@/hooks/use-notes-count";
import { AuditHistory } from "@/components/audit/audit-history";
import { ActivitySummary } from "@/components/ai/activity-summary";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { CompanyDuplicatesDialog } from "@/components/merge/company-duplicates";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { CustomFieldsForm } from "@/components/custom-fields/custom-fields-form";
import { useSaveCustomFieldValuesForRecord } from "@/hooks/use-custom-fields";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useContactCampaigns } from "@/hooks/use-contact-campaigns";

function buildCompanySummary(
  name: string,
  activities: any[],
  contacts: any[],
  deals: any[],
  openPipelineValue: number,
  openDeals: number,
): string {
  const contactCount = contacts.length;
  const dealCount = deals.length;
  const n = activities.length;

  const typeCounts: Record<string, number> = {};
  activities.forEach(a => {
    const t = a.type === 'NOTE' ? 'notes' : a.type === 'CALL' ? 'calls' : a.type.startsWith('EMAIL') ? 'emails' : a.type === 'MEETING' ? 'meetings' : 'interactions';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const breakdown = Object.entries(typeCounts).map(([t, c]) => `${c} ${c === 1 ? t.replace(/s$/, '') : t}`).join(', ');
  const last = activities[0];
  const lastStr = last
    ? `Most recently, a ${last.type.replace(/_/g, ' ').toLowerCase().replace('email sent', 'email')} titled "${last.title}" was logged on ${new Date(last.createdAt).toLocaleDateString()}.`
    : '';

  const contactStr = contactCount > 0
    ? `${contactCount} contact${contactCount !== 1 ? 's' : ''} ${contactCount === 1 ? 'is' : 'are'} on file`
    : 'no contacts on file';

  const pipelineStr = dealCount > 0
    ? `${openDeals} open deal${openDeals !== 1 ? 's' : ''} worth ${openPipelineValue > 0 ? formatCurrency(openPipelineValue) : '$0'} across ${dealCount} total`
    : 'no deals in the pipeline';

  if (n === 0) {
    return `${name} has ${contactStr} and ${pipelineStr}. No activities have been recorded yet — consider logging a call, note, or email to get started.`;
  }

  const activityStr = `${n} interaction${n !== 1 ? 's' : ''} ${n === 1 ? 'has' : 'have'} been recorded — ${breakdown}.`;
  return `${name} has ${contactStr} and ${pipelineStr}. ${activityStr} ${lastStr}`.trim();
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

function ContactTaskRows({ contactId, contactName }: { contactId: string; contactName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const results = useQueries({
    queries: [getListTasksQueryOptions({ contactId, pageSize: 50 })],
  });
  const tasks = results[0]?.data?.data ?? [];
  const [taskTab, setTaskTab] = useState<"open" | "closed">("open");
  const [closingTask, setClosingTask] = useState<null | { id: string; title: string }>(null);
  const [taskCloseComment, setTaskCloseComment] = useState("");
  const [taskCloseSaving, setTaskCloseSaving] = useState(false);

  if (tasks.length === 0) return null;

  const sorted = [...tasks].sort((a, b) => a.title.localeCompare(b.title));
  const openTasks = sorted.filter(t => !t.completed);
  const closedTasks = sorted.filter(t => t.completed);
  const displayTasks = taskTab === "open" ? openTasks : closedTasks;

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{contactName}</p>
      <div className="flex border-b mb-3">
        {(["open", "closed"] as const).map(tab => (
          <button key={tab} onClick={() => setTaskTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${taskTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "open" ? "Open" : "Closed"} ({tab === "open" ? openTasks.length : closedTasks.length})
          </button>
        ))}
      </div>
      {displayTasks.length > 0 ? (
        <div className="space-y-2">
          {displayTasks.map(task => (
            <div key={task.id} className={`flex items-center gap-3 p-3 border rounded-lg transition-opacity ${task.completed ? "opacity-60" : ""}`}>
              <button
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { if (!task.completed) { setClosingTask({ id: task.id, title: task.title }); setTaskCloseComment(""); } }}
              >
                {task.completed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                {task.dueDate && <p className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
                {task.completed && (task as any).completionNote && (
                  <p className="text-xs mt-1 text-muted-foreground italic border-l-2 border-muted pl-2">Note: {(task as any).completionNote}</p>
                )}
              </div>
              <Link href={`/contacts/${contactId}`} className="text-xs text-primary hover:underline shrink-0">View</Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{taskTab === "open" ? "No open tasks." : "No completed tasks yet."}</p>
      )}

      {closingTask && (
        <Dialog open onOpenChange={() => setClosingTask(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Complete Task</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Add a note for <span className="font-medium text-foreground">"{closingTask.title}"</span>.</p>
              <Textarea placeholder="e.g. Sent proposal, waiting on response…" className="resize-none" rows={3}
                value={taskCloseComment} onChange={e => setTaskCloseComment(e.target.value)} />
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
                  qc.invalidateQueries({ queryKey: getListTasksQueryOptions({ contactId, pageSize: 50 }).queryKey });
                  toast({ title: "Task completed" });
                  setClosingTask(null); setTaskCloseComment("");
                } catch { toast({ title: "Failed to complete task", variant: "destructive" }); }
                finally { setTaskCloseSaving(false); }
              }}>{taskCloseSaving ? "Saving…" : "Mark Complete"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ContactCampaignRows({ contactId, contactName }: { contactId: string; contactName: string }) {
  const { data = [] } = useContactCampaigns(contactId);
  if (data.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">{contactName}</p>
      {data.map(row => (
        <div key={`${contactId}-${row.campaignId}`} className="p-3 border rounded-lg flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium truncate">{row.campaignName}</p>
            <p className="text-xs text-muted-foreground truncate">{row.campaignSubject}</p>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              {row.sentAt && <span>Sent {new Date(row.sentAt).toLocaleDateString()}</span>}
              {row.openedAt && <span className="text-green-600">Opened</span>}
              {row.clickedAt && <span className="text-blue-600">Clicked</span>}
              {row.unsubscribedAt && <span className="text-red-500">Unsubscribed</span>}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">{row.status}</Badge>
        </div>
      ))}
    </div>
  );
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: company, isLoading } = useGetCompany(id);
  const { data: teamMembers = [] } = useTeamMembers();
  const [editOpen, setEditOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [showMoreContacts, setShowMoreContacts] = useState(false);
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Activities for this company
  const { data: activitiesData } = useListActivities({ companyId: id, pageSize: 100 });
  const companyActivities = [...(activitiesData?.data ?? [])].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const emailActivities = [...companyActivities]
    .filter(a => a.type.startsWith("EMAIL"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Log Activity form state
  const [actType, setActType] = useState("NOTE");
  const [actTitle, setActTitle] = useState("");
  const [note, setNote] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [actCfValues, setActCfValues] = useState<Record<string, string | null>>({});
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueTime, setDueTime] = useState("09:00");
  const isEmailType = actType.startsWith("EMAIL");
  const createActivity = useCreateActivity();
  const saveActivityCf = useSaveCustomFieldValuesForRecord("activity");

  const resetActivityForm = () => {
    setActTitle(""); setNote(""); setEndDate(""); setEmailSubject(""); setEmailBody(""); setActCfValues({});
    setDueTime("09:00");
  };
  const canLog = actType.length > 0;

  // Edit activity dialog
  const [activityTab, setActivityTab] = useState<"open" | "closed">("open");
  const [editingActivity, setEditingActivity] = useState<null | { id: string; type: string; title: string; description: string; endDate: string; isClosed: boolean; closureComment: string }>(null);
  const [editDueTime, setEditDueTime] = useState("09:00");
  const [editDueDateOpen, setEditDueDateOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Close activity dialog
  const [closingActivity, setClosingActivity] = useState<null | { id: string; title: string }>(null);
  const [closureComment, setClosureComment] = useState("");
  const [closingSaving, setClosingSaving] = useState(false);

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

  const createNote = async (noteBody: string) => {
    const token = document.cookie.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/)?.[1]
      ?? localStorage.getItem("better-auth.session_token") ?? "";
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
      body: JSON.stringify({ body: noteBody, entityType: "company", entityId: id }),
    });
  };

  const handleLogActivity = async () => {
    if (!canLog) return;
    try {
      const created = await createActivity.mutateAsync({
        data: {
          type: actType as any,
          title: actTitle || actType.replace(/_/g, " ").toLowerCase(),
          description: note || undefined,
          endDate: endDate || undefined,
          emailSubject: isEmailType ? emailSubject : undefined,
          emailBody: isEmailType ? emailBody : undefined,
          companyId: id,
        },
      });
      if (Object.keys(actCfValues).length > 0) {
        const cfEntries = Object.entries(actCfValues).map(([fieldId, value]) => ({ fieldId, value }));
        await saveActivityCf.mutateAsync({ recordId: created.id, values: cfEntries }).catch(() => undefined);
      }
      resetActivityForm();
      queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: ["listActivities"] });
      toast({ title: "Activity logged" });
    } catch {
      toast({ title: "Failed to log activity", variant: "destructive" });
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

  if (!company) {
    return (
      <SidebarLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Company not found</h2>
          <Button asChild variant="outline">
            <Link href="/companies">Back to companies</Link>
          </Button>
        </div>
      </SidebarLayout>
    );
  }

  const csm = teamMembers.find(m => m.id === company.assignedCsmId);
  const csmName = csm ? (csm.name || csm.email) : null;
  const sortedContacts = [...(company.contacts ?? [])].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  );

  return (
    <>
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
            <Link href="/companies"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                {company.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
                <p className="text-muted-foreground">
                  {company.industry && `${company.industry} • `}
                  {company.size && `${company.size} employees`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
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

            {/* 1 — Latest Summary — re-keys on activity count so it visually refreshes */}
            <Card key={`summary-${companyActivities.length}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Latest Summary
                </CardTitle>
                {companyActivities.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Updated · {new Date(
                      [...companyActivities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt
                    ).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {buildCompanySummary(
                    company.name,
                    companyActivities,
                    company.contacts ?? [],
                    company.deals ?? [],
                    company.openPipelineValue,
                    company.openDeals ?? 0,
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 2 — Pipeline Snapshot */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pipeline Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(company.openPipelineValue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Open pipeline value</p>
                <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Open deals</p>
                    <p className="font-semibold">{company.openDeals ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total deals</p>
                    <p className="font-semibold">{company.deals?.length ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3 — Company Info */}
            <CollapsibleCard title="Company Info" previewHeight={160} contentClassName="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                {company.phone
                  ? <a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a>
                  : <span className="text-muted-foreground">No phone</span>}
              </div>
              {company.domain && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:underline truncate">{company.domain}</a>
                </div>
              )}
              {(company.address || company.city || company.country) && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    {company.address && <div>{company.address}</div>}
                    <div>{[company.city, company.country].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
              )}
            </CollapsibleCard>

            {/* 4 — Contacts in left panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Contacts ({sortedContacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedContacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contacts yet.</p>
                ) : (
                  <>
                    {(showMoreContacts ? sortedContacts : sortedContacts.slice(0, 3)).map(c => (
                      <div key={c.id} className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                          {c.firstName[0]}{c.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:underline text-primary truncate block">
                            {c.firstName} {c.lastName}
                          </Link>
                          {c.title && <p className="text-xs text-muted-foreground truncate">{c.title}</p>}
                        </div>
                      </div>
                    ))}
                    {sortedContacts.length > 3 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7 mt-1"
                        onClick={() => setShowMoreContacts(v => !v)}
                      >
                        {showMoreContacts
                          ? <><ChevronUp className="h-3 w-3 mr-1" /> Show less</>
                          : <><ChevronDown className="h-3 w-3 mr-1" /> Show {sortedContacts.length - 3} more</>}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <CustomFieldsSection objectType="company" recordId={id} />
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
                <TabsTrigger value="contacts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Contacts ({company.contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="deals" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Deals ({company.deals?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="email" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Email
                </TabsTrigger>
                <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Files
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Tasks
                </TabsTrigger>
              </TabsList>

              {/* ACTIVITIES — company timeline + audit trail */}
              <TabsContent value="history" className="pt-6">
                {(() => {
                  const openActs = companyActivities.filter(a => (a.metadata as any)?.status !== "closed");
                  const closedActs = companyActivities.filter(a => (a.metadata as any)?.status === "closed");
                  const displayActs = activityTab === "open" ? openActs : closedActs;

                  const openEditActivity = (activity: typeof companyActivities[0]) => {
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

                      {displayActs.length > 0 ? (
                        <div className="space-y-3">
                          {displayActs.map(activity => {
                            const isClosed = (activity.metadata as any)?.status === "closed";
                            const closureNote = (activity.metadata as any)?.closureComment as string | undefined;
                            return (
                              <div key={activity.id} className={`flex items-start gap-3 p-4 border rounded-lg bg-card ${isClosed ? "opacity-70" : ""}`}>
                                <button
                                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                  title={isClosed ? "Closed" : "Close activity"}
                                  onClick={() => { if (!isClosed) { setClosingActivity({ id: activity.id, title: activity.title }); setClosureComment(""); } }}
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
                            className="resize-none" rows={3}
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
                            queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) });
                            queryClient.invalidateQueries({ queryKey: ["listActivities"] });
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
                          placeholder="e.g. Follow-up completed, deal moved to next stage…"
                          className="resize-none" rows={3}
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
                            await createNote(`Closed activity "${closingActivity.title}": ${closureComment.trim()}`);
                            queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) });
                            queryClient.invalidateQueries({ queryKey: ["listActivities"] });
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
                  <AuditHistory objectType="company" objectId={id} />
                </div>
              </TabsContent>

              {/* CAMPAIGNS — aggregated from all contacts */}
              <TabsContent value="campaigns" className="pt-6">
                {sortedContacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No contacts at this company yet.</p>
                ) : (
                  <div className="space-y-1">
                    {sortedContacts.map(c => (
                      <ContactCampaignRows
                        key={c.id}
                        contactId={c.id}
                        contactName={`${c.firstName} ${c.lastName}`}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* DEALS */}
              <TabsContent value="deals" className="pt-6">
                {company.deals && company.deals.length > 0 ? (
                  <div className="space-y-4">
                    {[...company.deals].sort((a, b) => a.title.localeCompare(b.title)).map(deal => (
                      <Card key={deal.id}>
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">
                              <Link href={`/deals`} className="hover:underline text-primary">{deal.title}</Link>
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">Stage: {deal.stage.name}</p>
                            {deal.contact && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Contact: <Link href={`/contacts/${deal.contact.id}`} className="hover:underline text-primary">{deal.contact.firstName} {deal.contact.lastName}</Link>
                              </p>
                            )}
                          </div>
                          <div className="sm:text-right">
                            <p className="font-bold text-lg">{formatCurrency(deal.value || 0)}</p>
                            <p className="text-xs text-muted-foreground">{deal.probability}% probability</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No deals associated with this company.</p>
                )}
              </TabsContent>

              {/* EMAIL */}
              <TabsContent value="email" className="pt-6">
                {emailActivities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm space-y-1">
                    <Mail className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No emails synced yet</p>
                    <p>Emails will appear here automatically once Gmail sync is active.</p>
                    <p className="text-[11px] pt-1">Connect Gmail in <strong>Settings → Integrations</strong> to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailActivities.map(activity => {
                      const meta = activity.metadata as { direction?: string; from?: string; to?: string; attachmentCount?: number } | null;
                      const isSent = meta?.direction === "sent";
                      const hasAttachments = (meta?.attachmentCount ?? 0) > 0;
                      return (
                        <div key={activity.id} className="p-4 border rounded-lg bg-card space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`shrink-0 rounded-full p-1 ${isSent ? "bg-blue-50 text-blue-500" : "bg-green-50 text-green-600"}`}>
                                {isSent ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate text-sm">{activity.emailSubject || activity.title || "(no subject)"}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {isSent ? `To: ${meta?.to ?? ""}` : `From: ${meta?.from ?? ""}`}
                                  {activity.contact && ` · ${activity.contact.firstName} ${activity.contact.lastName}`}
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
                            onUpdated={() => queryClient.invalidateQueries({ queryKey: ["listActivities"] })}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* FILES */}
              <TabsContent value="files" className="pt-6">
                <p className="text-xs text-muted-foreground mb-4">
                  Files uploaded here, or automatically synced from email attachments and deals.
                </p>
                <AttachmentsPanel objectType="company" recordId={id} />
              </TabsContent>

              {/* NOTES */}
              <TabsContent value="notes" className="pt-6">
                <NotesFeed entityType="company" entityId={id} />
              </TabsContent>

              {/* TASKS — Log Activity form + aggregated tasks from all contacts */}
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
                        <Label htmlFor="co-act-title">Title</Label>
                        <Input id="co-act-title" placeholder="Short title (optional)" value={actTitle} onChange={e => setActTitle(e.target.value)} />
                      </div>
                      {isEmailType && (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor="co-act-subj">Email subject</Label>
                            <Input id="co-act-subj" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="co-act-body">Email body</Label>
                            <Textarea id="co-act-body" value={emailBody} onChange={e => setEmailBody(e.target.value)} className="resize-none" />
                          </div>
                        </>
                      )}
                      <div className="space-y-1.5">
                        <Label htmlFor="co-act-note">Notes</Label>
                        <Textarea
                          id="co-act-note"
                          placeholder="Details about this activity..."
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          className="resize-none"
                        />
                      </div>
                      <CustomFieldsForm objectType="activity" values={actCfValues} onChange={(fid, v) => setActCfValues(p => ({ ...p, [fid]: v }))} />
                      <div className="flex justify-end">
                        <Button onClick={handleLogActivity} disabled={!canLog || createActivity.isPending}>
                          {createActivity.isPending ? "Saving..." : "Log Activity"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Tasks</h3>
                  <p className="text-xs text-muted-foreground mb-4">All tasks across contacts at this company.</p>
                  {sortedContacts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No contacts at this company yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {sortedContacts.map(c => (
                        <ContactTaskRows
                          key={c.id}
                          contactId={c.id}
                          contactName={`${c.firstName} ${c.lastName}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* CONTACTS */}
              <TabsContent value="contacts" className="pt-6">
                {sortedContacts.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {sortedContacts.map(contact => (
                      <Card key={contact.id}>
                        <CardContent className="p-4 flex items-start gap-4">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-medium shrink-0">
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              <Link href={`/contacts/${contact.id}`} className="hover:underline text-primary">
                                {contact.firstName} {contact.lastName}
                              </Link>
                            </p>
                            <p className="text-sm text-muted-foreground truncate">{contact.title || "No title"}</p>
                            {contact.email && <p className="text-xs text-muted-foreground truncate mt-1">{contact.email}</p>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No contacts associated with this company.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </SidebarLayout>

    {company && (
      <CompanyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={company}
      />
    )}
    <CompanyDuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} focusId={id} />
  </>
  );
}
