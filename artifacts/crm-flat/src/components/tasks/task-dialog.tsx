import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTask, useUpdateTask, useDeleteTask,
  useListContacts, useListDeals, useGetMe, useListCompanies,
  getListTasksQueryKey,
  Priority, TaskType,
  type TaskWithRelations, type PipelineColumn,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toLabel } from "@/lib/fmt";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskWithRelations;
  defaultContactId?: string;
  defaultDealId?: string;
  defaultCompanyId?: string;
}

const REMINDER_OPTIONS = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "At time of task" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

function computeReminderAt(dueDate: string, dueTime: string, offsetMinutes: string): string | undefined {
  if (offsetMinutes === "none" || !dueDate) return undefined;
  const base = new Date(`${dueDate}T${dueTime || "09:00"}:00`);
  base.setMinutes(base.getMinutes() - parseInt(offsetMinutes));
  return base.toISOString();
}

function reminderOffsetFromISO(reminderAt: string | null | undefined, dueDate: string | null | undefined): string {
  if (!reminderAt || !dueDate) return "none";
  const r = new Date(reminderAt);
  const d = new Date(dueDate);
  const diffMin = Math.round((d.getTime() - r.getTime()) / 60000);
  const match = REMINDER_OPTIONS.find(o => o.value !== "none" && parseInt(o.value) === diffMin);
  return match ? match.value : "none";
}

export function TaskDialog({ open, onOpenChange, task, defaultContactId, defaultDealId, defaultCompanyId }: TaskDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("09:00");
  const [reminderOffset, setReminderOffset] = useState("none");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [type, setType] = useState<string>("TODO");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // Filter contacts and deals by selected company
  const { data: contacts } = useListContacts({
    page: 1,
    pageSize: 200,
    ...(companyId ? { companyId } : {}),
  });
  const { data: dealsData } = useListDeals(companyId ? { companyId } : undefined);
  const { data: companiesData } = useListCompanies({ page: 1, pageSize: 200 });
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";

  const allDeals = dealsData?.flatMap((col: PipelineColumn) => col.deals) ?? [];
  const allCompanies = companiesData?.data ?? [];

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      if (task?.dueDate) {
        const d = new Date(task.dueDate);
        setDueDate(d.toISOString().split("T")[0]);
        setDueTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      } else {
        setDueDate("");
        setDueTime("09:00");
      }
      setReminderOffset(reminderOffsetFromISO(task?.reminderAt, task?.dueDate));
      setPriority(task?.priority ?? "MEDIUM");
      setType(task?.type ?? "TODO");
      setCompanyId(task?.companyId ?? defaultCompanyId ?? "");
      setContactId(task?.contact?.id ?? defaultContactId ?? "");
      setDealId(task?.deal?.id ?? defaultDealId ?? "");
    }
  }, [open, task, defaultContactId, defaultDealId, defaultCompanyId]);

  // Changing company clears contact/deal since they may not belong to the new company
  const handleCompanyChange = (v: string) => {
    const cid = v === "none" ? "" : v;
    setCompanyId(cid);
    setContactId("");
    setDealId("");
  };

  // Picking a contact auto-fills company if not already set
  const handleContactChange = (v: string) => {
    const cid = v === "none" ? "" : v;
    setContactId(cid);
    if (cid && !companyId) {
      const contact = contacts?.data?.find(c => c.id === cid);
      if (contact?.companyId) setCompanyId(contact.companyId);
    }
  };

  // Picking a deal auto-fills company if not already set
  const handleDealChange = (v: string) => {
    const did = v === "none" ? "" : v;
    setDealId(did);
    if (did && !companyId) {
      const deal = allDeals.find(d => d.id === did);
      if (deal?.companyId) setCompanyId(deal.companyId);
    }
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullDueDate = dueDate ? `${dueDate}T${dueTime}:00` : undefined;
    const reminderAt = dueDate && reminderOffset !== "none"
      ? computeReminderAt(dueDate, dueTime, reminderOffset)
      : undefined;

    const data = {
      title,
      description: description || undefined,
      dueDate: fullDueDate,
      reminderAt,
      priority: priority as typeof Priority[keyof typeof Priority],
      type: type as typeof TaskType[keyof typeof TaskType],
      contactId: contactId || undefined,
      dealId: dealId || undefined,
      companyId: companyId || undefined,
    };
    if (isEdit) {
      update.mutate({ id: task.id, data: { ...data, dueDate: fullDueDate ?? null, reminderAt: reminderAt ?? null, contactId: contactId || null, dealId: dealId || null, companyId: companyId || null } }, {
        onSuccess: () => { toast({ title: "Task updated" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to update task", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: () => { toast({ title: "Task created" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to create task", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    remove.mutate({ id: task!.id }, {
      onSuccess: () => { toast({ title: "Task deleted" }); invalidate(); onOpenChange(false); },
      onError: () => toast({ title: "Error", description: "Failed to delete task", variant: "destructive" }),
    });
  };

  const isPending = create.isPending || update.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="t-title">Title *</Label>
              <Input id="t-title" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>

            {/* Type + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(TaskType).map(t => <SelectItem key={t} value={t}>{toLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(Priority).map(p => <SelectItem key={p} value={p}>{toLabel(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due Date + Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-due">Due Date</Label>
                <Input id="t-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-time">Due Time</Label>
                <Input id="t-time" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} disabled={!dueDate} />
              </div>
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <Label>Reminder</Label>
              <Select value={reminderOffset} onValueChange={setReminderOffset} disabled={!dueDate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Company — anchor for filtering contacts + deals */}
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={companyId || "none"} onValueChange={handleCompanyChange}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {allCompanies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Contact + Deal — filtered by company when one is selected */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contact{companyId ? " (filtered)" : ""}</Label>
                <Select value={contactId || "none"} onValueChange={handleContactChange}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contacts?.data?.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unnamed contact"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deal{companyId ? " (filtered)" : ""}</Label>
                <Select value={dealId || "none"} onValueChange={handleDealChange}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allDeals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description — at the bottom */}
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea id="t-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {isEdit && isAdmin && (
                <Button type="button" variant="destructive" size="icon" className="mr-auto" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Task"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete "{task?.title}".</AlertDialogDescription>
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
