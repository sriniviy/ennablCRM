import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { CustomFieldsSettings } from "@/components/custom-fields/custom-fields-settings";

export function SettingsCustomFieldsPage() {
  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">Add and manage custom properties for contacts, companies, and deals.</p>
        </div>

        <CustomFieldsSettings />
      </div>
    </SidebarLayout>
  );
}
