import { Link, useLocation } from "wouter";
import { useGetMe, useListContacts, ReviewStatus } from "@workspace/api-client-react";
import { authClient } from "@/lib/auth-client";
import {
  LayoutDashboard,
  Users,
  Building2,
  CircleDollarSign,
  Activity,
  CheckSquare,
  Mail,
  BarChart2,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ClipboardCheck,
  ArrowDownToLine,
} from "lucide-react";
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
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "WORKSPACE",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "PIPELINE",
    items: [
      { name: "Contacts", href: "/contacts", icon: Users },
      { name: "Needs Review", href: "/needs-review", icon: ClipboardCheck },
      { name: "Companies", href: "/companies", icon: Building2 },
      { name: "Deals", href: "/deals", icon: CircleDollarSign },
    ],
  },
  {
    label: "ACTIVITY",
    items: [
      { name: "Activities", href: "/activities", icon: Activity },
      { name: "Tasks", href: "/tasks", icon: CheckSquare },
      { name: "Campaigns", href: "/campaigns", icon: Mail },
    ],
  },
  {
    label: "INSIGHTS",
    items: [{ name: "Reports", href: "/reports", icon: BarChart2 }],
  },
  {
    label: "ADMIN",
    items: [
      { name: "HubSpot Import", href: "/admin/migrate", icon: ArrowDownToLine, adminOnly: true },
      { name: "Audit Log", href: "/admin/audit-log", icon: ScrollText, adminOnly: true },
    ],
  },
  {
    label: "SETTINGS",
    items: [{ name: "Settings", href: "/settings/team", icon: Settings }],
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

  const MobileNavLinks = () => (
    <div className="flex-1 overflow-y-auto space-y-4">
      {navGroups.map((group) => {
        const visible = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (!visible.length) return null;
        return (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase select-none">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {visible.map((item) => {
                const isActive = location.startsWith(item.href);
                const badge = getBadge(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`nav-${item.name.toLowerCase()}`}
                    className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
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

  const DesktopNavLinks = () => (
    <div className="flex-1 overflow-y-auto space-y-4">
      {navGroups.map((group) => {
        const visible = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (!visible.length) return null;
        return (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase select-none">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mb-1 border-t border-sidebar-border mx-1" />}
            <div className="space-y-0.5">
              {visible.map((item) => {
                const isActive = location.startsWith(item.href);
                const badge = getBadge(item.href);
                const linkClass = `flex items-center rounded py-2 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`;

                if (collapsed) {
                  return (
                    <Tooltip key={item.name} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          data-testid={`nav-${item.name.toLowerCase()}`}
                          className={linkClass}
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

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    data-testid={`nav-${item.name.toLowerCase()}`}
                    className={linkClass}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
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
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar px-4 py-6">
            <div className="mb-6 flex items-center gap-2 px-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-sm shrink-0">
                M
              </div>
              <span className="text-base font-bold tracking-tight">MyCRM</span>
            </div>
            <MobileNavLinks />
            <div className="mt-4">
              <GlobalSearch collapsed={false} />
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between border-t border-sidebar-border">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme}>
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div
        className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar py-5 transition-all duration-200 ease-in-out shrink-0 ${
          collapsed ? "w-14 px-2" : "w-60 px-3"
        }`}
      >
        {/* Header */}
        <div
          className={`mb-5 flex items-center ${
            collapsed ? "flex-col gap-2 px-0" : "gap-2 px-2"
          }`}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-sm shrink-0">
            M
          </div>

          {!collapsed && (
            <>
              <span className="text-base font-bold tracking-tight flex-1 min-w-0">MyCRM</span>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-7 w-7 shrink-0">
                    {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} className="h-7 w-7 shrink-0">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
              </Tooltip>
            </>
          )}

          {collapsed && (
            <>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-7 w-7">
                    {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} className="h-7 w-7">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <DesktopNavLinks />

        {/* Search */}
        <div className="mt-3 mb-1">
          <GlobalSearch collapsed={collapsed} />
        </div>

        {/* Footer: user menu */}
        <div className="mt-auto border-t border-sidebar-border pt-3">
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full ${
                    collapsed
                      ? "justify-center px-0"
                      : "justify-start gap-2 px-2"
                  }`}
                  data-testid="user-menu"
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback>
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-col items-start text-sm overflow-hidden">
                      <span className="font-medium truncate w-32">
                        {user.name || "User"}
                      </span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 md:pt-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
