import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";
import {
  useCreateCompany, useUpdateCompany, useDeleteCompany, useGetMe,
  getListCompaniesQueryKey, getGetCompanyQueryKey,
  CompanyStatus, type Company,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTeamMembers } from "@/hooks/use-team-members";
import { CustomFieldsForm } from "@/components/custom-fields/custom-fields-form";
import { useCustomFieldValues, useSaveCustomFieldValuesForRecord } from "@/hooks/use-custom-fields";

const STATUSES = Object.values(CompanyStatus);
const toList = (s: string) => s.split(",").map(v => v.trim()).filter(Boolean);

const DEFAULT_MEMBER_OF = [
  "Acrisure",
  "Afore",
  "ALKEME",
  "Alera",
  "Alliant",
  "Applied Reference Client",
  "Association of Risk Managers Northwest",
  "Assurex",
  "BIGN",
  "BroadStreet",
  "CIAB",
  "Fortified",
  "Gallagher",
  "HUB",
  "HighStreet",
  "InCite",
  "Insurors Group",
  "Intersure",
  "Iroquois Group",
  "ISU",
  "Keystone",
  "Marsh/MMA",
  "MarshBerry Connect",
  "New Demos Challenge 26",
  "Outmarket Customer",
  "PacWest",
  "Patriot",
  "Reagan Survey",
  "RiskProNet",
  "Top 100 Target List",
  "USI",
  "Vertafore Reference Customer",
];

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
  const [memberOf, setMemberOf] = useState<string[]>([]);
  const [memberOfOpen, setMemberOfOpen] = useState(false);
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
  const [cfValues, setCfValues] = useState<Record<string, string | null>>({});

  const { data: teamMembers = [] } = useTeamMembers();
  const getToken = useSessionToken();
  const { data: memberOfData } = useQuery<{ options: string[] }>({
    queryKey: ["settings", "member-of"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/settings/member-of", { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    staleTime: 60_000,
  });
  const memberOfOptions = memberOfData?.options ?? DEFAULT_MEMBER_OF;
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const remove = useDeleteCompany();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: existingCf } = useCustomFieldValues("company", company?.id);
  const saveCf = useSaveCustomFieldValuesForRecord("company");

  useEffect(() => {
    if (open) {
      setName(company?.name ?? "");
      setDomain(company?.domain ?? "");
      setDomains((company?.domains ?? []).join(", "));
      setStatus(company?.status ?? "none");
      setProductLicensed((company?.productLicensed ?? []).join(", "));
      setMemberOf(company?.memberOf ?? []);
      setEstimatedAnnualRevenue(company?.estimatedAnnualRevenue != null ? String(company.estimatedAnnualRevenue) : "");
      setNumberOfEmployees(company?.numberOfEmployees != null ? String(company.numberOfEmployees) : "");
      setIndustry(company?.industry ?? "");
      setSize(company?.size ?? "");
      setWebsite(company?.website ?? "");
      setPhone(company?.phone ?? "");
      setCity(company?.city ?? "");
      setCountry(company?.country ?? "");
      setAssignedCsmId(company?.assignedCsmId ?? "none");
      if (!company) setCfValues({});
    }
  }, [open, company]);

  useEffect(() => {
    if (open && existingCf) {
      const map: Record<string, string | null> = {};
      for (const f of existingCf) map[f.id] = f.value;
      setCfValues(map);
    }
  }, [open, existingCf]);

  const persistCf = (recordId: string) => {
    const values = Object.entries(cfValues).map(([fieldId, value]) => ({ fieldId, value }));
    if (values.length === 0) return Promise.resolve();
    return saveCf.mutateAsync({ recordId, values }).catch(() => undefined);
  };

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
      memberOf: memberOf,
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
        onSuccess: async () => { await persistCf(company.id); toast({ title: "Company updated" }); invalidate(); onOpenChange(false); },
        onError: () => toast({ title: "Error", description: "Failed to update company", variant: "destructive" }),
      });
    } else {
      create.mutate({ data }, {
        onSuccess: async (created) => { await persistCf(created.id); toast({ title: "Company created" }); invalidate(); onOpenChange(false); },
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
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] !flex !flex-col p-0 overflow-visible">
          <DialogHeader className="px-6 pt-6 shrink-0">
            <DialogTitle>{isEdit ? "Edit Company" : "New Company"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4 pt-2">

              {/* Identity */}
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

              {/* Classification */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t border-border pt-3">Classification</p>
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
                  <Label>Account Owner</Label>
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
                  <Label htmlFor="co-revenue">Est. Annual Revenue</Label>
                  <Input id="co-revenue" type="number" value={estimatedAnnualRevenue} onChange={e => setEstimatedAnnualRevenue(e.target.value)} placeholder="1000000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-employees">Number of Employees</Label>
                  <Input id="co-employees" type="number" value={numberOfEmployees} onChange={e => setNumberOfEmployees(e.target.value)} placeholder="250" />
                </div>
              </div>

              {/* Location & Contact */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t border-border pt-3">Location & Contact</p>
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

              {/* Network & Products */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t border-border pt-3">Network & Products</p>
              <div className="space-y-1.5">
                <Label>Member Of</Label>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    onClick={() => setMemberOfOpen(o => !o)}
                  >
                    {memberOf.length > 0 ? `${memberOf.length} selected` : "Select networks…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  {memberOfOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMemberOfOpen(false)} />
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-md">
                        <Command>
                          <CommandInput placeholder="Search networks…" />
                          <CommandList>
                            <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">No matches.</CommandEmpty>
                            <CommandGroup>
                              {memberOfOptions.map(opt => (
                                <CommandItem
                                  key={opt}
                                  value={opt}
                                  onSelect={() =>
                                    setMemberOf(prev =>
                                      prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt]
                                    )
                                  }
                                >
                                  <Check className={`mr-2 h-4 w-4 ${memberOf.includes(opt) ? "opacity-100" : "opacity-0"}`} />
                                  {opt}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>
                    </>
                  )}
                </div>
                {memberOf.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {memberOf.map(m => (
                      <span key={m} className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs">
                        {m}
                        <button
                          type="button"
                          onClick={() => setMemberOf(prev => prev.filter(v => v !== m))}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="co-products">Products Licensed <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input id="co-products" value={productLicensed} onChange={e => setProductLicensed(e.target.value)} placeholder="Benchmarks, Insights" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-domains">Additional Domains <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input id="co-domains" value={domains} onChange={e => setDomains(e.target.value)} placeholder="acme.io, acme.net" />
                </div>
              </div>

              <CustomFieldsForm objectType="company" values={cfValues} onChange={(id, v) => setCfValues(p => ({ ...p, [id]: v }))} />
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
              {isEdit && isAdmin && (
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
