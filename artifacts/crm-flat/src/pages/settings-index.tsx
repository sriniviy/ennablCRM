import { Link } from "wouter";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { ChevronRight, Users, SlidersHorizontal, CalendarClock, Sparkles, ScrollText, ArrowDownToLine, Settings, Plug2 } from "lucide-react";

const categories = [
  {
    icon: Users,
    title: "Team",
    description: "Manage team members, roles, and invite new users.",
    href: "/settings/team",
    adminOnly: false,
  },
  {
    icon: SlidersHorizontal,
    title: "Custom Fields",
    description: "Add custom properties to contacts, companies, and deals.",
    href: "/settings/custom-fields",
    adminOnly: true,
  },
  {
    icon: CalendarClock,
    title: "Scheduled Exports",
    description: "Set up automated CSV reports delivered to your inbox.",
    href: "/settings/exports",
    adminOnly: true,
  },
  {
    icon: Sparkles,
    title: "AI Presets",
    description: "Manage shared AI writing presets available to your team.",
    href: "/settings/ai-presets",
    adminOnly: true,
  },
  {
    icon: ScrollText,
    title: "Audit Log",
    description: "Review a full history of changes and activity in the workspace.",
    href: "/settings/audit-log",
    adminOnly: true,
  },
  {
    icon: ArrowDownToLine,
    title: "Import",
    description: "Import contacts and companies from HubSpot or CSV.",
    href: "/settings/import",
    adminOnly: true,
  },
  {
    icon: Plug2,
    title: "Integrations",
    description: "Enable Apollo enrichment, Gmail, AI model selection, and Ennabl Growth.",
    href: "/settings/integrations",
    adminOnly: true,
  },
];

export function SettingsIndexPage() {
  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Configure your workspace and team.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-primary/10 transition-colors">
                <cat.icon className="h-4.5 w-4.5 text-muted-foreground group-hover:text-primary transition-colors" style={{ height: "1.125rem", width: "1.125rem" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{cat.title}</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
