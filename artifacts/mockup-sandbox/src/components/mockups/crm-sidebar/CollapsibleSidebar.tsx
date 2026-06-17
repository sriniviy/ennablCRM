import { useState } from "react";
import {
  LayoutDashboard, Users, Building2, CircleDollarSign, CheckSquare,
  Mail, BarChart2, Phone, FileText, Megaphone, Filter, Bot,
  SlidersHorizontal, Sparkles, ScrollText, ArrowDownToLine,
  Plug2, MessageSquare, ClipboardCheck, ChevronDown, Search,
} from "lucide-react";

const ORANGE = "#FA5F0C";
const NAVY = "#0F1E2E";

type NavItem = { name: string; icon: React.ElementType; active?: boolean; badge?: number };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "GENERAL",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Needs Review", icon: ClipboardCheck, badge: 4 },
      { name: "Reports", icon: BarChart2 },
    ],
  },
  {
    label: "RECORDS",
    items: [
      { name: "Companies", icon: Building2 },
      { name: "Contacts", icon: Users },
      { name: "Deals", icon: CircleDollarSign, badge: 7 },
    ],
  },
  {
    label: "ACTIVITIES",
    items: [
      { name: "Calls", icon: Phone },
      { name: "Emails", icon: Mail },
      { name: "Notes", icon: FileText },
      { name: "Tasks", icon: CheckSquare, badge: 2 },
    ],
  },
  {
    label: "ENGAGE",
    items: [
      { name: "Campaigns", icon: Megaphone },
      { name: "Segments", icon: Filter },
    ],
  },
  {
    label: "AUTOMATE",
    items: [
      { name: "Automations", icon: Bot, active: true },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { name: "Teams", icon: Users },
      { name: "Custom Fields", icon: SlidersHorizontal },
      { name: "AI Presets", icon: Sparkles },
      { name: "Audit Logs", icon: ScrollText },
      { name: "Export", icon: MessageSquare },
      { name: "Import", icon: ArrowDownToLine },
      { name: "Integrations", icon: Plug2 },
    ],
  },
];

