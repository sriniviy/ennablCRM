import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomFieldsSettings } from "@/components/custom-fields/custom-fields-settings";

export function SettingsCustomFieldsPage() {
  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/settings"><ChevronLeft className="h-4 w-4 mr-1" /> Settings</Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">Add and manage custom properties for contacts, companies, and deals.</p>
        </div>

        <CustomFieldsSettings />
      </div>
    </SidebarLayout>
  );
}
