import { useQueryClient } from "@tanstack/react-query";
import {
  useListCompanyDuplicates,
  useMergeCompanies,
  getListCompaniesQueryKey,
  getListCompanyDuplicatesQueryKey,
  getGetCompanyQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { DuplicatesDialog } from "./duplicates-dialog";
import { companyMergeConfig } from "./merge-resolution";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusId?: string;
}

export function CompanyDuplicatesDialog({ open, onOpenChange, focusId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListCompanyDuplicates({
    query: { enabled: open, queryKey: getListCompanyDuplicatesQueryKey() },
  });
  const merge = useMergeCompanies();

  const onConfirm = async (primaryId: string, mergeIds: string[]) => {
    try {
      await merge.mutateAsync({ data: { primaryId, mergeIds } });
      toast({ title: "Companies merged" });
      qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      qc.invalidateQueries({ queryKey: getListCompanyDuplicatesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(primaryId) });
      mergeIds.forEach((id) => qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) }));
    } catch {
      toast({ title: "Merge failed", description: "Could not merge the selected companies.", variant: "destructive" });
    }
  };

  return (
    <DuplicatesDialog
      open={open}
      onOpenChange={onOpenChange}
      groups={data?.groups}
      isLoading={isLoading}
      isMerging={merge.isPending}
      config={companyMergeConfig}
      focusId={focusId}
      onConfirm={onConfirm}
    />
  );
}
