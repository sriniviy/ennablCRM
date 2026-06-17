import { useState, useRef } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { CustomFieldsSettings } from "@/components/custom-fields/custom-fields-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import { useGetMe } from "@workspace/api-client-react";
import { Network, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_MEMBER_OF = [
  "Acrisure",
  "Afore",
  "ALKEME",
  "Alera",
  "Alliant",
  "Applied Reference Client",
  "Association of Risk Managers Northwest",
  "Assurex",
  "BIGN",
  "BroadStreet",
  "CIAB",
  "Fortified",
  "Gallagher",
  "HUB",
  "HighStreet",
  "InCite",
  "Insurors Group",
  "Intersure",
  "Iroquois Group",
  "ISU",
  "Keystone",
  "Marsh/MMA",
  "MarshBerry Connect",
  "New Demos Challenge 26",
  "Outmarket Customer",
  "PacWest",
  "Patriot",
  "Reagan Survey",
  "RiskProNet",
  "Top 100 Target List",
  "USI",
  "Vertafore Reference Customer",
];

function MemberOfSettings() {
  const getToken = useSessionToken();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const [newMember, setNewMember] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ options: string[] }>({
    queryKey: ["settings", "member-of"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/settings/member-of", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  // Fall back to the hardcoded defaults so the list is never empty on load
  const options: string[] = data?.options?.length ? data.options : DEFAULT_MEMBER_OF;

  const save = useMutation({
    mutationFn: async (newOptions: string[]) => {
      const token = await getToken();
      const res = await fetch("/api/settings/member-of", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ options: newOptions }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "member-of"] }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleAdd = () => {
    const val = newMember.trim();
    if (!val || options.includes(val)) return;
    save.mutate([...options, val].sort());
    setNewMember("");
    inputRef.current?.focus();
  };

  const handleRemove = (member: string) => {
    save.mutate(options.filter(o => o !== member));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Member Of Options
        </CardTitle>
        <CardDescription>
          Manage the list of networks and groups available in the "Member Of" field on company records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-7 w-28 rounded-full" />)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map(opt => (
              <Badge key={opt} variant="secondary" className="pl-2.5 pr-1.5 py-1 text-sm gap-1.5">
                {opt}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleRemove(opt)}
                    className="rounded-full hover:text-destructive transition-colors"
                    title={`Remove ${opt}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-2 pt-1 border-t">
            <Input
              ref={inputRef}
              placeholder="Add a network or group…"
              value={newMember}
              onChange={e => setNewMember(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
              className="max-w-xs"
              disabled={save.isPending}
            />
            <Button size="sm" onClick={handleAdd} disabled={!newMember.trim() || save.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsCustomFieldsPage() {
  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">Add and manage custom properties for contacts, companies, and deals.</p>
        </div>

        <MemberOfSettings />
        <CustomFieldsSettings />
      </div>
    </SidebarLayout>
  );
}
