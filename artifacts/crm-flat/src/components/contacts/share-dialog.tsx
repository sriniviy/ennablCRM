import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Share2, CheckCircle2, User, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSessionToken } from "@/hooks/use-session-token";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ShareRecord {
  id: string;
  name: string;
  subtitle?: string;
  type: "contact" | "company";
}

interface ShareDialogProps {
  record: ShareRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ShareDialog({ record, open, onOpenChange }: ShareDialogProps) {
  const { toast } = useToast();
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { data: members = [] } = useTeamMembers();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const reset = () => { setSelectedIds(new Set()); setNote(""); };

  const toggleMember = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body =
        record!.type === "contact"
          ? { contactId: record!.id, toUserIds: [...selectedIds], note: note.trim() || undefined }
          : { companyId: record!.id, toUserIds: [...selectedIds], note: note.trim() || undefined };
      const res = await fetch("/api/messages/share-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? "Failed to share"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
      const count = selectedIds.size;
      toast({ title: "Shared!", description: `Sent to ${count} team member${count > 1 ? "s" : ""}` });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Failed to share", description: err.message, variant: "destructive" }),
  });

  if (!record) return null;

  const Icon = record.type === "company" ? Building2 : User;
  const label = record.type === "company" ? "company" : "contact";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Share {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Record preview */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">{record.name}</p>
                {record.subtitle && <p className="text-xs text-muted-foreground truncate">{record.subtitle}</p>}
              </div>
            </div>
          </div>

          {/* Team member selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Send to</p>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other team members found.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {members.map((member) => {
                  const selected = selectedIds.has(member.id);
                  const initials = (member.name?.[0] ?? member.email[0]).toUpperCase();
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors border ${
                        selected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"
                      }`}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={member.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{member.name ?? member.email}</p>
                        {member.name && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
                      </div>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Note <span className="text-muted-foreground font-normal">(optional)</span></p>
            <Textarea
              placeholder={`Add a message about this ${label}…`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none text-sm"
              disabled={shareMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={shareMutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={selectedIds.size === 0 || shareMutation.isPending}
            onClick={() => shareMutation.mutate()}
          >
            {shareMutation.isPending ? "Sending…" : `Share with ${selectedIds.size || "…"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
