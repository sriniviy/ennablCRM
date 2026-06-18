import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTask, useUpdateTask, useDeleteTask,
  useListContacts, useListDeals, useGetMe,
  getListTasksQueryKey,
  Priority, TaskType,
  type TaskWithRelations,
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
}

export function TaskDialog({ open, onOpenChange, task, defaultContactId, defaultDealId }: TaskDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [type, setType] = useState<string>("TODO");
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const { data: contacts } = useListContacts({ page: 1, pageSize: 200 });
  const { data: dealsData } = useListDeals();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";

  const allDeals = dealsData?.flatMap(col => col.deals) ?? [];

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setDueDate(task?.dueDate ? task.dueDate.split("T")[0] : "");
      setPriority(task?.priority ?? "MEDIUM");
      setType(task?.type ?? "TODO");
      setContactId(task?.contact?.id ?? defaultContactId ?? "");
      setDealId(task?.deal?.id ?? defaultDealId ?? "");
    }
  }, [open, task, defaultContactId, defaultDealId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      priority: priority as typeof Priority[keyof typeof Priority],
      type: type as typeof TaskType[keyof typeof TaskType],
      contactId: contactId || undefined,
      dealId: dealId || undefined,
    };
    if (isEdit) {
      update.mutate({ id: task.id, data }, {
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
            <div className="space-y-1.5">
              <Label htmlFor="t-title">Title *</Label>
              <Input id="t-title" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea id="t-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-due">Due Date</Label>
                <Input id="t-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
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
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(TaskType).map(t => <SelectItem key={t} value={t}>{toLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Select value={contactId || "none"} onValueChange={v => setContactId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contacts?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deal</Label>
                <Select value={dealId || "none"} onValueChange={v => setDealId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allDeals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
