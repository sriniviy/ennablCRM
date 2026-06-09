import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateContact, useUpdateContact, useDeleteContact,
  useListCompanies,
  getListContactsQueryKey, getGetContactQueryKey,
  ContactStatus, ReviewStatus, type ContactWithRelations,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactWithRelations;
}

const STATUSES = Object.values(ContactStatus);
const REVIEW_STATUSES = Object.values(ReviewStatus);

export function ContactDialog({ open, onOpenChange, contact }: ContactDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!contact;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>("LEAD");
  const [reviewStatus, setReviewStatus] = useState<string>("REVIEWED");
  const [ennablUser, setEnnablUser] = useState(false);
  const [emailMarketingContact, setEmailMarketingContact] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const { data: companies } = useListCompanies({ page: 1, pageSize: 200 });
  const create = useCreateContact();
  const update = useUpdateContact();
  const remove = useDeleteContact();

  useEffect(() => {
    if (open) {
      setFirstName(contact?.firstName ?? "");
      setLastName(contact?.lastName ?? "");
      setEmail(contact?.email ?? "");
      setPhone(contact?.phone ?? "");
      setTitle(contact?.title ?? "");
      setStatus(contact?.status ?? "LEAD");
      setReviewStatus(contact?.reviewStatus ?? "REVIEWED");
      setEnnablUser(contact?.ennablUser ?? false);
      setEmailMarketingContact(contact?.emailMarketingContact ?? false);
      setCompanyId(contact?.company?.id ?? "");
      setTags((contact?.tags ?? []).join(", "));
      setNotes(contact?.notes ?? "");
    }
  }, [open, contact]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
    if (contact?.id) qc.invalidateQueries({ queryKey: getGetContactQueryKey(contact.id) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      firstName, lastName,
      email: email || undefined,
      phone: phone || undefined,
      title: title || undefined,
      status: status as typeof ContactStatus[keyof typeof ContactStatus],
      reviewStatus: reviewStatus as typeof ReviewStatus[keyof typeof ReviewStatus],
      ennablUser,
      emailMarketingContact,
      companyId: companyId || undefined,
      tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      notes: notes || undefined,
    };
    if (isEdit) {
      update.mutate({ id: contact.id, data }, {
        onSuccess: () => { toast({ title: "Contact updated" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to update contact", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: () => { toast({ title: "Contact created" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to create contact", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    remove.mutate({ id: contact!.id }, {
      onSuccess: () => { toast({ title: "Contact deleted" }); invalidate(); onOpenChange(false); },
      onError: () => toast({ title: "Error", description: "Failed to delete contact", variant: "destructive" }),
    });
  };

  const isPending = create.isPending || update.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Contact" : "New Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-first">First Name *</Label>
                <Input id="c-first" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-last">Last Name *</Label>
                <Input id="c-last" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-title">Job Title</Label>
                <Input id="c-title" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={companyId || "none"} onValueChange={v => setCompanyId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No company</SelectItem>
                  {companies?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Review Status</Label>
              <Select value={reviewStatus} onValueChange={setReviewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="c-ennabl" className="cursor-pointer">Ennabl User</Label>
              <Switch id="c-ennabl" checked={ennablUser} onCheckedChange={setEnnablUser} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="c-marketing" className="cursor-pointer">Email Marketing Contact</Label>
              <Switch id="c-marketing" checked={emailMarketingContact} onCheckedChange={setEmailMarketingContact} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tags">Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input id="c-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, hot-lead, partner" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {isEdit && (
                <Button type="button" variant="destructive" size="icon" className="mr-auto" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Contact"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {contact?.firstName} {contact?.lastName} and all their data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
