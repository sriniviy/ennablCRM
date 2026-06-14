import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Inbox, User, Building2, X, CheckCheck, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface InboxMessage {
  id: string;
  fromUserId: string;
  type: string;
  note: string | null;
  read: boolean;
  createdAt: string;
  sender: { id: string; name: string | null; email: string; avatarUrl: string | null } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    status: string;
  } | null;
  company: { id: string; name: string; website: string | null } | null;
}

export function InboxPage() {
  const getToken = useSessionToken();
  const qc = useQueryClient();

  const authFetch = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/messages${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  };

  const { data: messages = [], isLoading } = useQuery<InboxMessage[]>({
    queryKey: ["inbox"],
    queryFn: () => authFetch(""),
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => authFetch(`/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => authFetch("/read-all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => authFetch(`/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
    },
  });

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Inbox
              {unreadCount > 0 && (
                <Badge className="bg-primary text-primary-foreground text-xs">
                  {unreadCount} new
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Contact cards shared with you by teammates.</p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border p-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nothing here yet</p>
              <p className="text-sm text-muted-foreground">When a teammate shares a contact with you, it'll show up here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const senderName = msg.sender?.name ?? msg.sender?.email ?? "A teammate";
              const senderInitial = (msg.sender?.name?.[0] ?? msg.sender?.email?.[0] ?? "?").toUpperCase();
              const isCompany = msg.type === "company_share";
              const contactName = msg.contact
                ? `${msg.contact.firstName} ${msg.contact.lastName}`.trim() || msg.contact.email || "Contact"
                : null;
              const recordName = isCompany
                ? (msg.company?.name ?? "Deleted company")
                : (contactName ?? "Deleted contact");
              const recordHref = isCompany
                ? (msg.company ? `/companies/${msg.company.id}` : null)
                : (msg.contact ? `/contacts/${msg.contact.id}` : null);
              const recordSubtitle = isCompany
                ? msg.company?.website
                : (msg.contact ? [msg.contact.email, msg.contact.phone, msg.contact.title].filter(Boolean).join(" · ") : null);
              const RecordIcon = isCompany ? Building2 : User;
              const recordDeleted = isCompany ? !msg.company : !msg.contact;

              return (
                <div
                  key={msg.id}
                  className={`relative rounded-lg border px-4 py-3.5 transition-colors ${
                    !msg.read ? "bg-primary/5 border-primary/20" : "bg-card"
                  }`}
                >
                  {!msg.read && (
                    <span className="absolute top-3.5 left-2 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}

                  <div className="flex items-start gap-3 pl-2">
                    {/* Sender avatar */}
                    <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                      <AvatarImage src={msg.sender?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{senderInitial}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{senderName}</span>
                        <span className="text-muted-foreground"> shared a {isCompany ? "company" : "contact"} with you</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </p>

                      {/* Record card */}
                      {!recordDeleted ? (
                        <div className="mt-2.5 rounded-md border bg-background px-3 py-2.5 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <RecordIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{recordName}</p>
                            {recordSubtitle && (
                              <p className="text-xs text-muted-foreground truncate">{recordSubtitle}</p>
                            )}
                          </div>
                          {recordHref && (
                            <Link href={recordHref} onClick={() => { if (!msg.read) markRead.mutate(msg.id); }}>
                              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0">
                                View <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground italic">{isCompany ? "Company" : "Contact"} no longer exists.</p>
                      )}

                      {/* Note */}
                      {msg.note && (
                        <p className="mt-2 text-sm text-muted-foreground italic">"{msg.note}"</p>
                      )}
                    </div>

                    {/* Dismiss */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => dismiss.mutate(msg.id)}
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
