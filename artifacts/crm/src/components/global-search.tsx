import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Users, Building2, CircleDollarSign, CheckSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResults {
  contacts: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  companies: Array<{ id: string; name: string }>;
  deals: Array<{ id: string; title: string; value: number | null }>;
  tasks: Array<{ id: string; title: string; completed: boolean }>;
}

function useSearch(query: string) {
  const { getToken } = useAuth();
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

  const debouncedQuery = useDebounce(input, 200);
  const { data, isFetching } = useSearch(debouncedQuery);

  const hasResults =
    data &&
    (data.contacts.length > 0 ||
      data.companies.length > 0 ||
      data.deals.length > 0 ||
      data.tasks.length > 0);

  const handleOpenChange = useCallback((val: boolean) => {
    setOpen(val);
    if (!val) setInput("");
  }, []);

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
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
          {debouncedQuery.trim().length === 0 && (
            <CommandEmpty>Start typing to search…</CommandEmpty>
          )}

          {debouncedQuery.trim().length > 0 && !isFetching && !hasResults && (
            <CommandEmpty>No results for "{debouncedQuery}"</CommandEmpty>
          )}

          {data && data.contacts.length > 0 && (
            <>
              <CommandGroup heading="Contacts">
                {data.contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`contact-${c.id}-${c.firstName} ${c.lastName}`}
                    onSelect={() => go(`/contacts/${c.id}`)}
                    className="cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-medium">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(data.companies.length > 0 ||
                data.deals.length > 0 ||
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
                    onSelect={() => go(`/companies/${c.id}`)}
                    className="cursor-pointer"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {(data.deals.length > 0 || data.tasks.length > 0) && <CommandSeparator />}
            </>
          )}

          {data && debouncedQuery.trim().length > 0 && data.deals.length > 0 && (
            <>
              <CommandGroup heading="Deals">
                {data.deals.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`deal-${d.id}-${d.title}`}
                    onSelect={() => go(`/deals?open=${d.id}`)}
                    className="cursor-pointer"
                  >
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {data.tasks.length > 0 && <CommandSeparator />}
            </>
          )}

          {data && debouncedQuery.trim().length > 0 && data.tasks.length > 0 && (
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
                    {t.title}
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
