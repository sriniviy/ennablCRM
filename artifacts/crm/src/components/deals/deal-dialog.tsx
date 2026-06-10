import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateDeal, useUpdateDeal, useDeleteDeal,
  useListDealStages, useListContacts, useListCompanies, useGetMe,
  getListDealsQueryKey,
  type DealWithRelations,
} from "@workspace/api-client-react";
import { useTeamMembers } from "@/hooks/use-team-members";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NotesFeed } from "@/components/notes/notes-feed";
import { AuditHistory } from "@/components/audit/audit-history";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { AiSuggestions } from "@/components/ai/ai-suggestions";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { CustomFieldsForm } from "@/components/custom-fields/custom-fields-form";
import { useSaveCustomFieldValuesForRecord } from "@/hooks/use-custom-fields";

function memberInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

interface DealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: DealWithRelations;
  defaultStageId?: string;
}

export function DealDialog({ open, onOpenChange, deal, defaultStageId }: DealDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!deal;

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("50");
  const [closeDate, setCloseDate] = useState("");
  const [stageId, setStageId] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [cfValues, setCfValues] = useState<Record<string, string | null>>({});
  const saveCf = useSaveCustomFieldValuesForRecord("deal");

  const { data: stages } = useListDealStages();
  const { data: contacts } = useListContacts({ page: 1, pageSize: 200 });
  const { data: companies } = useListCompanies({ page: 1, pageSize: 200 });
  const { data: members } = useTeamMembers();
  const create = useCreateDeal();
  const update = useUpdateDeal();
  const remove = useDeleteDeal();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";

  useEffect(() => {
    if (open) {
      setTitle(deal?.title ?? "");
      setValue(deal?.value != null ? String(deal.value) : "");
      setProbability(deal?.probability != null ? String(deal.probability) : "50");
      setCloseDate(deal?.closeDate ? deal.closeDate.split("T")[0] : "");
      setStageId(deal?.stageId ?? defaultStageId ?? "");
      setContactId(deal?.contact?.id ?? "");
      setCompanyId(deal?.company?.id ?? "");
      setNotes(deal?.notes ?? "");
      setAssigneeId((deal as unknown as { assigneeId?: string })?.assigneeId ?? "");
      if (!deal) setCfValues({});
    }
  }, [open, deal, defaultStageId]);

  const persistCf = (recordId: string) => {
    const values = Object.entries(cfValues).map(([fieldId, value]) => ({ fieldId, value }));
    if (values.length === 0) return Promise.resolve();
    return saveCf.mutateAsync({ recordId, values }).catch(() => undefined);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListDealsQueryKey() });
    if (deal?.id) qc.invalidateQueries({ queryKey: ["ai-suggestions", "deal", deal.id] });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageId) {
      toast({ title: "Stage required", description: "Please select a pipeline stage.", variant: "destructive" });
      return;
    }
    const data = {
      title,
      value: value ? parseFloat(value) : undefined,
      probability: probability ? parseInt(probability) : undefined,
      closeDate: closeDate || undefined,
      stageId,
      contactId: contactId || undefined,
      companyId: companyId || undefined,
      notes: notes || undefined,
      assigneeId: assigneeId || undefined,
    };
    if (isEdit) {
      update.mutate({ id: deal.id, data }, {
        onSuccess: () => { toast({ title: "Deal updated" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to update deal", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: async (created) => { await persistCf(created.id); toast({ title: "Deal created" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to create deal", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    remove.mutate({ id: deal!.id }, {
      onSuccess: () => { toast({ title: "Deal deleted" }); invalidate(); onOpenChange(false); },
      onError: () => toast({ title: "Error", description: "Failed to delete deal", variant: "destructive" }),
    });
  };

  const isPending = create.isPending || update.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Deal" : "New Deal"}</DialogTitle>
          </DialogHeader>
          {isEdit ? (
            <Tabs defaultValue="details" className="pt-1">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-4">
                <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Details
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  AI Suggestions
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  History
                </TabsTrigger>
                <TabsTrigger value="fields" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Custom Fields
                </TabsTrigger>
                <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Files
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="d-title">Deal Title *</Label>
                    <Input id="d-title" value={title} onChange={e => setTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stage *</Label>
                    <Select value={stageId || "none"} onValueChange={v => setStageId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Select stage…" /></SelectTrigger>
                      <SelectContent>
                        {stages?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="d-value">Value ($)</Label>
                      <Input id="d-value" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="d-prob">Probability (%)</Label>
                      <Input id="d-prob" type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-close">Close Date</Label>
                    <Input id="d-close" type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Contact</Label>
                      <Select value={contactId || "none"} onValueChange={v => setContactId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="No contact" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No contact</SelectItem>
                          {contacts?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Select value={companyId || "none"} onValueChange={v => setCompanyId(v === "none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No company</SelectItem>
                          {companies?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Assignee</Label>
                    <Select value={assigneeId || "none"} onValueChange={v => setAssigneeId(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned">
                          {assigneeId
                            ? (() => {
                                const m = members?.find((x) => x.id === assigneeId);
                                return m ? (
                                  <span className="flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">
                                      {memberInitials(m.name)}
                                    </span>
                                    {m.name ?? m.email}
                                  </span>
                                ) : "Unassigned";
                              })()
                            : <span className="flex items-center gap-2 text-muted-foreground"><UserCircle className="h-4 w-4" />Unassigned</span>}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <UserCircle className="h-4 w-4" /> Unassigned
                          </span>
                        </SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">
                                {memberInitials(m.name)}
                              </span>
                              {m.name ?? m.email}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="d-notes">Deal Notes</Label>
                    <Textarea id="d-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    {isAdmin && (
                      <Button type="button" variant="destructive" size="icon" className="mr-auto" onClick={() => setShowDelete(true)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Changes"}</Button>
                  </DialogFooter>
                </form>
              </TabsContent>
              <TabsContent value="suggestions">
                <AiSuggestions objectType="deal" recordId={deal.id} dealId={deal.id} contactId={deal.contact?.id} />
              </TabsContent>
              <TabsContent value="notes">
                <NotesFeed entityType="deal" entityId={deal.id} />
              </TabsContent>
              <TabsContent value="history">
                <AuditHistory objectType="deal" objectId={deal.id} />
              </TabsContent>
              <TabsContent value="fields">
                <CustomFieldsSection objectType="deal" recordId={deal.id} />
              </TabsContent>
              <TabsContent value="files">
                <AttachmentsPanel objectType="deal" recordId={deal.id} />
              </TabsContent>
            </Tabs>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-title">Deal Title *</Label>
                <Input id="d-title" value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Stage *</Label>
                <Select value={stageId || "none"} onValueChange={v => setStageId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select stage…" /></SelectTrigger>
                  <SelectContent>
                    {stages?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="d-value">Value ($)</Label>
                  <Input id="d-value" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-prob">Probability (%)</Label>
                  <Input id="d-prob" type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-close">Close Date</Label>
                <Input id="d-close" type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Contact</Label>
                  <Select value={contactId || "none"} onValueChange={v => setContactId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No contact" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No contact</SelectItem>
                      {contacts?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Select value={companyId || "none"} onValueChange={v => setCompanyId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No company</SelectItem>
                      {companies?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select value={assigneeId || "none"} onValueChange={v => setAssigneeId(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned">
                      {assigneeId
                        ? (() => {
                            const m = members?.find((x) => x.id === assigneeId);
                            return m ? (
                              <span className="flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">
                                  {memberInitials(m.name)}
                                </span>
                                {m.name ?? m.email}
                              </span>
                            ) : "Unassigned";
                          })()
                        : <span className="flex items-center gap-2 text-muted-foreground"><UserCircle className="h-4 w-4" />Unassigned</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <UserCircle className="h-4 w-4" /> Unassigned
                      </span>
                    </SelectItem>
                    {members?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">
                            {memberInitials(m.name)}
                          </span>
                          {m.name ?? m.email}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-notes">Deal Notes</Label>
                <Textarea id="d-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
              <CustomFieldsForm objectType="deal" values={cfValues} onChange={(id, v) => setCfValues(p => ({ ...p, [id]: v }))} />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Create Deal"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deal?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{deal?.title}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
