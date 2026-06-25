import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Receipt } from "lucide-react";

export function InvoicingPage() {
  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoicing</h1>
          <p className="text-muted-foreground">
            Manage and track invoices for your clients.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold text-muted-foreground">Invoicing coming soon</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Invoice creation, tracking, and payment status will be available here.
          </p>
        </div>
      </div>
    </SidebarLayout>
  );
}
