import { Link, useLocation } from "wouter";
import { useGetMe, useListContacts, ReviewStatus } from "@workspace/api-client-react";
import { authClient } from "@/lib/auth-client";
import {
  LayoutDashboard,
  Users,
  Building2,
  CircleDollarSign,
  CheckSquare,
  Mail,
  BarChart2,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ClipboardCheck,
  Filter,
  SlidersHorizontal,
  Sparkles,
  ScrollText,
  ArrowDownToLine,
  Plug2,
  Bot,
  Phone,
  FileText,
  Megaphone,
  MessageSquare,
} from "lucide-react";
import { EnnablLogo } from "@/components/ennabl-logo";
import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useMyAssignments } from "@/hooks/use-my-assignments";

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  indent?: boolean;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "GENERAL",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Needs Review", href: "/needs-review", icon: ClipboardCheck },
      { name: "Reports", href: "/reports", icon: BarChart2 },
    ],
  },
  {
    label: "RECORDS",
    items: [
      { name: "Companies", href: "/companies", icon: Building2 },
      { name: "Contacts", href: "/contacts", icon: Users },
      { name: "Deals", href: "/deals", icon: CircleDollarSign },
    ],
  },
  {
    label: "ACTIVITIES",
    items: [
      { name: "Calls", href: "/activities?type=CALL", icon: Phone },
      { name: "Emails", href: "/activities?type=EMAIL_SENT", icon: Mail },
      { name: "Notes", href: "/activities?type=NOTE", icon: FileText },
      { name: "Tasks", href: "/tasks", icon: CheckSquare },
    ],
  },
  {
    label: "ENGAGE",
    items: [
      { name: "Campaigns", href: "/campaigns", icon: Megaphone },
      { name: "Segments", href: "/segments", icon: Filter },
    ],
  },
  {
    label: "AUTOMATE",
    items: [
      { name: "Automations", href: "/automations", icon: Bot, adminOnly: true },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { name: "Teams", href: "/settings/team", icon: Users, adminOnly: true },
      { name: "Custom Fields", href: "/settings/custom-fields", icon: SlidersHorizontal, adminOnly: true },
      { name: "AI Presets", href: "/settings/ai-presets", icon: Sparkles, adminOnly: true },
      { name: "Audit Logs", href: "/settings/audit-log", icon: ScrollText, adminOnly: true },
      { name: "Export", href: "/settings/exports", icon: MessageSquare, adminOnly: true },
      { name: "Import", href: "/settings/import", icon: ArrowDownToLine, adminOnly: true },
      { name: "Integrations", href: "/settings/integrations", icon: Plug2, adminOnly: true },
    ],
  },
];

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem("crm-sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { theme, toggle: toggleTheme } = useTheme();
  const { data: reviewData } = useListContacts({
    reviewStatus: ReviewStatus.AUTO_CREATED,
    page: 1,
    pageSize: 1,
  });
  const reviewCount = reviewData?.total ?? 0;
  const { data: assignmentData } = useMyAssignments();
  const myDealCount = assignmentData?.deals ?? 0;
  const myTaskCount = assignmentData?.tasks ?? 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem("crm-sidebar-collapsed", String(collapsed));
    } catch {}
  }, [collapsed]);

  const handleSignOut = async () => {
    await authClient.signOut();
    setLocation("/sign-in");
  };

  const isAdmin = user?.role === "ADMIN";

  const getBadge = (href: string) => {
    if (href === "/needs-review" && reviewCount > 0)
      return { count: reviewCount, cls: "bg-amber-500 text-white" };
    if (href === "/deals" && myDealCount > 0)
      return { count: myDealCount, cls: "bg-primary text-primary-foreground" };
    if (href === "/tasks" && myTaskCount > 0)
      return { count: myTaskCount, cls: "bg-primary text-primary-foreground" };
    return null;
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex-1 overflow-y-auto space-y-3">
      {navGroups.map((group) => {
        const visible = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (!visible.length) return null;
        return (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase select-none">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mb-1 border-t border-sidebar-border mx-1" />}
            <div className="space-y-0.5">
              {visible.map((item) => {
                const itemPath = item.href.split("?")[0];
                const isActive = item.exact
                  ? location === itemPath
                  : location.startsWith(itemPath) && (
                      !item.href.includes("?") ||
                      (typeof window !== "undefined" && window.location.search === "?" + item.href.split("?")[1])
                    );
                const badge = getBadge(item.href);

                if (collapsed) {
                  if (item.indent) return null;
                  return (
                    <Tooltip key={item.name} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          data-testid={`nav-${item.name.toLowerCase()}`}
                          className={`flex items-center justify-center rounded py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent"
                          }`}
                          style={{ height: "34px" }}
                        >
                          <span className="relative">
                            <item.icon className="h-4 w-4 shrink-0" />
                            {badge && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
                            )}
                          </span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.name}</TooltipContent>
                    </Tooltip>
                  );
                }

                if (item.indent) {
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={onNavigate}
                      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                      className={`flex items-center gap-2 rounded py-1 pl-7 pr-3 text-xs font-medium transition-colors ${
                        isActive
                          ? "text-primary bg-primary/8"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <item.icon className="h-3 w-3 shrink-0" />
                      {item.name}
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onNavigate}
                    data-testid={`nav-${item.name.toLowerCase()}`}
                    className={`flex items-center gap-2.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary pl-[10px]"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-2 border-transparent pl-[10px]"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    {item.name}
                    {badge && (
                      <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badge.cls}`}>
                        {badge.count > 99 ? "99+" : badge.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden absolute top-4 left-4 z-50"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-56 p-0">
          <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
            {/* Brand */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-sidebar-border">
              <EnnablLogo collapsed={false} />
            </div>
            {/* Search */}
            <div className="px-3 py-2 border-b border-sidebar-border">
              <GlobalSearch collapsed={false} />
            </div>
            {/* Nav */}
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            {/* User footer */}
            <div className="border-t border-sidebar-border p-3">
              {user && (
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full text-left text-sm text-sidebar-foreground hover:text-destructive"
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-bold">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-xs">{user.name || "User"}</div>
                    <div className="text-[10px] text-muted-foreground truncate capitalize">{user.role?.toLowerCase() ?? ""}</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div
        className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out shrink-0 ${
          collapsed ? "w-14" : "w-52"
        }`}
      >
        {/* Brand row */}
        <div className={`flex items-center border-b border-sidebar-border ${collapsed ? "px-2 py-3 flex-col gap-1" : "px-4 py-3 gap-2"}`}>
          <EnnablLogo collapsed={collapsed} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1" />
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-6 w-6 shrink-0">
                    {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-6 w-6 shrink-0">
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Collapse</TooltipContent>
              </Tooltip>
            </>
          )}
          {collapsed && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="h-6 w-6">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Search — just below brand */}
        {!collapsed && (
          <div className="px-3 py-2 border-b border-sidebar-border">
            <GlobalSearch collapsed={false} />
          </div>
        )}

        {/* Nav */}
        <div className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-2"}`}>
          <NavLinks />
        </div>

        {/* Footer: theme toggle (collapsed) + user */}
        <div className="border-t border-sidebar-border">
          {collapsed && (
            <div className="flex justify-center py-2">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-7 w-7">
                    {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
            </div>
          )}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full rounded-none py-3 h-auto ${collapsed ? "justify-center px-0" : "justify-start gap-2 px-4"}`}
                  data-testid="user-menu"
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-bold">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                      <span className="text-xs font-semibold truncate">{user.name || "User"}</span>
                      {user.role && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded-sm bg-primary/10 text-primary leading-none">
                          {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                        </span>
                      )}
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive cursor-pointer"
                  data-testid="button-signout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pt-16 md:pt-6">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
