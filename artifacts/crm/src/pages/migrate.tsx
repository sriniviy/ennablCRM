import { useState, useRef, useEffect } from "react";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, CheckCircle2, AlertCircle, ChevronRight, Download, ArrowRight, SkipForward } from "lucide-react";
import { useSessionToken } from "@/hooks/use-session-token";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── types ──────────────────────────────────────────────────────────────────────

type MigrateStep = "companies" | "contacts" | "deals" | "activities" | "summary";

const STEPS: { id: MigrateStep; label: string; description: string }[] = [
  { id: "companies", label: "Companies", description: "Import company accounts" },
  { id: "contacts", label: "Contacts", description: "Import people & associates" },
  { id: "deals", label: "Deals", description: "Import pipeline deals" },
  { id: "activities", label: "Activities", description: "Import calls, emails & notes" },
  { id: "summary", label: "Summary", description: "Review migration results" },
];

interface FieldDef { key: string; label: string; required?: boolean; hint?: string }

const COMPANY_FIELDS: FieldDef[] = [
  { key: "name", label: "Company Name", required: true },
  { key: "domain", label: "Domain / Website" },
  { key: "industry", label: "Industry" },
  { key: "size", label: "Size" },
  { key: "website", label: "Website URL" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "owner", label: "Owner (assign to user)", hint: "HubSpot owner column — mapped to a CRM user below" },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Job Title" },
  { key: "notes", label: "Notes" },
  { key: "linkedIn", label: "LinkedIn URL" },
  { key: "owner", label: "Owner (assign to user)", hint: "HubSpot owner column — mapped to a CRM user below" },
  { key: "__hubCompanyId", label: "Company by Record ID", hint: "HubSpot company ID column for linking contacts → companies" },
  { key: "__companyName", label: "Company by exact name", hint: "Company name column — matched to an existing company by exact name" },
];

const DEAL_FIELDS: FieldDef[] = [
  { key: "title", label: "Deal Title", required: true },
  { key: "value", label: "Deal Value ($)" },
  { key: "probability", label: "Probability (%)" },
  { key: "closeDate", label: "Close Date" },
  { key: "notes", label: "Notes" },
  { key: "owner", label: "Owner (assign to user)", hint: "HubSpot owner column — mapped to a CRM user below" },
  { key: "__hubStage", label: "Pipeline Stage (HubSpot name)", hint: "Maps HubSpot stage names to your stages below" },
  { key: "__hubContactId", label: "Contact by Record ID", hint: "HubSpot contact ID column for linking deals → contacts" },
  { key: "__contactEmail", label: "Contact by exact email", hint: "Contact email column — matched to an existing contact by exact email" },
  { key: "__hubCompanyId", label: "Company by Record ID", hint: "HubSpot company ID column for linking deals → companies" },
  { key: "__companyName", label: "Company by exact name", hint: "Company name column — matched to an existing company by exact name" },
];

const ACTIVITY_FIELDS: FieldDef[] = [
  { key: "type", label: "Activity Type", hint: "call / email / note / meeting / task" },
  { key: "title", label: "Title / Subject", required: true },
  { key: "description", label: "Description / Body" },
  { key: "date", label: "Date" },
  { key: "emailSubject", label: "Email Subject" },
  { key: "emailBody", label: "Email Body" },
  { key: "owner", label: "Owner (logged as user)", hint: "HubSpot owner column — mapped to a CRM user below" },
  { key: "__hubContactId", label: "Contact by Record ID" },
  { key: "__contactEmail", label: "Contact by exact email" },
  { key: "__hubCompanyId", label: "Company by Record ID" },
  { key: "__companyName", label: "Company by exact name" },
  { key: "__hubDealId", label: "Deal by Record ID" },
  { key: "__dealTitle", label: "Deal by exact title" },
];

