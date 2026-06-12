import { useSessionToken } from "@/hooks/use-session-token";
import { useQuery } from "@tanstack/react-query";

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
