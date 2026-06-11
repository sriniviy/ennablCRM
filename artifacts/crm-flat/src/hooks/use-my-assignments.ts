import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useMyAssignments() {
  const getToken = useSessionToken();
  return useQuery<{ deals: number; tasks: number }>({
    queryKey: ["my-assignments"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/team/my-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
