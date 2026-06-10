import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import { useGetContact, useCreateActivity, getGetContactQueryKey, type ActivityType } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, Building2, Calendar, MessageSquare, Linkedin, CheckSquare, Pencil, CopyCheck } from "lucide-react";
import { NotesFeed } from "@/components/notes/notes-feed";
import { AuditHistory } from "@/components/audit/audit-history";
import { formatCurrency } from "@/lib/utils";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ContactDuplicatesDialog } from "@/components/merge/contact-duplicates";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { AiSuggestions } from "@/components/ai/ai-suggestions";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contact, isLoading } = useGetContact(id);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [actType, setActType] = useState<string>("NOTE");
  const [actTitle, setActTitle] = useState("");
  const [note, setNote] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const createActivity = useCreateActivity();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEmailType = actType.startsWith("EMAIL");

  const createActivityMutate = useRef(createActivity.mutateAsync);
  createActivityMutate.current = createActivity.mutateAsync;

  const resetActivityForm = () => {
    setActType("NOTE"); setActTitle(""); setNote(""); setEndDate("");
    setEmailSubject(""); setEmailBody(""); setAiSummary("");
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
      await createActivityMutate.current({
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
      resetActivityForm();
      queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
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
            <Link href="/contacts"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
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
              <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
                <CopyCheck className="mr-2 h-4 w-4" /> Merge duplicates
              </Button>
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column - Info */}
          <div className="space-y-6 md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>

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
                  Notes
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
                        <Textarea id="act-ai" placeholder="Optional summary" value={aiSummary} onChange={e => setAiSummary(e.target.value)} className="resize-none" />
                      </div>
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
                            {activity.aiSummary && (
                              <p className="text-sm mt-2 rounded bg-muted px-2 py-1"><span className="font-medium">AI summary: </span>{activity.aiSummary}</p>
                            )}
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
