import { useState, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
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
import { Trash2, UserCircle, Plus, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NotesFeed } from "@/components/notes/notes-feed";

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

  type SplitRow = { userId: string; percentage: string };
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const getToken = useSessionToken();

  const { data: stages } = useListDealStages();
  const { data: contacts } = useListContacts({ page: 1, pageSize: 200 });
  const { data: companies } = useListCompanies({ page: 1, pageSize: 200 });
  const { data: members } = useTeamMembers();
  const create = useCreateDeal();
  const update = useUpdateDeal();
  const remove = useDeleteDeal();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";

  type SplitRecord = { id: string; userId: string; percentage: number; user: { id: string; name: string | null; email: string; avatarUrl: string | null } | null };
  const { data: existingSplits } = useQuery<SplitRecord[]>({
    queryKey: ["deal-splits", deal?.id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/deals/${deal!.id}/splits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch splits");
      return res.json() as Promise<SplitRecord[]>;
    },
    enabled: !!deal?.id && open,
  });

  const saveSplits = useMutation({
    mutationFn: async (splits: SplitRow[]) => {
      const token = await getToken();
      const res = await fetch(`/api/deals/${deal!.id}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ splits: splits.map(s => ({ userId: s.userId, percentage: parseFloat(s.percentage) || 0 })) }),
      });
      if (!res.ok) throw new Error("Failed to save splits");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-splits", deal?.id] });
      toast({ title: "Deal split saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save deal split", variant: "destructive" }),
  });

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
      if (!deal) setSplitRows([]);
    }
  }, [open, deal, defaultStageId]);

  useEffect(() => {
    if (existingSplits) {
      setSplitRows(existingSplits.map(s => ({ userId: s.userId, percentage: String(s.percentage) })));
    }
  }, [existingSplits]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListDealsQueryKey() });
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
        onSuccess: () => { toast({ title: "Deal created" }); invalidate(); onOpenChange(false); },
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

  const detailsForm = (isEditMode: boolean) => (
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
        {isEditMode && isAdmin && (
          <Button type="button" variant="destructive" size="icon" className="mr-auto" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : isEditMode ? "Save Changes" : "Create Deal"}</Button>
      </DialogFooter>
    </form>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-hidden !flex !flex-col p-0">
          <DialogHeader className="px-6 pt-6 shrink-0">
            <DialogTitle>{isEdit ? "Edit Deal" : "New Deal"}</DialogTitle>
          </DialogHeader>
          {isEdit ? (
            <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0 px-6">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-0 shrink-0">
                <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Details
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Notes
                </TabsTrigger>
                <TabsTrigger value="split" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1">
                  Deal Split
                </TabsTrigger>
              </TabsList>
              <div className="flex-1 overflow-y-auto pb-6">
                <TabsContent value="details">
                  {detailsForm(true)}
                </TabsContent>
                <TabsContent value="notes">
                  <NotesFeed entityType="deal" entityId={deal.id} />
                </TabsContent>
                <TabsContent value="split">
                  {(() => {
                    const dealValue = parseFloat(value) || 0;
                    const totalPct = splitRows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
                    const isValid = Math.abs(totalPct - 100) < 0.01 || splitRows.length === 0;
                    const usedUserIds = new Set(splitRows.map(r => r.userId));
                    const availableMembers = (members ?? []).filter(m => !usedUserIds.has(m.id));
                    return (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Split this deal between team members. Percentages must add up to 100%.</p>

                        {splitRows.length > 0 && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                              <span>Team Member</span>
                              <span>%</span>
                              <span>Amount</span>
                              <span />
                            </div>
                            {splitRows.map((row, i) => {
                              const member = members?.find(m => m.id === row.userId);
                              const dollarAmt = dealValue * ((parseFloat(row.percentage) || 0) / 100);
                              return (
                                <div key={i} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-center">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">
                                      {memberInitials(member?.name)}
                                    </span>
                                    <span className="text-sm truncate">{member?.name ?? member?.email ?? row.userId}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      value={row.percentage}
                                      onChange={e => setSplitRows(prev => prev.map((r, idx) => idx === i ? { ...r, percentage: e.target.value } : r))}
                                      className="h-8 text-sm pr-1"
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                  <span className="text-sm text-muted-foreground">
                                    {dealValue > 0 ? `$${dollarAmt.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => setSplitRows(prev => prev.filter((_, idx) => idx !== i))}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {availableMembers.length > 0 && (
                          <Select
                            value=""
                            onValueChange={userId => setSplitRows(prev => [...prev, { userId, percentage: "" }])}
                          >
                            <SelectTrigger className="h-8 w-auto gap-1 text-sm border-dashed">
                              <Plus className="h-3.5 w-3.5" />
                              <SelectValue placeholder="Add team member" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableMembers.map(m => (
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
                        )}

                        {splitRows.length > 0 && (
                          <div className={`flex items-center gap-2 text-sm ${isValid ? "text-green-600" : "text-amber-600"}`}>
                            {isValid
                              ? <CheckCircle2 className="h-4 w-4" />
                              : <AlertCircle className="h-4 w-4" />}
                            <span>Total: {totalPct.toFixed(1)}%{!isValid && " — must equal 100%"}</span>
                          </div>
                        )}

                        <div className="flex justify-end pt-2">
                          <Button
                            type="button"
                            disabled={saveSplits.isPending || (splitRows.length > 0 && !isValid)}
                            onClick={() => saveSplits.mutate(splitRows)}
                          >
                            {saveSplits.isPending ? "Saving…" : "Save Split"}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div className="overflow-y-auto flex-1 px-6 pb-6">
              {detailsForm(false)}
            </div>
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
