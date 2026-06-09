import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCompany, useUpdateCompany, useDeleteCompany,
  getListCompaniesQueryKey, getGetCompanyQueryKey,
  CompanyStatus, type Company,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTeamMembers } from "@/hooks/use-team-members";

const STATUSES = Object.values(CompanyStatus);
const toList = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean);

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
  const [domains, setDomains] = useState("");
  const [status, setStatus] = useState<string>("none");
  const [productLicensed, setProductLicensed] = useState("");
  const [memberOf, setMemberOf] = useState("");
  const [estimatedAnnualRevenue, setEstimatedAnnualRevenue] = useState("");
  const [numberOfEmployees, setNumberOfEmployees] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [assignedCsmId, setAssignedCsmId] = useState<string>("none");
  const [showDelete, setShowDelete] = useState(false);

  const { data: teamMembers = [] } = useTeamMembers();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const remove = useDeleteCompany();

  useEffect(() => {
    if (open) {
      setName(company?.name ?? "");
      setDomain(company?.domain ?? "");
      setDomains((company?.domains ?? []).join(", "));
      setStatus(company?.status ?? "none");
      setProductLicensed((company?.productLicensed ?? []).join(", "));
      setMemberOf((company?.memberOf ?? []).join(", "));
      setEstimatedAnnualRevenue(company?.estimatedAnnualRevenue != null ? String(company.estimatedAnnualRevenue) : "");
      setNumberOfEmployees(company?.numberOfEmployees != null ? String(company.numberOfEmployees) : "");
      setIndustry(company?.industry ?? "");
      setSize(company?.size ?? "");
      setWebsite(company?.website ?? "");
      setPhone(company?.phone ?? "");
      setCity(company?.city ?? "");
      setCountry(company?.country ?? "");
      setAssignedCsmId(company?.assignedCsmId ?? "none");
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
      domains: toList(domains),
      status: status === "none" ? undefined : (status as typeof CompanyStatus[keyof typeof CompanyStatus]),
      productLicensed: toList(productLicensed),
      memberOf: toList(memberOf),
      estimatedAnnualRevenue: estimatedAnnualRevenue ? Number(estimatedAnnualRevenue) : undefined,
      numberOfEmployees: numberOfEmployees ? Number(numberOfEmployees) : undefined,
      industry: industry || undefined,
      size: size || undefined,
      website: website || undefined,
      phone: phone || undefined,
      city: city || undefined,
      country: country || undefined,
      assignedCsmId: assignedCsmId === "none" ? undefined : assignedCsmId,
    };
    if (isEdit) {
      const updateData = { ...data, assignedCsmId: assignedCsmId === "none" ? null : assignedCsmId };
      update.mutate({ id: company.id, data: updateData }, {
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
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="No status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No status</SelectItem>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-domains">Additional Domains <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                <Input id="co-domains" value={domains} onChange={e => setDomains(e.target.value)} placeholder="acme.io, acme.net" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-products">Products Licensed <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                <Input id="co-products" value={productLicensed} onChange={e => setProductLicensed(e.target.value)} placeholder="Benchmarks, Insights" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-memberof">Member Of <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                <Input id="co-memberof" value={memberOf} onChange={e => setMemberOf(e.target.value)} placeholder="Group A, Network B" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-revenue">Est. Annual Revenue</Label>
                <Input id="co-revenue" type="number" value={estimatedAnnualRevenue} onChange={e => setEstimatedAnnualRevenue(e.target.value)} placeholder="1000000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-employees">Number of Employees</Label>
                <Input id="co-employees" type="number" value={numberOfEmployees} onChange={e => setNumberOfEmployees(e.target.value)} placeholder="250" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Assigned CSM</Label>
                <Select value={assignedCsmId} onValueChange={setAssignedCsmId}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
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
