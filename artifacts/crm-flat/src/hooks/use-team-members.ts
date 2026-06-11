import { useSessionToken } from "@/hooks/use-session-token";

import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TeamMember {
  id: string;
  clerkId: string | null;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

export function useTeamMembers() {
  const getToken = useSessionToken();
  return useQuery<TeamMember[]>({
    queryKey: ["team", "members"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load team members");
      const data = await res.json();
      return (data.members ?? []) as TeamMember[];
    },
  });
}
