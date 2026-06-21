import { useSessionToken } from "@/hooks/use-session-token";
import { useGetMe } from "@workspace/api-client-react";
import { useState, useCallback } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Trash2, User, Download, Loader2, Pencil, X, Check, Circle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ActivityNote {
  id: string;
  description: string | null;
  title: string;
  userId: string | null;
  user: { id: string; name: string; avatarUrl: string | null } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface NotesFeedProps {
  entityType: "contact" | "company" | "deal";
  entityId: string;
}

export function notesActivityQueryKey(entityType: string, entityId: string) {
  return ["activity-notes", entityType, entityId];
}

export function NotesFeed({ entityType, entityId }: NotesFeedProps) {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const [draft, setDraft] = useState("");
  const [exportingNotes, setExportingNotes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [noteTab, setNoteTab] = useState<"open" | "closed">("open");
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, "open" | "closed">>({});

  const entityParam = entityType === "contact" ? "contactId"
    : entityType === "company" ? "companyId"
    : "dealId";

  const parentQueryKey = entityType === "contact"
    ? [`/api/contacts/${entityId}`]
    : entityType === "company"
    ? [`/api/companies/${entityId}`]
    : [`/api/deals/${entityId}`];

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken();
      return fetch(url, {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  const { data: notes, isLoading } = useQuery<ActivityNote[]>({
    queryKey: notesActivityQueryKey(entityType, entityId),
    queryFn: async () => {
      const res = await authFetch(`/api/activities?${entityParam}=${entityId}&type=NOTE&pageSize=100`);
      if (!res.ok) throw new Error("Failed to fetch notes");
      const json = await res.json();
      return (json.data ?? []) as ActivityNote[];
    },
    enabled: !!entityId,
  });

  const handleExportNotes = async () => {
    setExportingNotes(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/activities/export?${entityParam}=${entityId}&type=NOTE`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notes-${entityType}-${entityId}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExportingNotes(false);
    }
  };

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const res = await authFetch("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          type: "NOTE",
          title: body.substring(0, 60) || "Note",
          description: body,
          [entityParam]: entityId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      return res.json() as Promise<ActivityNote>;
    },
    onSuccess: (newNote) => {
      qc.setQueryData<ActivityNote[]>(
        notesActivityQueryKey(entityType, entityId),
        (old) => [newNote, ...(old ?? [])],
      );
      qc.invalidateQueries({ queryKey: parentQueryKey });
      setDraft("");
      toast({ title: "Note saved" });
    },
    onError: () => toast({ title: "Error", description: "Could not save note", variant: "destructive" }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, body, status }: { id: string; body?: string; status?: string }) => {
      const res = await authFetch(`/api/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: body, status }),
      });
      if (!res.ok) throw new Error("Failed to update note");
      return res.json() as Promise<ActivityNote>;
    },
    onSuccess: (updated) => {
      qc.setQueryData<ActivityNote[]>(
        notesActivityQueryKey(entityType, entityId),
        (old) => (old ?? []).map((n) => n.id === updated.id ? { ...n, description: updated.description, metadata: updated.metadata } : n),
      );
      qc.invalidateQueries({ queryKey: parentQueryKey });
      setEditingId(null);
      setEditDraft("");
      toast({ title: "Note updated" });
    },
    onError: () => toast({ title: "Error", description: "Could not update note", variant: "destructive" }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/activities/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete note");
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<ActivityNote[]>(
        notesActivityQueryKey(entityType, entityId),
        (old) => (old ?? []).filter((n) => n.id !== id),
      );
      qc.invalidateQueries({ queryKey: parentQueryKey });
      toast({ title: "Note deleted" });
    },
    onError: () => toast({ title: "Error", description: "Could not delete note", variant: "destructive" }),
  });

  const isNoteClosed = (note: ActivityNote) => {
    if (note.id in localStatusOverrides) return localStatusOverrides[note.id] === "closed";
    return (note.metadata as any)?.status === "closed";
  };

  const openNotes = (notes ?? []).filter(n => !isNoteClosed(n));
  const closedNotes = (notes ?? []).filter(n => isNoteClosed(n));
  const displayNotes = noteTab === "open" ? openNotes : closedNotes;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="Write a note…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="resize-none min-h-[80px]"
        />
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportNotes}
            disabled={exportingNotes}
            data-testid="btn-export-notes"
          >
            {exportingNotes ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
            Export Notes
          </Button>
          <Button
            size="sm"
            disabled={!draft.trim() || addNote.isPending}
            onClick={() => addNote.mutate(draft)}
          >
            {addNote.isPending ? "Saving…" : "Save Note"}
          </Button>
        </div>
      </div>

      <div className="flex border-b">
        {(["open", "closed"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setNoteTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              noteTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "open" ? "Open" : "Closed"} ({isLoading ? "…" : tab === "open" ? openNotes.length : closedNotes.length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : displayNotes.length > 0 ? (
        <div className="space-y-3">
          {displayNotes.map((note) => {
            const isClosed = isNoteClosed(note);
            const canEdit = isAdmin || note.userId === me?.id;
            const isEditing = editingId === note.id;
            const noteBody = note.description ?? note.title ?? "";

            return (
              <div
                key={note.id}
                className={`flex gap-3 p-4 border rounded-lg bg-card group ${isClosed ? "opacity-70" : ""}`}
              >
                <button
                  className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                  title={isClosed ? "Reopen note" : "Close note"}
                  onClick={() => {
                    const newStatus = isClosed ? "open" : "closed";
                    setLocalStatusOverrides(prev => ({ ...prev, [note.id]: newStatus }));
                    updateNote.mutate({ id: note.id, status: newStatus });
                  }}
                >
                  {isClosed
                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : <Circle className="h-5 w-5" />}
                </button>

                <div className="shrink-0 mt-0.5">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{note.user?.name ?? "Unknown"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && !isEditing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingId(note.id); setEditDraft(noteBody); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && !isEditing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteNote.mutate(note.id)}
                          disabled={deleteNote.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        className="resize-none min-h-[80px] text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!editDraft.trim() || updateNote.isPending || editDraft === noteBody}
                          onClick={() => updateNote.mutate({ id: note.id, body: editDraft })}
                        >
                          {updateNote.isPending
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Check className="mr-1.5 h-3.5 w-3.5" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditDraft(""); }}>
                          <X className="mr-1.5 h-3.5 w-3.5" />Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-sm mt-1 whitespace-pre-wrap ${isClosed ? "text-muted-foreground" : ""}`}>
                      {noteBody}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">
            {noteTab === "open" ? "No open notes. Add one above." : "No closed notes yet."}
          </p>
        </div>
      )}
    </div>
  );
}
