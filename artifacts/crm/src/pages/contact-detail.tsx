import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import { useGetContact, useCreateActivity, getGetContactQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mail, Phone, Building2, Calendar, MessageSquare, Linkedin, CheckSquare } from "lucide-react";
import { NotesFeed } from "@/components/notes/notes-feed";
import { formatCurrency } from "@/lib/utils";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contact, isLoading } = useGetContact(id);
  const [note, setNote] = useState("");
  const createActivity = useCreateActivity();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createActivityMutate = useRef(createActivity.mutateAsync);
  createActivityMutate.current = createActivity.mutateAsync;

  const handleAddNote = async () => {
    if (!note.trim()) return;
    try {
      await createActivityMutate.current({
        data: {
          type: "NOTE",
          title: "Note added",
          description: note,
          contactId: id,
        }
      });
      setNote("");
      queryClient.invalidateQueries({ queryKey: getGetContactQueryKey(id) });
      toast({ title: "Note added" });
    } catch (e) {
      toast({ title: "Error", description: "Could not save note", variant: "destructive" });
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
              <Button>Edit</Button>
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
              </TabsList>
              
              <TabsContent value="activity" className="pt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Log Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Textarea 
                        placeholder="Leave a note about this contact..." 
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="resize-none"
                      />
                      <div className="flex justify-end">
                        <Button 
                          onClick={handleAddNote} 
                          disabled={!note.trim() || createActivity.isPending}
                        >
                          {createActivity.isPending ? "Saving..." : "Save Note"}
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
                          <div>
                            <p className="font-medium">{activity.title}</p>
                            {activity.description && <p className="text-sm mt-1 text-muted-foreground">{activity.description}</p>}
                            <p className="text-xs text-muted-foreground mt-2">{new Date(activity.createdAt).toLocaleString()}</p>
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
            </Tabs>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
