import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import { useGetCompany } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Phone, Users, Briefcase, Pencil } from "lucide-react";
import { NotesFeed } from "@/components/notes/notes-feed";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { useTeamMembers } from "@/hooks/use-team-members";

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: company, isLoading } = useGetCompany(id);
  const { data: teamMembers = [] } = useTeamMembers();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-6 md:col-span-1">
              <Skeleton className="h-[300px] w-full" />
            </div>
            <div className="md:col-span-2">
              <Skeleton className="h-[500px] w-full" />
            </div>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (!company) {
    return (
      <SidebarLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Company not found</h2>
          <Button asChild variant="outline">
            <Link href="/companies">Back to companies</Link>
          </Button>
        </div>
      </SidebarLayout>
    );
  }

  const csm = teamMembers.find(m => m.id === company.assignedCsmId);
  const csmName = csm ? (csm.name || csm.email) : null;

  return (
    <>
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
            <Link href="/companies"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                {company.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
                <p className="text-muted-foreground">
                  {company.industry && `${company.industry} • `}
                  {company.size && `${company.size} employees`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column - Info */}
          <div className="space-y-6 md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Company Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {company.domain && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:underline">{company.domain}</a>
                  </div>
                )}
                {company.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a>
                  </div>
                )}
                {(company.address || company.city || company.country) && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      {company.address && <div>{company.address}</div>}
                      <div>{[company.city, company.country].filter(Boolean).join(", ")}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {company.status ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline">{company.status.replace(/_/g, " ")}</Badge>
                  </div>
                ) : null}
                {csmName ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assigned CSM</span>
                    <span className="font-medium">{csmName}</span>
                  </div>
                ) : null}
                {company.estimatedAnnualRevenue != null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Est. Annual Revenue</span>
                    <span className="font-medium">{formatCurrency(company.estimatedAnnualRevenue)}</span>
                  </div>
                ) : null}
                {company.numberOfEmployees != null ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Employees</span>
                    <span className="font-medium">{company.numberOfEmployees}</span>
                  </div>
                ) : null}
                {company.domains && company.domains.length > 0 ? (
                  <div>
                    <span className="text-muted-foreground">Domains</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {company.domains.map(d => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
                    </div>
                  </div>
                ) : null}
                {company.productLicensed && company.productLicensed.length > 0 ? (
                  <div>
                    <span className="text-muted-foreground">Products Licensed</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {company.productLicensed.map(p => <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>)}
                    </div>
                  </div>
                ) : null}
                {company.memberOf && company.memberOf.length > 0 ? (
                  <div>
                    <span className="text-muted-foreground">Member Of</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {company.memberOf.map(m => <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>)}
                    </div>
                  </div>
                ) : null}
                {!company.status && !csmName && company.estimatedAnnualRevenue == null && company.numberOfEmployees == null && !(company.domains?.length) && !(company.productLicensed?.length) && !(company.memberOf?.length) ? (
                  <p className="text-muted-foreground">No additional details.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pipeline Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(company.openPipelineValue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Open pipeline value</p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Tabs */}
          <div className="md:col-span-2">
            <Tabs defaultValue="contacts">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
                <TabsTrigger value="contacts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Contacts ({company.contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="deals" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Deals ({company.deals?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-3 pt-2">
                  Notes
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="contacts" className="pt-6">
                {company.contacts && company.contacts.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {company.contacts.map(contact => (
                      <Card key={contact.id}>
                        <CardContent className="p-4 flex items-start gap-4">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-medium">
                            {contact.firstName[0]}{contact.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              <Link href={`/contacts/${contact.id}`} className="hover:underline text-primary">
                                {contact.firstName} {contact.lastName}
                              </Link>
                            </p>
                            <p className="text-sm text-muted-foreground truncate">{contact.title || "No title"}</p>
                            {contact.email && <p className="text-xs text-muted-foreground truncate mt-1">{contact.email}</p>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No contacts associated with this company.</p>
                )}
              </TabsContent>

              <TabsContent value="deals" className="pt-6">
                {company.deals && company.deals.length > 0 ? (
                  <div className="space-y-4">
                    {company.deals.map(deal => (
                      <Card key={deal.id}>
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="font-medium"><Link href={`/deals`} className="hover:underline text-primary">{deal.title}</Link></p>
                            <p className="text-sm text-muted-foreground mt-1">Stage: {deal.stage.name}</p>
                          </div>
                          <div className="sm:text-right">
                            <p className="font-bold text-lg">{formatCurrency(deal.value || 0)}</p>
                            <p className="text-xs text-muted-foreground">{deal.probability}% probability</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No deals associated with this company.</p>
                )}
              </TabsContent>
              <TabsContent value="notes" className="pt-6">
                <NotesFeed entityType="company" entityId={id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </SidebarLayout>

    {company && (
      <CompanyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={company}
      />
    )}
  </>
  );
}
