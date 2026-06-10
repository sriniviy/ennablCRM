import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListContacts,
  useListCompanies,
  useUpdateContact,
  ReviewStatus,
  getListContactsQueryKey,
  type ContactWithRelations,
} from "@workspace/api-client-react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, EyeOff, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ReviewRow({ contact }: { contact: ContactWithRelations }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateContact();
  const { data: companiesData } = useListCompanies({ page: 1, pageSize: 200 });
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    contact.company?.id ?? "",
  );
  const [editOpen, setEditOpen] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListContactsQueryKey() });

  const handleReviewed = () => {
    update.mutate(
      {
        id: contact.id,
        data: {
          reviewStatus: "REVIEWED",
          companyId: selectedCompanyId || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Marked as reviewed" });
          invalidate();
        },
        onError: () =>
          toast({
            title: "Error",
            description: "Failed to update contact",
            variant: "destructive",
          }),
      },
    );
  };

  const handleSuppress = () => {
    update.mutate(
      { id: contact.id, data: { reviewStatus: "SUPPRESSED" } },
      {
        onSuccess: () => {
          toast({ title: "Contact suppressed" });
          invalidate();
        },
        onError: () =>
          toast({
            title: "Error",
            description: "Failed to update contact",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <>
      <TableRow>
        <TableCell>
          <Link
            href={`/contacts/${contact.id}`}
            className="font-medium hover:underline text-primary"
          >
            {contact.firstName} {contact.lastName}
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {contact.email ?? "—"}
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {contact.title ?? "—"}
        </TableCell>
        <TableCell>
          <Select
            value={selectedCompanyId || "none"}
            onValueChange={(v) =>
              setSelectedCompanyId(v === "none" ? "" : v)
            }
          >
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="No company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No company</SelectItem>
              {(companiesData?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleReviewed}
              disabled={update.isPending}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Reviewed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSuppress}
              disabled={update.isPending}
              className="gap-1.5 text-muted-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Suppress
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </TableCell>
      </TableRow>
      <ContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={contact}
      />
    </>
  );
}

export function NeedsReviewPage() {
  const { data, isLoading } = useListContacts({
    reviewStatus: ReviewStatus.AUTO_CREATED,
    page: 1,
    pageSize: 50,
  });

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Needs Review</h1>
            {total > 0 && (
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-sm font-semibold px-2.5">
                {total}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Contacts whose company association needs a human to confirm or fix.
            Assign a company and mark reviewed, or suppress to hide from normal
            lists.
          </p>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Assign Company</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(4)].map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : contacts.length > 0 ? (
                contacts.map((contact) => (
                  <ReviewRow key={contact.id} contact={contact} />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No contacts need review — you're all caught up!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </SidebarLayout>
  );
}
