import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useParams, Link } from "wouter";
import { useGetCampaign } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MousePointerClick, MailOpen, Users, Mail } from "lucide-react";

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading } = useGetCampaign(id);

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="space-y-6 max-w-5xl mx-auto">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      </SidebarLayout>
    );
  }

  if (!campaign) {
    return (
      <SidebarLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-2">Campaign not found</h2>
          <Button asChild variant="outline">
            <Link href="/campaigns">Back to campaigns</Link>
          </Button>
        </div>
      </SidebarLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SENT": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "SENDING": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "DRAFT": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-3 text-muted-foreground">
            <Link href="/campaigns"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
              <p className="text-muted-foreground mt-1">Subject: {campaign.subject}</p>
            </div>
            <Badge variant="outline" className={`font-normal text-sm px-3 py-1 border-0 ${getStatusColor(campaign.status)}`}>
              {campaign.status}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recipients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Successfully Sent</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{campaign.stats.sent.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
              <MailOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {campaign.stats.sent > 0 ? `${campaign.stats.openRate.toFixed(1)}%` : "0%"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {campaign.stats.opened} unique opens
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {campaign.stats.sent > 0 ? `${campaign.stats.clickRate.toFixed(1)}%` : "0%"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {campaign.stats.clicked} unique clicks
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Email Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md p-4 bg-white text-black min-h-[400px]">
                  <div className="border-b pb-4 mb-4 text-sm space-y-1">
                    <div><span className="font-semibold text-gray-500 w-16 inline-block">From:</span> {campaign.fromName} &lt;{campaign.fromEmail}&gt;</div>
                    <div><span className="font-semibold text-gray-500 w-16 inline-block">Subject:</span> {campaign.subject}</div>
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: campaign.htmlContent || '' }} />
                  {/* Fallback if raw text */}
                  {!campaign.htmlContent && <pre className="whitespace-pre-wrap font-sans">{campaign.textContent || campaign.htmlContent}</pre>}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Created</p>
                  <p className="font-medium">{new Date(campaign.createdAt).toLocaleString()}</p>
                </div>
                {campaign.sentAt && (
                  <div>
                    <p className="text-muted-foreground mb-1">Sent At</p>
                    <p className="font-medium">{new Date(campaign.sentAt).toLocaleString()}</p>
                  </div>
                )}
                {campaign.scheduledAt && !campaign.sentAt && (
                  <div>
                    <p className="text-muted-foreground mb-1">Scheduled For</p>
                    <p className="font-medium">{new Date(campaign.scheduledAt).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
