import { useState, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Trash2, User, Download, Loader2 } from "lucide-react";
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
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [exportingNotes, setExportingNotes] = useState(false);

  const handleExportNotes = async () => {
    setExportingNotes(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ entityType, entityId });
      const res = await fetch(`${BASE}/api/notes/export?${params}`, {
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
        `${BASE}/api/notes?entityType=${entityType}&entityId=${entityId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!entityId,
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const res = await authFetch(`${BASE}/api/notes`, {
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
      setDraft("");
      toast({ title: "Note saved" });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Could not save note",
        variant: "destructive",
      }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`${BASE}/api/notes/${id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete note");
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<Note[]>(
        notesQueryKey(entityType, entityId),
        (old) => (old ?? []).filter((n) => n.id !== id),
      );
      toast({ title: "Note deleted" });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Could not delete note",
        variant: "destructive",
      }),
  });

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
          {notes.map((note) => (
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
                      {formatDistanceToNow(new Date(note.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteNote.mutate(note.id)}
                    disabled={deleteNote.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{note.body}</p>
              </div>
            </div>
          ))}
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
