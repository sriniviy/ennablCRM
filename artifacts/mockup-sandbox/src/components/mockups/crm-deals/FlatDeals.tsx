import { LayoutDashboard, Users, Building2, Briefcase, CheckSquare, BarChart2, Settings, Search, Plus, Download, ChevronDown, Bell } from "lucide-react";

const STAGES = [
  { id: "lead", name: "Lead", color: "#6366f1", deals: [
    { id: "d1", title: "Acme Corp – Enterprise License", value: 48000, company: "Acme Corp", prob: 20, owner: "Sarah K." },
    { id: "d2", title: "Brightwave Media Renewal", value: 12500, company: "Brightwave", prob: 30, owner: "James R." },
    { id: "d3", title: "Nordis Group – Starter Plan", value: 3200, company: "Nordis Group", prob: 15, owner: "Sarah K." },
  ]},
  { id: "qualified", name: "Qualified", color: "#3b82f6", deals: [
    { id: "d4", title: "Torchlight SaaS – Pro Tier", value: 29000, company: "Torchlight", prob: 45, owner: "Maria L." },
    { id: "d5", title: "Vanta Systems Expansion", value: 67000, company: "Vanta Systems", prob: 60, owner: "James R." },
  ]},
  { id: "proposal", name: "Proposal", color: "#f59e0b", deals: [
    { id: "d6", title: "Summit Analytics – Annual", value: 95000, company: "Summit Analytics", prob: 70, owner: "Maria L." },
    { id: "d7", title: "Perion Co. Bundle Deal", value: 18400, company: "Perion Co.", prob: 65, owner: "Sarah K." },
    { id: "d8", title: "Helix Labs Pilot", value: 8800, company: "Helix Labs", prob: 55, owner: "James R." },
  ]},
  { id: "negotiation", name: "Negotiation", color: "#f97316", deals: [
    { id: "d9", title: "Cascade Retail – Platform", value: 140000, company: "Cascade Retail", prob: 80, owner: "Maria L." },
  ]},
  { id: "closed", name: "Closed Won", color: "#22c55e", deals: [
    { id: "d10", title: "Skyline Ventures – Full Suite", value: 210000, company: "Skyline Ventures", prob: 100, owner: "Sarah K." },
    { id: "d11", title: "Apex Dynamics Q2", value: 54000, company: "Apex Dynamics", prob: 100, owner: "James R." },
  ]},
];

