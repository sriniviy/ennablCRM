import { useSessionToken } from "@/hooks/use-session-token";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Users, Building2, CircleDollarSign, CheckSquare, Activity, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResults {
  contacts: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  companies: Array<{ id: string; name: string; domain: string | null; domains: string[] }>;
  deals: Array<{ id: string; title: string; value: number | null }>;
  activities: Array<{
    id: string;
    type: string;
    title: string;
    emailSubject: string | null;
    contactId: string | null;
    companyId: string | null;
    dealId: string | null;
  }>;
  tasks: Array<{ id: string; title: string; completed: boolean }>;
}

const RECENT_KEY = "crm_recent_records";
const MAX_RECENT = 6;

interface RecentRecord {
  type: "contact" | "company" | "deal";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

function getRecentRecords(): RecentRecord[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentRecord[];
  } catch {
    return [];
  }
}

function saveRecentRecord(record: RecentRecord) {
  try {
    const existing = getRecentRecords().filter((r) => r.href !== record.href);
    localStorage.setItem(RECENT_KEY, JSON.stringify([record, ...existing].slice(0, MAX_RECENT)));
  } catch {}
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700 text-foreground rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const ICON_FOR_TYPE: Record<RecentRecord["type"], React.ReactNode> = {
  contact: <Users className="h-4 w-4 text-muted-foreground shrink-0" />,
  company: <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />,
  deal: <CircleDollarSign className="h-4 w-4 text-muted-foreground shrink-0" />,
};

function useSearch(query: string) {
  const getToken = useSessionToken();
  return useQuery<SearchResults>({
    queryKey: ["search", query],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<SearchResults>;
    },
    enabled: query.trim().length >= 1,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface GlobalSearchProps {
  collapsed?: boolean;
}

export function GlobalSearch({ collapsed }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [, navigate] = useLocation();
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);

  const debouncedQuery = useDebounce(input, 200);
  const { data, isFetching } = useSearch(debouncedQuery);

  const hasResults =
    data &&
    (data.contacts.length > 0 ||
      data.companies.length > 0 ||
      data.deals.length > 0 ||
      data.activities.length > 0 ||
      data.tasks.length > 0);

  const handleOpenChange = useCallback((val: boolean) => {
    setOpen(val);
    if (!val) setInput("");
    if (val) setRecentRecords(getRecentRecords());
  }, []);

  const go = useCallback(
    (href: string, recent?: RecentRecord) => {
      handleOpenChange(false);
      if (recent) {
        saveRecentRecord(recent);
        setRecentRecords(getRecentRecords());
      }
      navigate(href);
    },
    [handleOpenChange, navigate],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const q = debouncedQuery.trim();
  const showRecent = q.length === 0 && recentRecords.length > 0;
  const showEmpty = q.length > 0 && !isFetching && !hasResults;

  return (
    <>
      {collapsed ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="h-8 w-8"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border bg-background/50"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">Search…</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span>⌘</span>K
          </kbd>
        </button>
      )}

      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <CommandInput
          placeholder="Search contacts, companies, deals, tasks…"
          value={input}
          onValueChange={setInput}
        />
        <CommandList>
          {q.length === 0 && !showRecent && (
            <CommandEmpty>Start typing to search…</CommandEmpty>
          )}

          {showEmpty && (
            <CommandEmpty>No results for "{debouncedQuery}"</CommandEmpty>
          )}

          {showRecent && (
            <CommandGroup heading="Recent">
              {recentRecords.map((r) => (
                <CommandItem
                  key={r.href}
                  value={`recent-${r.href}`}
                  onSelect={() => go(r.href)}
                  className="cursor-pointer"
                >
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  {ICON_FOR_TYPE[r.type]}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{r.label}</span>
                    {r.sublabel && (
                      <span className="text-xs text-muted-foreground truncate">{r.sublabel}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.contacts.length > 0 && (
            <>
              <CommandGroup heading="Contacts">
                {data.contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`contact-${c.id}-${c.firstName} ${c.lastName}`}
                    onSelect={() =>
                      go(`/contacts/${c.id}`, {
                        type: "contact",
                        id: c.id,
                        label: `${c.firstName} ${c.lastName}`,
                        sublabel: c.email,
                        href: `/contacts/${c.id}`,
                      })
                    }
                    className="cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">
                        <Highlight text={`${c.firstName} ${c.lastName}`} query={q} />
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        <Highlight text={c.email} query={q} />
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(data.companies.length > 0 ||
                data.deals.length > 0 ||
                data.activities.length > 0 ||
                data.tasks.length > 0) && <CommandSeparator />}
            </>
          )}

          {data && data.companies.length > 0 && (
            <>
              <CommandGroup heading="Companies">
                {data.companies.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`company-${c.id}-${c.name}`}
                    onSelect={() =>
                      go(`/companies/${c.id}`, {
                        type: "company",
                        id: c.id,
                        label: c.name,
                        sublabel: c.domain ?? c.domains[0],
                        href: `/companies/${c.id}`,
                      })
                    }
                    className="cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">
                        <Highlight text={c.name} query={q} />
                      </span>
                      {(c.domain || c.domains.length > 0) && (
                        <span className="text-xs text-muted-foreground truncate">
                          {[c.domain, ...c.domains]
                            .filter((d): d is string => !!d)
                            .filter((d, i, arr) => arr.indexOf(d) === i)
                            .join(", ")}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(data.deals.length > 0 ||
                data.activities.length > 0 ||
                data.tasks.length > 0) && <CommandSeparator />}
            </>
          )}

          {data && q.length > 0 && data.deals.length > 0 && (
            <>
              <CommandGroup heading="Deals">
                {data.deals.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`deal-${d.id}-${d.title}`}
                    onSelect={() =>
                      go(`/deals?open=${d.id}`, {
                        type: "deal",
                        id: d.id,
                        label: d.title,
                        href: `/deals?open=${d.id}`,
                      })
                    }
                    className="cursor-pointer"
                  >
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      <Highlight text={d.title} query={q} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(data.activities.length > 0 || data.tasks.length > 0) && <CommandSeparator />}
            </>
          )}

          {data && q.length > 0 && data.activities.length > 0 && (
            <>
              <CommandGroup heading="Activities">
                {data.activities.map((a) => {
                  const href = a.contactId
                    ? `/contacts/${a.contactId}`
                    : a.companyId
                      ? `/companies/${a.companyId}`
                      : a.dealId
                        ? `/deals?open=${a.dealId}`
                        : null;
                  return (
                    <CommandItem
                      key={a.id}
                      value={`activity-${a.id}-${a.title}`}
                      onSelect={() => href && go(href)}
                      disabled={!href}
                      className="cursor-pointer"
                    >
                      <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">
                          <Highlight text={a.title} query={q} />
                        </span>
                        {a.emailSubject && (
                          <span className="text-xs text-muted-foreground truncate">
                            {a.emailSubject}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {data.tasks.length > 0 && <CommandSeparator />}
            </>
          )}

          {data && q.length > 0 && data.tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {data.tasks.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`task-${t.id}-${t.title}`}
                  onSelect={() => go(`/tasks?open=${t.id}`)}
                  className="cursor-pointer"
                >
                  <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className={`truncate ${t.completed ? "line-through text-muted-foreground" : ""}`}>
                    <Highlight text={t.title} query={q} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
