import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  Trash2,
  Download,
  Upload,
  FileText,
  Image,
  File,
  History,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface Attachment {
  id: string;
  documentId: string;
  version: number;
  objectType: string;
  recordId: string;
  objectPath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  versionCount?: number;
}

interface AttachmentsPanelProps {
  objectType: "contact" | "company" | "deal";
  recordId: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (contentType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function downloadObject(objectPath: string, fileName: string) {
  const url = `/api/storage${objectPath}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

function VersionHistory({ documentId }: { documentId: string }) {
  const { data: versions = [], isLoading } = useQuery<Attachment[]>({
    queryKey: ["attachment-versions", documentId],
    queryFn: async () => {
      const res = await fetch(`/api/attachments/versions/${documentId}`);
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading versions…</div>;
  }

  return (
    <div className="bg-muted/30 border-t divide-y">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center gap-3 px-3 py-2 pl-10">
          <span className="text-xs font-medium text-muted-foreground shrink-0">v{v.version}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs truncate">{v.fileName}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(v.fileSize)} · {v.uploadedByName} ·{" "}
              {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => downloadObject(v.objectPath, v.fileName)}
            title={`Download v${v.version}`}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function AttachmentsPanel({ objectType, recordId }: AttachmentsPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // documentId being uploaded as a new version, or null for a brand-new document
  const uploadTargetRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const queryKey = ["attachments", objectType, recordId];

  const { data: attachments = [], isLoading } = useQuery<Attachment[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/attachments/${objectType}/${recordId}`);
      if (!res.ok) throw new Error("Failed to load attachments");
      return res.json();
    },
    enabled: !!recordId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`/api/attachments/document/${documentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete document");
    },
    onSuccess: (_d, documentId) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["attachment-versions", documentId] });
      toast.success("File deleted");
    },
    onError: () => toast.error("Failed to delete file"),
  });

  function triggerUpload(documentId: string | null) {
    uploadTargetRef.current = documentId;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const documentId = uploadTargetRef.current;
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");

      const saveRes = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectType,
          recordId,
          objectPath,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
          ...(documentId ? { documentId } : {}),
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save attachment record");

      queryClient.invalidateQueries({ queryKey });
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ["attachment-versions", documentId] });
        toast.success(`New version of ${file.name} uploaded`);
      } else {
        toast.success(`${file.name} uploaded`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          <span>
            {attachments.length} document{attachments.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerUpload(null)}
            disabled={uploading}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading…" : "Upload File"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
      ) : attachments.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <Paperclip className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No files attached yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Click "Upload File" to add attachments</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border overflow-hidden">
          {attachments.map((att) => {
            const versionCount = att.versionCount ?? 1;
            const isExpanded = !!expanded[att.documentId];
            return (
              <div key={att.documentId} className="bg-card">
                <div className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors">
                  <FileIcon contentType={att.contentType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{att.fileName}</p>
                      {versionCount > 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                          v{att.version}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(att.fileSize)} · {att.uploadedByName} ·{" "}
                      {formatDistanceToNow(new Date(att.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {versionCount > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [att.documentId]: !prev[att.documentId],
                          }))
                        }
                        title="Version history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => triggerUpload(att.documentId)}
                      disabled={uploading}
                      title="Upload new version"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadObject(att.objectPath, att.fileName)}
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(att.documentId)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {isExpanded && versionCount > 1 && (
                  <VersionHistory documentId={att.documentId} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
