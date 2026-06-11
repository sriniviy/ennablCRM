import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sliders, Check, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCustomFieldValues,
  useSaveCustomFieldValues,
  type CustomFieldObjectType,
  type CustomFieldWithValue,
} from "@/hooks/use-custom-fields";
import { useToast } from "@/hooks/use-toast";

interface Props {
  objectType: CustomFieldObjectType;
  recordId: string;
}

function FieldEditor({
  field,
  onSave,
  onCancel,
  saving,
}: {
  field: CustomFieldWithValue;
  onSave: (value: string | null) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(field.value ?? "");

  const handleSave = () => onSave(val === "" ? null : val);

  if (field.fieldType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Select value={val} onValueChange={setVal}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (field.fieldType === "single_select" && field.options?.length) {
    return (
      <div className="flex items-center gap-2">
        <Select value={val} onValueChange={setVal}>
          <SelectTrigger className="h-7 text-xs min-w-24">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">—</SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (field.fieldType === "multi_select" && field.options?.length) {
    const selected = val ? val.split(",").filter(Boolean) : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
      setVal(next.join(","));
    };
    return (
      <div className="flex flex-col gap-2 items-start">
        <div className="flex flex-wrap gap-1">
          {field.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                selected.includes(o)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleSave} disabled={saving}>
            <Check className="h-3 w-3 mr-1 text-green-600" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCancel}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-7 text-xs py-0"
        type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave} disabled={saving}>
        <Check className="h-3.5 w-3.5 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function displayValue(field: CustomFieldWithValue): string {
  if (field.value === null || field.value === undefined || field.value === "") return "—";
  if (field.fieldType === "boolean") return field.value === "true" ? "Yes" : "No";
  if (field.fieldType === "date") {
    try {
      return new Date(field.value).toLocaleDateString();
    } catch {
      return field.value;
    }
  }
  return field.value;
}

export function CustomFieldsSection({ objectType, recordId }: Props) {
  const { data: fields, isLoading } = useCustomFieldValues(objectType, recordId);
  const save = useSaveCustomFieldValues(objectType, recordId);
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sliders className="h-4 w-4" /> Custom Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!fields || fields.length === 0) return null;

  const handleSave = async (fieldId: string, value: string | null) => {
    try {
      await save.mutateAsync([{ fieldId, value }]);
      setEditingId(null);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sliders className="h-4 w-4" /> Custom Fields
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field) => (
          <div key={field.id} className="text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground shrink-0 pt-0.5">{field.label}</span>
              {editingId === field.id ? (
                <FieldEditor
                  field={field}
                  onSave={(v) => handleSave(field.id, v)}
                  onCancel={() => setEditingId(null)}
                  saving={save.isPending}
                />
              ) : (
                <button
                  type="button"
                  className="text-right font-medium hover:text-primary transition-colors cursor-pointer min-w-0"
                  title="Click to edit"
                  onClick={() => setEditingId(field.id)}
                >
                  {field.fieldType === "multi_select" && field.value ? (
                    <span className="flex flex-wrap gap-1 justify-end">
                      {field.value.split(",").filter(Boolean).map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                      ))}
                    </span>
                  ) : (
                    <span className={field.value ? "" : "text-muted-foreground"}>
                      {displayValue(field)}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
