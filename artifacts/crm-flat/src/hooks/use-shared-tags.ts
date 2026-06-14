import { useQuery } from "@tanstack/react-query";
import { useSessionToken } from "./use-session-token";

export type SharedTagsMap = Record<string, Record<string, string>>;

export function useSharedTags(): SharedTagsMap {
  const getToken = useSessionToken();
  const { data } = useQuery<SharedTagsMap>({
    queryKey: ["shared-tags"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/messages/shared-tags", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return data ?? {};
}
