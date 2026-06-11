import { useSessionToken } from "@/hooks/use-session-token";
import { useGetMe } from "@workspace/api-client-react";
import { useState, useCallback } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Trash2, User, Download, Loader2, Pencil, X, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Note {
  id: string;
  body: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
}

interface NotesFeedProps {
  entityType: "contact" | "company" | "deal";
  entityId: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function notesQueryKey(entityType: string, entityId: string) {
  return ["notes", entityType, entityId];
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

  const handleExportNotes = async () => {
    setExportingNotes(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ entityType, entityId });
      const res = await fetch(`/api/notes/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notes-${entityType}-${entityId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExportingNotes(false);
    }
  };

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken();
      return fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: notesQueryKey(entityType, entityId),
    queryFn: async () => {
      const res = await authFetch(
        `/api/notes?entityType=${entityType}&entityId=${entityId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!entityId,
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const res = await authFetch(`/api/notes`, {
        method: "POST",
        body: JSON.stringify({ body, entityType, entityId }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      return res.json() as Promise<Note>;
    },
    onSuccess: (newNote) => {
      qc.setQueryData<Note[]>(
        notesQueryKey(entityType, entityId),
        (old) => [newNote, ...(old ?? [])],
      );
      qc.invalidateQueries({ queryKey: ["notes-count", entityType, entityId] });
      setDraft("");
      toast({ title: "Note saved" });
    },
    onError: () =>
      toast({ title: "Error", description: "Could not save note", variant: "destructive" }),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const res = await authFetch(`/api/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Failed to update note");
      return res.json() as Promise<Note>;
    },
    onSuccess: (updated) => {
      qc.setQueryData<Note[]>(
        notesQueryKey(entityType, entityId),
        (old) => (old ?? []).map((n) => (n.id === updated.id ? { ...n, body: updated.body } : n)),
      );
      setEditingId(null);
      setEditDraft("");
      toast({ title: "Note updated" });
    },
    onError: () =>
      toast({ title: "Error", description: "Could not update note", variant: "destructive" }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete note");
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<Note[]>(
        notesQueryKey(entityType, entityId),
        (old) => (old ?? []).filter((n) => n.id !== id),
      );
      qc.invalidateQueries({ queryKey: ["notes-count", entityType, entityId] });
      toast({ title: "Note deleted" });
    },
    onError: () =>
      toast({ title: "Error", description: "Could not delete note", variant: "destructive" }),
  });

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

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

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => {
            const canEdit = isAdmin || note.authorId === me?.id;
            const canDelete = isAdmin || note.authorId === me?.id;
            const isEditing = editingId === note.id;

            return (
              <div
                key={note.id}
                className="flex gap-3 p-4 border rounded-lg bg-card group"
              >
                <div className="shrink-0 mt-0.5">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        {note.authorName ?? "Unknown"}
                      </span>
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
                          onClick={() => startEdit(note)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && !isEditing && (
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
                          disabled={!editDraft.trim() || updateNote.isPending || editDraft === note.body}
                          onClick={() => updateNote.mutate({ id: note.id, body: editDraft })}
                        >
                          {updateNote.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm mt-1 whitespace-pre-wrap">{note.body}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No notes yet. Add the first one above.</p>
        </div>
      )}
    </div>
  );
}
