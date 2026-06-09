import { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ACTIVITY_TYPES = [
  { value: "NOTE", label: "Note" },
  { value: "CALL", label: "Call" },
  { value: "EMAIL_SENT", label: "Email Sent" },
  { value: "EMAIL_OPENED", label: "Email Opened" },
  { value: "EMAIL_CLICKED", label: "Email Clicked" },
  { value: "MEETING", label: "Meeting" },
  { value: "TASK_CREATED", label: "Task Created" },
  { value: "TASK_COMPLETED", label: "Task Completed" },
];

const TASK_STATUSES = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
];

interface TeamMember {
  id: string;
  name: string | null;
}

interface ExportFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "tasks" | "activities";
  defaultStatus?: string;
}

export function ExportFilterDialog({ open, onOpenChange, mode, defaultStatus }: ExportFilterDialogProps) {
  const { getToken } = useAuth();
  const { toast } = useToast();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assigneeId, setAssigneeId] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [status, setStatus] = useState(defaultStatus ?? "all");
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (open) {
      setDateFrom("");
      setDateTo("");
      setAssigneeId("all");
      setActivityType("all");
      setStatus(defaultStatus ?? "all");
      loadMembers();
    }
  }, [open, defaultStatus]);

  const loadMembers = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((data.members ?? []).map((m: { id: string; name: string | null }) => ({ id: m.id, name: m.name })));
      }
    } catch {
      // best-effort
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (assigneeId && assigneeId !== "all") params.set("assigneeId", assigneeId);

      let url: string;
      let filename: string;

      if (mode === "tasks") {
        if (status && status !== "all") params.set("filter", status);
        url = `${BASE}/api/tasks/export?${params}`;
        filename = "tasks.csv";
      } else {
        if (activityType && activityType !== "all") params.set("type", activityType);
        url = `${BASE}/api/activities/export?${params}`;
        filename = "activities.csv";
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      onOpenChange(false);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Export {mode === "tasks" ? "Tasks" : "Activities"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="export-date-from">From date</Label>
              <Input
                id="export-date-from"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-date-to">To date</Label>
              <Input
                id="export-date-to"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {mode === "tasks" && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "activities" && (
            <div className="space-y-1.5">
              <Label>Activity type</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ACTIVITY_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="All assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name ?? "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
