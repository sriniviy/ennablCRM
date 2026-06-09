import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCompany, useUpdateCompany, useDeleteCompany,
  getListCompaniesQueryKey, getGetCompanyQueryKey,
  type Company,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: Company;
}

export function CompanyDialog({ open, onOpenChange, company }: CompanyDialogProps) {

  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!company;

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const create = useCreateCompany();
  const update = useUpdateCompany();
  const remove = useDeleteCompany();

  useEffect(() => {
    if (open) {
      setName(company?.name ?? "");
      setDomain(company?.domain ?? "");
      setIndustry(company?.industry ?? "");
      setSize(company?.size ?? "");
      setWebsite(company?.website ?? "");
      setPhone(company?.phone ?? "");
      setCity(company?.city ?? "");
      setCountry(company?.country ?? "");
    }
  }, [open, company]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
    if (company?.id) qc.invalidateQueries({ queryKey: getGetCompanyQueryKey(company.id) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      domain: domain || undefined,
      industry: industry || undefined,
      size: size || undefined,
      website: website || undefined,
      phone: phone || undefined,
      city: city || undefined,
      country: country || undefined,
    };
    if (isEdit) {
      update.mutate({ id: company.id, data }, {
        onSuccess: () => { toast({ title: "Company updated" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to update company", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: () => { toast({ title: "Company created" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to create company", variant: "destructive" }),
      });
    }
  };

  const handleDelete = () => {
    remove.mutate({ id: company!.id }, {
      onSuccess: () => { toast({ title: "Company deleted" }); invalidate(); onOpenChange(false); },
      onError: () => toast({ title: "Error", description: "Failed to delete company", variant: "destructive" }),
    });
  };

  const isPending = create.isPending || update.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Company" : "New Company"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-name">Company Name *</Label>
              <Input id="co-name" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-domain">Domain</Label>
                <Input id="co-domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-website">Website</Label>
                <Input id="co-website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://acme.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-industry">Industry</Label>
                <Input id="co-industry" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="SaaS, Finance…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-size">Company Size</Label>
                <Input id="co-size" value={size} onChange={e => setSize(e.target.value)} placeholder="1-10, 50-200…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-phone">Phone</Label>
                <Input id="co-phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-city">City</Label>
                <Input id="co-city" value={city} onChange={e => setCity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-country">Country</Label>
              <Input id="co-country" value={country} onChange={e => setCountry(e.target.value)} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {isEdit && (
                <Button type="button" variant="destructive" size="icon" className="mr-auto" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Company"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete company?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {company?.name}.</AlertDialogDescription>
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
