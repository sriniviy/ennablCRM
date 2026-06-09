import { useCallback } from "react";
import { authClient } from "@/lib/auth-client";

export function useSessionToken(): () => Promise<string | null> {
  return useCallback(async () => {
    const { data } = await authClient.getSession();
    return data?.session?.token ?? null;
  }, []);
}