const NAV = [
  { section: "PIPELINE", items: [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: Briefcase, label: "Deals", active: true },
  ]},
  { section: "RECORDS", items: [
    { icon: Users, label: "Contacts" },
    { icon: Building2, label: "Companies" },
    { icon: CheckSquare, label: "Tasks" },
  ]},
  { section: "INSIGHTS", items: [
    { icon: BarChart2, label: "Reports" },
  ]},
  { section: "ADMIN", items: [
    { icon: Settings, label: "Settings" },
  ]},
];

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function probColor(p: number) {
  if (p >= 80) return { bg: "#dcfce7", text: "#16a34a", border: "#bbf7d0" };
  if (p >= 50) return { bg: "#fef9c3", text: "#ca8a04", border: "#fde68a" };
  return { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" };
}

export function FlatDeals() {
  const totalValue = STAGES.flatMap(s => s.deals).reduce((a, d) => a + d.value, 0);
  const totalDeals = STAGES.flatMap(s => s.deals).length;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, background: "#fff", color: "#111" }}>

      {/* Sidebar */}
      <aside style={{ width: 200, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0, background: "#fafafa" }}>
        {/* Brand */}
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, background: "#6366f1", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>E</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>Ennabl CRM</span>
        </div>

        {/* Search */}
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #e5e7eb", background: "#fff", padding: "5px 8px" }}>
            <Search size={12} color="#9ca3af" />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Search…</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV.map(group => (
            <div key={group.section} style={{ marginBottom: 4 }}>
              <div style={{ padding: "6px 16px 3px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase" }}>
                {group.section}
              </div>
              {group.items.map(item => (
                <div
                  key={item.label}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 16px",
                    background: item.active ? "#ede9fe" : "transparent",
                    borderLeft: item.active ? "2px solid #6366f1" : "2px solid transparent",
                    color: item.active ? "#4f46e5" : "#374151",
                    fontWeight: item.active ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  <item.icon size={13} />
                  <span style={{ fontSize: 12.5 }}>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#4f46e5", flexShrink: 0 }}>SK</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>Sarah K.</div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Admin</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 44, borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" }}>
            <span>Pipeline</span>
            <span style={{ color: "#d1d5db" }}>/</span>
            <span style={{ color: "#111", fontWeight: 600 }}>Deals</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={14} color="#6b7280" />
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#4f46e5" }}>SK</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Deals Pipeline</h1>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>Manage and track your active opportunities.</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}>
                <Download size={12} />
                Export CSV
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid #6366f1", background: "#6366f1", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                <Plus size={12} />
                Add Deal
              </button>
            </div>
          </div>

          {/* Summary stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, border: "1px solid #e5e7eb" }}>
            <div style={{ padding: "8px 12px", borderRight: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 2 }}>Total Value</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4f46e5" }}>{fmt(totalValue)}</div>
            </div>
            <div style={{ padding: "8px 12px", borderRight: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 2 }}>Deals</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{totalDeals}</div>
            </div>
            {STAGES.map((s, i) => (
              <div key={s.id} style={{ padding: "8px 12px", borderRight: i < STAGES.length - 1 ? "1px solid #e5e7eb" : undefined }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                  {s.name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmt(s.deals.reduce((a, d) => a + d.value, 0))}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #e5e7eb", padding: "4px 8px", background: "#fff", fontSize: 12, color: "#374151", cursor: "pointer" }}>
              <span>All stages</span><ChevronDown size={11} color="#9ca3af" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid #e5e7eb", padding: "4px 8px", background: "#fff", fontSize: 12, color: "#374151", cursor: "pointer" }}>
              <span>All owners</span><ChevronDown size={11} color="#9ca3af" />
            </div>
            <div style={{ marginLeft: "auto", display: "flex", border: "1px solid #e5e7eb" }}>
              <button style={{ padding: "4px 10px", fontSize: 12, border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Pipeline</button>
              <button style={{ padding: "4px 10px", fontSize: 12, border: "none", borderLeft: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", cursor: "pointer" }}>Cards</button>
            </div>
          </div>

          {/* Kanban board */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))`, gap: 8, flex: 1, minHeight: 0 }}>
            {STAGES.map(col => (
              <div key={col.id} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                {/* Column header */}
                <div style={{ padding: "6px 10px 6px", borderBottom: "2px solid " + col.color, background: "#fff", border: "1px solid #e5e7eb", borderBottomColor: col.color, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.color, display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>{col.name}</span>
                      <span style={{ fontSize: 10, color: "#9ca3af" }}>({col.deals.length})</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: col.color, paddingLeft: 12 }}>{fmt(col.deals.reduce((a, d) => a + d.value, 0))}</div>
                  </div>
                  <button style={{ border: "1px solid #e5e7eb", background: "#fff", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9ca3af" }}>
                    <Plus size={11} />
                  </button>
                </div>

                {/* Deal cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  {col.deals.map(deal => {
                    const pc = probColor(deal.prob);
                    return (
                      <div
                        key={deal.id}
                        style={{ border: "1px solid #e5e7eb", background: "#fff", padding: "7px 9px", cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = col.color; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb"; }}
                      >
                        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 4, color: "#111" }}>{deal.title}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: col.color, marginBottom: 5 }}>{fmt(deal.value)}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ fontSize: 10.5, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deal.company}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`, flexShrink: 0 }}>
                            {deal.prob}%
                          </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 10, color: "#9ca3af", borderTop: "1px solid #f3f4f6", paddingTop: 4 }}>{deal.owner}</div>
                      </div>
                    );
                  })}

                  {/* Empty drop zone */}
                  {col.deals.length === 0 && (
                    <div style={{ border: "1px dashed #e5e7eb", padding: "16px 10px", textAlign: "center", color: "#d1d5db", fontSize: 11 }}>
                      No deals
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
