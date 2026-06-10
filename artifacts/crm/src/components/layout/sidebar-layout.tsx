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

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Needs Review", href: "/needs-review", icon: ClipboardCheck },
  { name: "Companies", href: "/companies", icon: Building2 },
  { name: "Deals", href: "/deals", icon: CircleDollarSign },
  { name: "Activities", href: "/activities", icon: Activity },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Campaigns", href: "/campaigns", icon: Mail },
  { name: "Reports", href: "/reports", icon: BarChart2 },
  { name: "HubSpot Import", href: "/admin/migrate", icon: ArrowDownToLine, adminOnly: true },
  { name: "Audit Log", href: "/admin/audit-log", icon: ScrollText, adminOnly: true },
  { name: "Settings", href: "/settings/team", icon: Settings },
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
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
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

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "ADMIN",
  );

  const MobileNavLinks = () => (
    <div className="flex-1 space-y-1">
      {visibleNavItems.map((item) => {
        const isActive = location.startsWith(item.href);
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            data-testid={`nav-${item.name.toLowerCase()}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.name}
            {item.href === "/needs-review" && reviewCount > 0 && (
              <span className="ml-auto bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {reviewCount > 99 ? "99+" : reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  const DesktopNavLinks = () => (
    <div className="flex-1 space-y-1">
      {visibleNavItems.map((item) => {
        const isActive = location.startsWith(item.href);
        const linkClass = `flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        } ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`;

        if (collapsed) {
          return (
            <Tooltip key={item.name} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                  className={linkClass}
                  style={{ height: "36px" }}
                >
                  <span className="relative">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.href === "/needs-review" && reviewCount > 0 && (
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
            {item.href === "/needs-review" && reviewCount > 0 && (
              <span className="ml-auto bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {reviewCount > 99 ? "99+" : reviewCount}
              </span>
            )}
          </Link>
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
          <div className="flex h-full flex-col border-r bg-card px-4 py-6">
            <div className="mb-8 flex items-center gap-2 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold shrink-0">
                M
              </div>
              <span className="text-xl font-bold">MyCRM</span>
            </div>
            <MobileNavLinks />
            <div className="mt-4">
              <GlobalSearch collapsed={false} />
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between border-t">
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
        className={`hidden md:flex flex-col border-r bg-card py-6 transition-all duration-300 ease-in-out shrink-0 ${
          collapsed ? "w-16 px-2" : "w-64 px-4"
        }`}
      >
        {/* Header: logo + title + controls */}
        <div
          className={`mb-8 flex items-center ${
            collapsed ? "flex-col gap-2 px-0" : "gap-2 px-2"
          }`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold shrink-0">
            M
          </div>

          {!collapsed && (
            <>
              <span className="text-xl font-bold tracking-tight flex-1 min-w-0">MyCRM</span>
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
        <div className="mt-auto border-t pt-4">
          {/* User menu */}
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
