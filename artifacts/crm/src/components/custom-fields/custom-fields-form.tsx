import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCustomFieldDefinitions,
  type CustomFieldObjectType,
  type CustomFieldDefinition,
} from "@/hooks/use-custom-fields";

interface CustomFieldsFormProps {
  objectType: CustomFieldObjectType;
  values: Record<string, string | null>;
  onChange: (fieldId: string, value: string | null) => void;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const val = value ?? "";

  if (field.fieldType === "boolean") {
    return (
      <Select value={val} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.fieldType === "single_select" && field.options?.length) {
    return (
      <Select value={val || "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {field.options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.fieldType === "multi_select" && field.options?.length) {
    const selected = val ? val.split(",").filter(Boolean) : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
      onChange(next.length ? next.join(",") : null);
    };
    return (
      <div className="flex flex-wrap gap-1">
        {field.options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              selected.includes(o)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  return (
    <Input
      type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
      value={val}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    />
  );
}

export function CustomFieldsForm({ objectType, values, onChange }: CustomFieldsFormProps) {
  const { data: fields } = useCustomFieldDefinitions(objectType);

  if (!fields || fields.length === 0) return null;

  return (
    <div className="space-y-4 border-t pt-4">
      <p className="text-sm font-medium text-muted-foreground">Custom Fields</p>
      {fields.map((field) => (
        <div key={field.id} className="space-y-1.5">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <FieldInput
            field={field}
            value={values[field.id] ?? null}
            onChange={(v) => onChange(field.id, v)}
          />
        </div>
      ))}
    </div>
  );
}
