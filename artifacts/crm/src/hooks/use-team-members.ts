import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TeamMember {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
}

export function useTeamMembers() {
  const { getToken } = useAuth();
  return useQuery<TeamMember[]>({
    queryKey: ["team", "members"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load team members");
      const data = await res.json();
      return (data.members ?? []) as TeamMember[];
    },
  });
}