const FIELDS_FOR_STEP: Record<Exclude<MigrateStep, "summary">, FieldDef[]> = {
  companies: COMPANY_FIELDS,
  contacts: CONTACT_FIELDS,
  deals: DEAL_FIELDS,
  activities: ACTIVITY_FIELDS,
};

const HUB_ID_HINT: Record<Exclude<MigrateStep, "summary">, string> = {
  companies: "HubSpot company ID column (used to link contacts & deals to this company)",
  contacts: "HubSpot contact ID column (used to link deals & activities to this contact)",
  deals: "HubSpot deal ID column (used to link activities to this deal)",
  activities: "",
};

interface RowIssue { row: number; reason: string }
interface StepResult {
  received: number;
  imported: number;
  skipped: RowIssue[];
  warnings: RowIssue[];
  idMap: Record<string, string>;
}

interface CrmUser { id: string; name: string; email: string }
interface CrmStage { id: string; name: string }

// ── CSV parser ─────────────────────────────────────────────────────────────────

function parseCSV(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const parseRow = (line: string): string[] => {
    const res: string[] = [];
    let inQ = false; let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { res.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    res.push(cur.trim());
    return res;
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = parseRow(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}

// ── auto-mapping ───────────────────────────────────────────────────────────────

function autoMap(headers: string[], step: Exclude<MigrateStep, "summary">): Record<string, string> {
  const mapping: Record<string, string> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, "");
  const matchers: Record<string, string[]> = {
    // companies
    name: ["name", "companyname", "company", "account", "accountname"],
    domain: ["domain", "emaildomain", "companydomain"],
    industry: ["industry", "sector"],
    size: ["size", "companysize", "employees", "headcount"],
    website: ["website", "url", "websiteurl", "companyurl"],
    phone: ["phone", "phonenumber", "tel", "telephone", "mobile"],
    address: ["address", "streetaddress", "street"],
    city: ["city", "town"],
    country: ["country", "countrycode"],
    // contacts
    firstName: ["firstname", "first", "givenname"],
    lastName: ["lastname", "last", "surname", "familyname"],
    email: ["email", "emailaddress", "e-mail"],
    title: ["title", "jobtitle", "position", "role"],
    notes: ["notes", "description", "memo"],
    linkedIn: ["linkedin", "linkedinurl", "linkedinprofile"],
    // owner + associations by name
    owner: ["owner", "dealowner", "contactowner", "companyowner", "hubspotowner", "ownername", "assignedto", "assignee"],
    __companyName: ["associatedcompany", "associatedcompanyname", "companyname", "primarycompany"],
    __contactEmail: ["associatedcontact", "primarycontact", "contactemail", "primarycontactemail"],
    __dealTitle: ["associateddeal", "dealname", "associateddealname"],
    // deals
    value: ["amount", "dealamount", "value", "dealvalue", "revenue"],
    probability: ["probability", "closeprobability", "winprobability"],
    closeDate: ["closedate", "expectedclosedate", "closeddate", "duedate"],
    __hubStage: ["dealstage", "stage", "pipelinestage", "stagename"],
    // activities
    type: ["type", "activitytype", "engagementtype", "kind"],
    description: ["description", "body", "notes", "content", "activitybody"],
    date: ["date", "activitydate", "timestamp", "createdate"],
    emailSubject: ["subject", "emailsubject"],
    emailBody: ["body", "emailbody", "htmlbody"],
  };

  const fields = FIELDS_FOR_STEP[step];
  headers.forEach(h => {
    const n = norm(h);
    for (const field of fields) {
      const patterns = matchers[field.key] ?? [field.key.toLowerCase()];
      if (patterns.some(p => n === p || n.includes(p))) {
        if (!Object.values(mapping).includes(field.key)) {
          mapping[h] = field.key;
          return;
        }
      }
    }
    // HubSpot ID field detection
    if (n === "recordid" || n === "hubspotid" || n === "hs_object_id" || n === "id") {
      if (!mapping["__hubId"]) mapping[h] = "__hubId";
    }
  });
  return mapping;
}

// ── component ──────────────────────────────────────────────────────────────────

export function MigratePage() {
  const getToken = useSessionToken();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState<MigrateStep>("companies");
  const [results, setResults] = useState<Partial<Record<Exclude<MigrateStep, "summary">, StepResult>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // reference data for owner / stage mapping
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);

  // per-step state
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [hubIdField, setHubIdField] = useState<string>("");
  const [ownerMapping, setOwnerMapping] = useState<Record<string, string>>({});
  const [stageMapping, setStageMapping] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"upload" | "map" | "importing" | "done">("upload");
  const [progress, setProgress] = useState(0);
  const [stepResult, setStepResult] = useState<StepResult | null>(null);

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const isLastDataStep = currentStep === "activities";

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const headersInit = { Authorization: `Bearer ${token}` };
        const [teamRes, stageRes] = await Promise.all([
          fetch(`${BASE}/api/team`, { headers: headersInit }),
          fetch(`${BASE}/api/migrate/stages`, { headers: headersInit }),
        ]);
        if (teamRes.ok) {
          const data = await teamRes.json() as { members?: CrmUser[] };
          setUsers(data.members ?? []);
        }
        if (stageRes.ok) setStages(await stageRes.json() as CrmStage[]);
      } catch {
        // non-fatal — mapping UIs degrade to manual matching by name
      }
    })();
  }, [getToken]);

  function resetStep() {
    setHeaders([]); setRows([]); setMapping({}); setHubIdField("");
    setOwnerMapping({}); setStageMapping({});
    setPhase("upload"); setProgress(0); setStepResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function goTo(step: MigrateStep) {
    resetStep();
    setCurrentStep(step);
  }

  // distinct non-empty values in the column mapped to a logical field
  function distinctValuesFor(field: string): string[] {
    const col = Object.keys(mapping).find(k => mapping[k] === field);
    if (!col) return [];
    const seen = new Set<string>();
    for (const r of rows) {
      const v = r[col]?.trim();
      if (v) seen.add(v);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  const ownerValues = distinctValuesFor("owner");
  const stageValues = currentStep === "deals" ? distinctValuesFor("__hubStage") : [];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed || parsed.rows.length === 0) {
        toast({ title: "Invalid CSV", description: "File must have a header row and data rows.", variant: "destructive" });
        return;
      }
      const step = currentStep as Exclude<MigrateStep, "summary">;
      const auto = autoMap(parsed.headers, step);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(auto);
      setOwnerMapping({});
      setStageMapping({});
      // detect hub ID field
      const hubKey = Object.keys(auto).find(k => auto[k] === "__hubId") ?? "";
      setHubIdField(hubKey);
      setPhase("map");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (currentStep === "summary") return;
    const step = currentStep as Exclude<MigrateStep, "summary">;
    const activeMapping: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field && field !== "skip" && field !== "__hubId") activeMapping[col] = field;
    }

    setPhase("importing");
    setProgress(10);

    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        rows,
        mapping: activeMapping,
        hubspotIdField: hubIdField || undefined,
      };

      if (ownerValues.length > 0 && Object.keys(ownerMapping).length > 0) {
        body.ownerMapping = ownerMapping;
      }
      if (step === "deals" && Object.keys(stageMapping).length > 0) {
        body.stageMapping = stageMapping;
      }

      // pass previously built ID maps for association resolution
      if (step === "contacts" && results.companies?.idMap) body.companyIdMap = results.companies.idMap;
      if (step === "deals") {
        if (results.contacts?.idMap) body.contactIdMap = results.contacts.idMap;
        if (results.companies?.idMap) body.companyIdMap = results.companies.idMap;
      }
      if (step === "activities") {
        if (results.contacts?.idMap) body.contactIdMap = results.contacts.idMap;
        if (results.companies?.idMap) body.companyIdMap = results.companies.idMap;
        if (results.deals?.idMap) body.dealIdMap = results.deals.idMap;
      }

      setProgress(40);
      const res = await fetch(`${BASE}/api/migrate/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      setProgress(90);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Import failed");
      }

      const data = await res.json() as StepResult;
      setProgress(100);
      setStepResult(data);
      setResults(prev => ({ ...prev, [step]: data }));
      setPhase("done");
    } catch (err) {
      setPhase("map");
      setProgress(0);
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Something went wrong", variant: "destructive" });
    }
  }

  function downloadReconciliation() {
    const objects = ["companies", "contacts", "deals", "activities"] as const;
    const lines: string[] = [];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    lines.push("HubSpot Migration — Reconciliation Report");
    lines.push("");
    lines.push(["Object", "Source rows", "Imported", "Skipped", "Unmatched links"].map(esc).join(","));
    for (const step of objects) {
      const r = results[step];
      if (!r) {
        lines.push([step, "—", "not run", "—", "—"].map(esc).join(","));
        continue;
      }
      lines.push([step, r.received, r.imported, r.skipped.length, r.warnings.length].map(esc).join(","));
    }

    lines.push("");
    lines.push(["Object", "Row", "Type", "Reason"].map(esc).join(","));
    for (const step of objects) {
      const r = results[step];
      if (!r) continue;
      for (const s of r.skipped) lines.push([step, s.row, "skipped", s.reason].map(esc).join(","));
      for (const w of r.warnings) lines.push([step, w.row, "unmatched", w.reason].map(esc).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hubspot-reconciliation-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const currentStepDef = STEPS.find(s => s.id === currentStep)!;
  const fields = currentStep !== "summary" ? FIELDS_FOR_STEP[currentStep] : [];
  const hasResults = (["companies", "contacts", "deals", "activities"] as const).some(s => results[s]);

  return (
    <SidebarLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">HubSpot Migration</h1>
          <p className="text-muted-foreground mt-1">Import your data from HubSpot in four steps. Each step's IDs are automatically used to link records in the next step.</p>
        </div>

        {/* Step progress bar */}
        <div className="flex items-center gap-0">
          {STEPS.map((step, i) => {
            const done = results[step.id as Exclude<MigrateStep, "summary">] !== undefined || step.id === "summary";
            const active = step.id === currentStep;
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => goTo(step.id)}
                  className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-colors min-w-0 ${active ? "bg-primary/10 text-primary" : done && step.id !== "summary" ? "text-green-600 hover:bg-muted/50 cursor-pointer" : "text-muted-foreground hover:bg-muted/30 cursor-pointer"}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${active ? "border-primary bg-primary text-primary-foreground" : done && step.id !== "summary" ? "border-green-500 bg-green-50 text-green-700" : "border-muted-foreground/30 bg-background"}`}>
                    {done && step.id !== "summary" ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-xs font-medium truncate">{step.label}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mx-1" />}
              </div>
            );
          })}
        </div>

        {/* Summary step */}
        {currentStep === "summary" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Migration Complete</h2>
              {hasResults && (
                <Button variant="outline" size="sm" onClick={downloadReconciliation}>
                  <Download className="h-4 w-4 mr-1" />Download reconciliation report
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(["companies", "contacts", "deals", "activities"] as const).map(step => {
                const r = results[step];
                return (
                  <div key={step} className="border rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium capitalize text-muted-foreground">{step}</p>
                    {r ? (
                      <>
                        <p className="text-2xl font-bold text-green-600">{r.imported}<span className="text-sm font-normal text-muted-foreground"> / {r.received}</span></p>
                        <p className="text-xs text-muted-foreground">imported of source rows</p>
                        {r.skipped.length > 0 && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-amber-600">{r.skipped.length} skipped</span>
                          </div>
                        )}
                        {r.warnings.length > 0 && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-orange-500" />
                            <span className="text-xs text-orange-600">{r.warnings.length} unmatched links</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Skipped</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-medium">Issues by step</h3>
              {(["companies", "contacts", "deals", "activities"] as const).map(step => {
                const r = results[step];
                const issues = r ? [...r.skipped.map(s => ({ ...s, kind: "skipped" as const })), ...r.warnings.map(w => ({ ...w, kind: "unmatched" as const }))] : [];
                if (issues.length === 0) return null;
                return (
                  <div key={step} className="space-y-1">
                    <span className="text-sm font-medium capitalize">{step} ({issues.length} issues)</span>
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {issues.slice(0, 20).map((s, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          Row {s.row} <span className={s.kind === "skipped" ? "text-amber-600" : "text-orange-600"}>[{s.kind}]</span>: {s.reason}
                        </p>
                      ))}
                      {issues.length > 20 && <p className="text-xs text-muted-foreground">…and {issues.length - 20} more (see report)</p>}
                    </div>
                  </div>
                );
              })}
              {!(["companies", "contacts", "deals", "activities"] as const).some(s => results[s] && (results[s]!.skipped.length || results[s]!.warnings.length)) && (
                <p className="text-sm text-muted-foreground">No issues — every row imported and linked cleanly!</p>
              )}
            </div>

            <Button onClick={() => { setResults({}); goTo("companies"); }}>Start New Migration</Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 border-b px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{currentStepDef.label}</h2>
                <p className="text-sm text-muted-foreground">{currentStepDef.description}</p>
              </div>
              {phase === "upload" && (
                <Button variant="outline" size="sm" onClick={() => {
                  if (currentStep === "activities") goTo("summary");
                  else {
                    const next = STEPS[stepIndex + 1];
                    if (next) goTo(next.id);
                  }
                }}>
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip this step
                </Button>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* UPLOAD */}
              {phase === "upload" && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 gap-3 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Upload your HubSpot {currentStepDef.label} CSV</p>
                    <p className="text-sm text-muted-foreground mt-1">Export from HubSpot → Objects → {currentStepDef.label} → Export view</p>
                  </div>
                  <Button onClick={() => fileRef.current?.click()}>Choose file</Button>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
                </div>
              )}

              {/* MAP */}
              {phase === "map" && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{rows.length} rows detected. Map your CSV columns to CRM fields below.</p>
                    <Button variant="ghost" size="sm" onClick={resetStep}>Change file</Button>
                  </div>

                  {/* HubSpot ID field selector */}
                  {HUB_ID_HINT[currentStep as Exclude<MigrateStep, "summary">] && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">HubSpot Record ID field (for association linking)</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">{HUB_ID_HINT[currentStep as Exclude<MigrateStep, "summary">]}</p>
                      <Select value={hubIdField || "none"} onValueChange={v => setHubIdField(v === "none" ? "" : v)}>
                        <SelectTrigger className="w-56 bg-white dark:bg-background">
                          <SelectValue placeholder="Select ID column…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / not available</SelectItem>
                          {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Field mapping table */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>CSV Column</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead className="w-48">Maps to CRM Field</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {headers.filter(h => h !== hubIdField).map(h => (
                          <TableRow key={h}>
                            <TableCell className="font-mono text-sm">{h}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                              {rows.slice(0, 2).map(r => r[h]).filter(Boolean).join(", ")}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={mapping[h] || "skip"}
                                onValueChange={v => setMapping(prev => ({ ...prev, [h]: v }))}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="skip">— skip —</SelectItem>
                                  {fields.map(f => (
                                    <SelectItem key={f.key} value={f.key}>
                                      {f.label}{f.required ? " *" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Owner mapping */}
                  {ownerValues.length > 0 && (
                    <div className="border rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium">Map owners to CRM users</p>
                        <p className="text-xs text-muted-foreground">Each distinct owner value from your CSV — assign it to a user. Unmapped owners import unassigned.</p>
                      </div>
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {ownerValues.map(val => (
                          <div key={val} className="flex items-center gap-3">
                            <span className="text-sm font-mono flex-1 truncate" title={val}>{val}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <Select
                              value={ownerMapping[val] || "none"}
                              onValueChange={v => setOwnerMapping(prev => {
                                const next = { ...prev };
                                if (v === "none") delete next[val]; else next[val] = v;
                                return next;
                              })}
                            >
                              <SelectTrigger className="h-8 text-sm w-56">
                                <SelectValue placeholder="Select user…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— leave unassigned —</SelectItem>
                                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stage mapping (deals only) */}
                  {currentStep === "deals" && stageValues.length > 0 && (
                    <div className="border rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium">Map HubSpot stages to your pipeline</p>
                        <p className="text-xs text-muted-foreground">Each distinct stage value — assign it to a CRM stage. Unmapped stages fall back to name match, then the first stage.</p>
                      </div>
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {stageValues.map(val => (
                          <div key={val} className="flex items-center gap-3">
                            <span className="text-sm font-mono flex-1 truncate" title={val}>{val}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <Select
                              value={stageMapping[val] || "auto"}
                              onValueChange={v => setStageMapping(prev => {
                                const next = { ...prev };
                                if (v === "auto") delete next[val]; else next[val] = v;
                                return next;
                              })}
                            >
                              <SelectTrigger className="h-8 text-sm w-56">
                                <SelectValue placeholder="Select stage…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">— auto (match by name) —</SelectItem>
                                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Data preview (first 3 rows)</p>
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {headers.slice(0, 6).map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.slice(0, 3).map((r, i) => (
                            <TableRow key={i}>
                              {headers.slice(0, 6).map(h => (
                                <TableCell key={h} className="text-xs max-w-[120px] truncate">{r[h]}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button onClick={handleImport}>
                      Import {rows.length} {currentStepDef.label}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </>
              )}

              {/* IMPORTING */}
              {phase === "importing" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="font-medium">Importing {currentStepDef.label}…</p>
                  <Progress value={progress} className="w-64" />
                  <p className="text-sm text-muted-foreground">{rows.length} rows being processed</p>
                </div>
              )}

              {/* DONE */}
              {phase === "done" && stepResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{stepResult.imported} of {stepResult.received} {currentStepDef.label.toLowerCase()} imported successfully</span>
                  </div>
                  {stepResult.skipped.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium">{stepResult.skipped.length} rows skipped</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                        {stepResult.skipped.slice(0, 15).map((s, i) => (
                          <p key={i} className="text-xs text-muted-foreground">Row {s.row}: {s.reason}</p>
                        ))}
                        {stepResult.skipped.length > 15 && (
                          <p className="text-xs text-muted-foreground">…and {stepResult.skipped.length - 15} more</p>
                        )}
                      </div>
                    </div>
                  )}
                  {stepResult.warnings.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">{stepResult.warnings.length} unmatched associations</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-0.5">
                        {stepResult.warnings.slice(0, 15).map((s, i) => (
                          <p key={i} className="text-xs text-muted-foreground">Row {s.row}: {s.reason}</p>
                        ))}
                        {stepResult.warnings.length > 15 && (
                          <p className="text-xs text-muted-foreground">…and {stepResult.warnings.length - 15} more</p>
                        )}
                      </div>
                    </div>
                  )}
                  {Object.keys(stepResult.idMap).length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{Object.keys(stepResult.idMap).length} IDs mapped</Badge>
                      <span>These will be used to link records in the next step</span>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    {!isLastDataStep ? (
                      <Button onClick={() => { const next = STEPS[stepIndex + 1]; if (next) goTo(next.id); }}>
                        Next: {STEPS[stepIndex + 1]?.label}
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    ) : (
                      <Button onClick={() => goTo("summary")}>
                        View Summary
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
