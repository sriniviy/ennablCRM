import { useQueryClient } from "@tanstack/react-query";
import {
  useListContactDuplicates,
  useMergeContacts,
  getListContactsQueryKey,
  getListContactDuplicatesQueryKey,
  getGetContactQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { DuplicatesDialog } from "./duplicates-dialog";
import { contactMergeConfig } from "./merge-resolution";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusId?: string;
}

export function ContactDuplicatesDialog({ open, onOpenChange, focusId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListContactDuplicates({
    query: { enabled: open, queryKey: getListContactDuplicatesQueryKey() },
  });
  const merge = useMergeContacts();

  const onConfirm = async (primaryId: string, mergeIds: string[]) => {
    try {
      await merge.mutateAsync({ data: { primaryId, mergeIds } });
      toast({ title: "Contacts merged" });
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      qc.invalidateQueries({ queryKey: getListContactDuplicatesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetContactQueryKey(primaryId) });
      mergeIds.forEach((id) => qc.invalidateQueries({ queryKey: getGetContactQueryKey(id) }));
    } catch {
      toast({ title: "Merge failed", description: "Could not merge the selected contacts.", variant: "destructive" });
    }
  };

  return (
    <DuplicatesDialog
      open={open}
      onOpenChange={onOpenChange}
      groups={data?.groups}
      isLoading={isLoading}
      isMerging={merge.isPending}
      config={contactMergeConfig}
      focusId={focusId}
      onConfirm={onConfirm}
    />
  );
}
