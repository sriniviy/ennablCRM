import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useNotesCount(entityType: string, entityId: string) {
  const getToken = useSessionToken();
  return useQuery<{ count: number }>({
    queryKey: ["notes-count", entityType, entityId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `/api/notes/count?entityType=${entityType}&entityId=${entityId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Failed to fetch notes count");
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 30_000,
  });
}
