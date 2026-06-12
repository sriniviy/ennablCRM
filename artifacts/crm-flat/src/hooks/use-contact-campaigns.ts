import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ContactCampaignRow {
  campaignId: string;
  email: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  unsubscribedAt: string | null;
  campaignName: string;
  campaignSubject: string;
  campaignStatus: string;
  campaignSentAt: string | null;
}

export function useContactCampaigns(contactId: string) {
  const getToken = useSessionToken();
  return useQuery<ContactCampaignRow[]>({
    queryKey: ["contact-campaigns", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/campaigns/for-contact/${contactId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch campaign history");
      return res.json();
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });
}

export function useSetContactSubscription(contactId: string) {
  const getToken = useSessionToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: "unsubscribe" | "resubscribe") => {
      const token = await getToken();
      const res = await fetch(`/api/campaigns/contact-subscription/${contactId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update subscription status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-campaigns", contactId] });
    },
  });
}
