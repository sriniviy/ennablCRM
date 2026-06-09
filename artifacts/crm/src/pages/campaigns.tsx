import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useListCampaigns } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Mail } from "lucide-react";

export function CampaignsPage() {
  const { data, isLoading } = useListCampaigns({ page: 1, pageSize: 50 });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SENT": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "SENDING": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "DRAFT": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      case "SCHEDULED": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "CANCELLED": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground">Engage your audience with email campaigns.</p>
          </div>
          <Button asChild data-testid="btn-new-campaign">
            <Link href="/campaigns/new">
              <Plus className="mr-2 h-4 w-4" /> Create Campaign
            </Link>
          </Button>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Click Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2 hover:underline text-primary">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {campaign.name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-normal mt-1">{campaign.subject}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-normal ${getStatusColor(campaign.status)} border-0`}>
                        {campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {campaign.stats.sent.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.stats.sent > 0 ? `${campaign.stats.openRate.toFixed(1)}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {campaign.stats.sent > 0 ? `${campaign.stats.clickRate.toFixed(1)}%` : "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Mail className="h-8 w-8 mb-2 opacity-50" />
                      <p>No campaigns yet.</p>
                      <Button variant="link" asChild className="mt-2">
                        <Link href="/campaigns/new">Create your first campaign</Link>
                      </Button>
                    </div>
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