export function CollapsibleSidebar() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    RECORDS: true,
    ACTIVITIES: true,
    ENGAGE: true,
    AUTOMATE: true,
    SETTINGS: true,
  });

  const toggle = (label: string) =>
    setCollapsed((p) => ({ ...p, [label]: !p[label] }));

  return (
    <div className="flex min-h-screen bg-[#0F1E2E]/5 items-start justify-center p-10">
      {/* Two sidebars side by side for comparison */}
      <div className="flex gap-10 items-start">

        {/* BEFORE: current sidebar (no section collapse) */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <p className="text-xs font-semibold text-center mb-3" style={{ color: NAVY, opacity: 0.5, letterSpacing: "0.08em" }}>CURRENT</p>
          <div
            className="flex flex-col rounded-xl overflow-hidden shadow-2xl"
            style={{ width: 208, background: NAVY, minHeight: 580 }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <svg viewBox="0 38 180 168" style={{ height: 24, width: 24, color: "white" }} fill="currentColor">
                <path d="M90 38 L160 80 L160 164 L90 206 L20 164 L20 80 Z" fill={ORANGE} opacity="0.9" />
                <text x="90" y="142" textAnchor="middle" fontSize="52" fontWeight="bold" fill="white" fontFamily="sans-serif">e</text>
              </svg>
              <span className="font-bold text-white text-sm tracking-tight">ennabl</span>
            </div>
            {/* Search */}
            <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                <Search style={{ height: 11, width: 11 }} />
                Search…
                <span className="ml-auto text-[9px] px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>⌘K</span>
              </div>
            </div>
            {/* Nav — no collapse */}
            <div className="flex-1 px-2 py-3 space-y-3 overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 mb-0.5 text-[9px] font-semibold tracking-widest uppercase select-none" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {group.label}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {group.items.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center gap-2.5 rounded px-3 py-1.5 text-xs font-medium"
                        style={{
                          color: item.active ? "#fff" : "rgba(255,255,255,0.65)",
                          background: item.active ? `${ORANGE}22` : "transparent",
                          borderLeft: `2px solid ${item.active ? ORANGE : "transparent"}`,
                          paddingLeft: 10,
                        }}
                      >
                        <item.icon style={{ height: 13, width: 13, flexShrink: 0 }} />
                        {item.name}
                        {item.badge && (
                          <span className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: item.name === "Needs Review" ? "#F59E0B" : ORANGE, color: "white" }}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* User footer */}
            <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: ORANGE }}>V</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">Vijay Srinivasan</div>
                <div className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>Admin</div>
              </div>
            </div>
          </div>
        </div>

        {/* AFTER: collapsible section headers */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <p className="text-xs font-semibold text-center mb-3" style={{ color: NAVY, letterSpacing: "0.08em" }}>
            WITH COLLAPSIBLE SECTIONS
          </p>
          <div
            className="flex flex-col rounded-xl overflow-hidden shadow-2xl"
            style={{ width: 208, background: NAVY, minHeight: 580 }}
          >
            {/* Brand */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <svg viewBox="0 38 180 168" style={{ height: 24, width: 24, color: "white" }} fill="currentColor">
                <path d="M90 38 L160 80 L160 164 L90 206 L20 164 L20 80 Z" fill={ORANGE} opacity="0.9" />
                <text x="90" y="142" textAnchor="middle" fontSize="52" fontWeight="bold" fill="white" fontFamily="sans-serif">e</text>
              </svg>
              <span className="font-bold text-white text-sm tracking-tight">ennabl</span>
            </div>
            {/* Search */}
            <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                <Search style={{ height: 11, width: 11 }} />
                Search…
                <span className="ml-auto text-[9px] px-1 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>⌘K</span>
              </div>
            </div>
            {/* Nav — collapsible */}
            <div className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
              {navGroups.map((group) => {
                const isCollapsed = collapsed[group.label] ?? false;
                return (
                  <div key={group.label}>
                    {/* Clickable section header */}
                    <button
                      onClick={() => toggle(group.label)}
                      className="w-full flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="flex-1 flex items-center gap-1.5">
                        <div style={{ height: 1, width: 10, background: ORANGE, flexShrink: 0 }} />
                        <span className="text-[9px] font-semibold tracking-widest uppercase select-none" style={{ color: "rgba(255,255,255,0.45)" }}>
                          {group.label}
                        </span>
                      </div>
                      <ChevronDown
                        style={{
                          height: 10,
                          width: 10,
                          color: "rgba(255,255,255,0.3)",
                          flexShrink: 0,
                          transition: "transform 0.2s",
                          transform: isCollapsed ? "rotate(0deg)" : "rotate(-180deg)",
                        }}
                      />
                    </button>

                    {/* Items (hidden when collapsed) */}
                    {!isCollapsed && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                        {group.items.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center gap-2.5 rounded text-xs font-medium"
                            style={{
                              color: item.active ? "#fff" : "rgba(255,255,255,0.65)",
                              background: item.active ? `${ORANGE}22` : "transparent",
                              borderLeft: `2px solid ${item.active ? ORANGE : "transparent"}`,
                              padding: "5px 12px 5px 10px",
                            }}
                          >
                            <item.icon style={{ height: 13, width: 13, flexShrink: 0 }} />
                            {item.name}
                            {item.badge && (
                              <span className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: item.name === "Needs Review" ? "#F59E0B" : ORANGE, color: "white" }}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* User footer */}
            <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: ORANGE }}>V</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">Vijay Srinivasan</div>
                <div className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>Admin</div>
              </div>
            </div>
          </div>
          <p className="text-center text-[10px]" style={{ color: "rgba(0,0,0,0.35)", marginTop: 4 }}>click any section header to toggle</p>
        </div>

      </div>
    </div>
  );
}
