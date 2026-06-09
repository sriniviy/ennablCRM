import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

export function useUrlFilters() {
  const searchStr = useSearch();
  const [location, navigate] = useLocation();

  const get = useCallback(
    (key: string, fallback = "") => new URLSearchParams(searchStr).get(key) ?? fallback,
    [searchStr],
  );

  const set = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchStr);
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "" || value === "ALL") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      if (qs === new URLSearchParams(searchStr).toString()) return;
      navigate(`${location}${qs ? `?${qs}` : ""}`, { replace: true });
    },
    [searchStr, location, navigate],
  );

  return { get, set };
}
