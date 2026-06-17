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
  Mail, MessageSquare, Calendar, CheckSquare, Sparkles, Users, ChevronDown, ChevronUp,
} from "lucide-react";
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
  const results = useQueries({
    queries: [getListTasksQueryOptions({ contactId, pageSize: 50 })],
  });
  const tasks = results[0]?.data?.data ?? [];
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">{contactName}</p>
      {tasks.sort((a, b) => a.title.localeCompare(b.title)).map(task => (
        <div key={task.id} className="flex items-center gap-3 p-3 border rounded-lg">
          <CheckSquare className={`h-5 w-5 shrink-0 ${task.completed ? 'text-green-500' : 'text-muted-foreground'}`} />
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
            {task.dueDate && <p className="text-xs text-muted-foreground">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
          </div>
          <Link href={`/contacts/${contactId}`} className="text-xs text-primary hover:underline shrink-0">
            View contact
          </Link>
        </div>
      ))}
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
  const emailActivities = companyActivities.filter(a => a.type.startsWith("EMAIL"));

  // Log Activity form state
  const [actType, setActType] = useState("NOTE");
  const [actTitle, setActTitle] = useState("");
  const [note, setNote] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [actCfValues, setActCfValues] = useState<Record<string, string | null>>({});
  const isEmailType = actType.startsWith("EMAIL");
  const createActivity = useCreateActivity();
  const saveActivityCf = useSaveCustomFieldValuesForRecord("activity");

  const resetActivityForm = () => {
    setActTitle(""); setNote(""); setEndDate(""); setEmailSubject(""); setEmailBody(""); setAiSummary(""); setActCfValues({});
  };
  const canLog = actType.length > 0;

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
          aiSummary: aiSummary || undefined,
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

            {/* 1 — Latest Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Latest Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {companyActivities.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No activities recorded yet.</p>
                ) : (() => {
                  const counts: Record<string, number> = {};
                  companyActivities.forEach(a => {
                    const label = a.type === 'NOTE' ? 'Notes' : a.type === 'CALL' ? 'Calls' : a.type.startsWith('EMAIL') ? 'Emails' : a.type === 'MEETING' ? 'Meetings' : 'Other';
                    counts[label] = (counts[label] || 0) + 1;
                  });
                  const last = companyActivities[0];
                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(counts).map(([label, n]) => (
                          <span key={label} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2 py-0.5">
                            <span className="font-semibold">{n}</span> {label}
                          </span>
                        ))}
                      </div>
                      {last && (
                        <p className="text-xs text-muted-foreground pt-1 border-t">
                          Last: <span className="text-foreground font-medium">{last.title}</span>
                          {" · "}{new Date(last.createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </>
                  );
                })()}
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

            <CollapsibleCard title="Details" previewHeight={120}>
              {company.status ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{company.status.replace(/_/g, " ")}</Badge>
                </div>
              ) : null}
              {csmName ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned CSM</span>
                  <span className="font-medium">{csmName}</span>
                </div>
              ) : null}
              {company.estimatedAnnualRevenue != null ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Est. Annual Revenue</span>
                  <span className="font-medium">{formatCurrency(company.estimatedAnnualRevenue)}</span>
                </div>
              ) : null}
              {company.numberOfEmployees != null ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Employees</span>
                  <span className="font-medium">{company.numberOfEmployees}</span>
                </div>
              ) : null}
              {company.domains && company.domains.length > 0 ? (
                <div>
                  <span className="text-muted-foreground">Domains</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.domains.map(d => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
                  </div>
                </div>
              ) : null}
              {company.productLicensed && company.productLicensed.length > 0 ? (
                <div>
                  <span className="text-muted-foreground">Products Licensed</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.productLicensed.map(p => <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>)}
                  </div>
                </div>
              ) : null}
              {company.memberOf && company.memberOf.length > 0 ? (
                <div>
                  <span className="text-muted-foreground">Member Of</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {company.memberOf.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
                  </div>
                </div>
              ) : null}
              {!company.status && !csmName && company.estimatedAnnualRevenue == null && company.numberOfEmployees == null && !(company.domains?.length) && !(company.productLicensed?.length) && !(company.memberOf?.length) ? (
                <p className="text-muted-foreground">No additional details.</p>
              ) : null}
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
                  <NotesTabLabel entityType="company" entityId={id} />
                </TabsTrigger>
                <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Tasks
                </TabsTrigger>
              </TabsList>

              {/* ACTIVITIES — company timeline + audit trail */}
              <TabsContent value="history" className="pt-6">
                <div className="space-y-4">
                  {companyActivities.length > 0 ? (
                    <div className="space-y-4">
                      {companyActivities.map(activity => (
                        <div key={activity.id} className="flex gap-4 p-4 border rounded-lg bg-card">
                          <div className="mt-1">
                            {activity.type === 'NOTE' ? <MessageSquare className="h-5 w-5 text-blue-500" /> :
                             activity.type === 'CALL' ? <Phone className="h-5 w-5 text-green-500" /> :
                             activity.type.startsWith('EMAIL') ? <Mail className="h-5 w-5 text-purple-500" /> :
                             <Calendar className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
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
                              onUpdated={() => queryClient.invalidateQueries({ queryKey: ["listActivities"] })}
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
                    <p className="text-muted-foreground text-sm">No activities recorded yet.</p>
                  )}
                </div>

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
                  </div>
                ) : (
                  <div className="space-y-4">
                    {emailActivities.map(activity => (
                      <div key={activity.id} className="p-4 border rounded-lg bg-card space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="h-4 w-4 text-purple-500 shrink-0" />
                            <p className="font-medium truncate">{activity.emailSubject || activity.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground shrink-0">{new Date(activity.createdAt).toLocaleString()}</p>
                        </div>
                        {activity.emailBody && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6 line-clamp-4">{activity.emailBody}</p>
                        )}
                        {activity.description && !activity.emailBody && (
                          <p className="text-sm text-muted-foreground pl-6">{activity.description}</p>
                        )}
                        <ActivitySummary
                          activityId={activity.id}
                          type={activity.type}
                          summary={activity.aiSummary}
                          onUpdated={() => queryClient.invalidateQueries({ queryKey: ["listActivities"] })}
                        />
                      </div>
                    ))}
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
                              {["NOTE", "CALL", "EMAIL_SENT", "MEETING"].map(t => (
                                <SelectItem key={t} value={t}>
                                  {t.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="co-act-end">End date</Label>
                          <Input id="co-act-end" type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
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
                      <div className="space-y-1.5">
                        <Label htmlFor="co-act-ai">AI summary</Label>
                        <Textarea id="co-act-ai" placeholder="Leave blank to auto-generate for emails & meetings" value={aiSummary} onChange={e => setAiSummary(e.target.value)} className="resize-none" />
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
