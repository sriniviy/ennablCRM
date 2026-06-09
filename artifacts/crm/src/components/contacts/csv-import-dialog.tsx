import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { importContacts, getListContactsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONTACT_FIELDS = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "title", label: "Job Title" },
  { value: "notes", label: "Notes" },
];

type Step = "upload" | "map" | "importing" | "done";

interface SkippedRow {
  row: number;
  reason: string;
}

interface ImportResult {
  imported: number;
  skipped: SkippedRow[];
}

const BATCH_SIZE = 100;

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const parseCSV = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let inQuotes = false;
      let cur = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const hdrs = parseRow(lines[0]);
    const dataRows = lines.slice(1).map(line => {
      const cols = parseRow(line);
      const obj: Record<string, string> = {};
      hdrs.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
      return obj;
    }).filter(row => Object.values(row).some(v => v));

    return { headers: hdrs, rows: dataRows };
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed || parsed.rows.length === 0) {
        toast({ title: "Invalid CSV", description: "File must have a header row and at least one data row.", variant: "destructive" });
        return;
      }

      const autoMapping: Record<string, string> = {};
      parsed.headers.forEach(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        if (norm === "firstname" || norm === "first") autoMapping[h] = "firstName";
        else if (norm === "lastname" || norm === "last") autoMapping[h] = "lastName";
        else if (norm === "email") autoMapping[h] = "email";
        else if (norm === "phone" || norm === "mobile") autoMapping[h] = "phone";
        else if (norm === "title" || norm === "jobtitle" || norm === "position") autoMapping[h] = "title";
        else if (norm === "notes" || norm === "description") autoMapping[h] = "notes";
      });

      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapping);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const activeMapping: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field && field !== "skip") activeMapping[col] = field;
    }

    const total = rows.length;
    setImportProgress({ done: 0, total });
    setStep("importing");

    let totalImported = 0;
    const allSkipped: SkippedRow[] = [];

    try {
      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const batch = rows.slice(offset, offset + BATCH_SIZE);
        const data = await importContacts({ rows: batch, mapping: activeMapping });
        totalImported += data.imported;
        allSkipped.push(...(data.skipped ?? []));
        setImportProgress({ done: Math.min(offset + BATCH_SIZE, total), total });
      }

      setResult({ imported: totalImported, skipped: allSkipped });
      setSkippedOpen(false);
      setStep("done");
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
    } catch {
      setStep("map");
      toast({ title: "Import failed", description: "Failed to import contacts.", variant: "destructive" });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("upload");
      setHeaders([]);
      setRows([]);
      setMapping({});
      setResult(null);
      setSkippedOpen(false);
      setImportProgress({ done: 0, total: 0 });
      if (fileRef.current) fileRef.current.value = "";
    }, 300);
  };

  const downloadSkippedRows = () => {
    if (!result || result.skipped.length === 0) return;
    const skipReasonCol = "Skip reason";
    const csvHeaders = [...headers, skipReasonCol];

    const escapeCell = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const lines: string[] = [csvHeaders.map(escapeCell).join(",")];
    for (const skipped of result.skipped) {
      const rowData = rows[skipped.row - 2] ?? {};
      const cells = headers.map(h => escapeCell(rowData[h] ?? ""));
      cells.push(escapeCell(skipped.reason));
      lines.push(cells.join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skipped-rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewRows = rows.slice(0, 3);
  const progressPct = importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-8">
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Click to upload a CSV file</p>
              <p className="text-xs text-muted-foreground">Requires a header row with column names</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{rows.length} rows</span> found. Map CSV columns to contact fields below.
            </p>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Column</TableHead>
                    <TableHead>Maps to field</TableHead>
                    <TableHead>Preview (first row)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map(h => (
                    <TableRow key={h}>
                      <TableCell className="font-mono text-xs">{h}</TableCell>
                      <TableCell>
                        <Select
                          value={mapping[h] ?? "skip"}
                          onValueChange={v => setMapping(prev => ({ ...prev, [h]: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip"><span className="text-muted-foreground">Skip</span></SelectItem>
                            {CONTACT_FIELDS.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">
                        {rows[0]?.[h] ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {previewRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Preview (first {previewRows.length} rows)</p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          {headers.map(h => <TableCell key={h} className="text-xs">{row[h]}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Importing contacts…</span>
                <span className="font-medium tabular-nums">
                  {importProgress.done} / {importProgress.total} rows
                </span>
              </div>
              <Progress value={progressPct} className="h-3" />
              <p className="text-xs text-muted-foreground text-right">{progressPct}% complete</p>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="py-6 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Import complete</p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-green-600 font-medium">{result.imported} imported</span>
                  {result.skipped.length > 0 && (
                    <>, <span className="text-amber-600 font-medium">{result.skipped.length} skipped</span></>
                  )}
                </p>
              </div>
            </div>

            {result.skipped.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  onClick={() => setSkippedOpen(o => !o)}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">
                    {result.skipped.length} {result.skipped.length === 1 ? "row was" : "rows were"} skipped — click to see details
                  </span>
                  {skippedOpen
                    ? <ChevronDown className="h-4 w-4 shrink-0" />
                    : <ChevronRight className="h-4 w-4 shrink-0" />
                  }
                </button>

                {skippedOpen && (
                  <div className="border-t border-amber-200 dark:border-amber-900/50 max-h-48 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <div
                        key={i}
                        className="flex gap-3 px-3 py-2 text-xs border-b border-amber-100 dark:border-amber-900/30 last:border-0"
                      >
                        <span className="font-medium text-amber-700 dark:text-amber-400 shrink-0">Row {s.row}</span>
                        <span className="text-muted-foreground">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.skipped.length > 0 && (
              <Button variant="outline" size="sm" className="self-start" onClick={downloadSkippedRows}>
                <Download className="h-4 w-4 mr-2" />
                Download skipped rows
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button
                onClick={handleImport}
                disabled={!Object.values(mapping).some(v => v && v !== "skip")}
              >
                Import {rows.length} rows
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button variant="outline" disabled>Importing…</Button>
          )}
          {step === "done" && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
