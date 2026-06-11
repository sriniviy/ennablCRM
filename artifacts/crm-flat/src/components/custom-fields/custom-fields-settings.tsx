import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sliders, Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import {
  useCustomFieldDefinitions,
  useCreateCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
  useDeleteCustomFieldDefinition,
  type CustomFieldObjectType,
  type CustomFieldType,
  type CustomFieldDefinition,
} from "@/hooks/use-custom-fields";
import { useToast } from "@/hooks/use-toast";

const OBJECT_TYPES: { value: CustomFieldObjectType; label: string }[] = [
  { value: "contact", label: "Contacts" },
  { value: "company", label: "Companies" },
  { value: "deal", label: "Deals" },
  { value: "activity", label: "Activities" },
];

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / No" },
  { value: "single_select", label: "Single Select" },
  { value: "multi_select", label: "Multi Select" },
];

interface AddFieldFormProps {
  objectType: CustomFieldObjectType;
  onDone: () => void;
}

function AddFieldForm({ objectType, onDone }: AddFieldFormProps) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [required, setRequired] = useState(false);
  const create = useCreateCustomFieldDefinition();
  const { toast } = useToast();

  const needsOptions = fieldType === "single_select" || fieldType === "multi_select";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const options = needsOptions
      ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean)
      : undefined;
    try {
      await create.mutateAsync({ objectType, label: label.trim(), fieldType, options, required });
      toast({ title: "Custom field added" });
      setLabel("");
      setFieldType("text");
      setOptionsRaw("");
      setRequired(false);
      onDone();
    } catch (err) {
      toast({ title: "Failed to add field", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cf-label">Field label</Label>
          <Input
            id="cf-label"
            placeholder="e.g. Contract Value"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            disabled={create.isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-type">Type</Label>
          <Select
            value={fieldType}
            onValueChange={(v) => setFieldType(v as CustomFieldType)}
            disabled={create.isPending}
          >
            <SelectTrigger id="cf-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {needsOptions && (
        <div className="space-y-1">
          <Label htmlFor="cf-options">Options (comma-separated)</Label>
          <Input
            id="cf-options"
            placeholder="Option 1, Option 2, Option 3"
            value={optionsRaw}
            onChange={(e) => setOptionsRaw(e.target.value)}
            disabled={create.isPending}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="cf-required"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          disabled={create.isPending}
          className="h-4 w-4"
        />
        <Label htmlFor="cf-required" className="text-sm cursor-pointer">Required field</Label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={create.isPending || !label.trim()}>
          {create.isPending ? "Adding…" : "Add field"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface FieldRowProps {
  field: CustomFieldDefinition;
  index: number;
  total: number;
}

function FieldRow({ field, index, total }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [optionsRaw, setOptionsRaw] = useState((field.options ?? []).join(", "));
  const update = useUpdateCustomFieldDefinition();
  const deleteField = useDeleteCustomFieldDefinition();
  const { toast } = useToast();

  const needsOptions = field.fieldType === "single_select" || field.fieldType === "multi_select";
  const typeLabel = FIELD_TYPES.find((t) => t.value === field.fieldType)?.label ?? field.fieldType;

  const handleSave = async () => {
    const updates: Parameters<typeof update.mutateAsync>[0] = { id: field.id, label: label.trim() };
    if (needsOptions) {
      updates.options = optionsRaw.split(",").map((o) => o.trim()).filter(Boolean);
    }
    try {
      await update.mutateAsync(updates);
      setEditing(false);
      toast({ title: "Field updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleMove = async (direction: "up" | "down") => {
    const newOrder = direction === "up" ? field.displayOrder - 1 : field.displayOrder + 1;
    await update.mutateAsync({ id: field.id, displayOrder: newOrder });
  };

  const handleDelete = async () => {
    try {
      await deleteField.mutateAsync(field.id);
      toast({ title: "Field deleted" });
    } catch {
      toast({ title: "Failed to delete field", variant: "destructive" });
    }
  };

  return (
    <div className="flex items-start gap-2 py-3 border-b last:border-0">
      <div className="flex flex-col gap-0.5 mt-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-4 w-4"
          disabled={index === 0 || update.isPending}
          onClick={() => handleMove("up")}
          title="Move up"
        >
          <GripVertical className="h-3 w-3 rotate-90" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-4 w-4"
          disabled={index === total - 1 || update.isPending}
          onClick={() => handleMove("down")}
          title="Move down"
        >
          <GripVertical className="h-3 w-3 -rotate-90" />
        </Button>
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-7 text-sm"
              placeholder="Field label"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
            />
            {needsOptions && (
              <Input
                value={optionsRaw}
                onChange={(e) => setOptionsRaw(e.target.value)}
                className="h-7 text-sm"
                placeholder="Options (comma-separated)"
              />
            )}
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={update.isPending}>
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditing(false); setLabel(field.label); setOptionsRaw((field.options ?? []).join(", ")); }}>
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{field.label}</span>
            <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
            {field.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
            {field.options && field.options.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {field.options.slice(0, 3).join(", ")}{field.options.length > 3 ? ` +${field.options.length - 3}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{field.label}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the field and all its values from every record. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function ObjectTypeTab({ objectType }: { objectType: CustomFieldObjectType }) {
  const { data: fields, isLoading } = useCustomFieldDefinitions(objectType);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ) : fields && fields.length > 0 ? (
        <div>
          {fields.map((field, i) => (
            <FieldRow key={field.id} field={field} index={i} total={fields.length} />
          ))}
        </div>
      ) : !adding ? (
        <p className="text-sm text-muted-foreground">No custom fields yet.</p>
      ) : null}

      {adding ? (
        <AddFieldForm objectType={objectType} onDone={() => setAdding(false)} />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add field
        </Button>
      )}
    </div>
  );
}

export function CustomFieldsSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sliders className="h-5 w-5" />
          Custom Fields
        </CardTitle>
        <CardDescription>
          Define custom fields for your records. Fields appear on all detail pages and are included in exports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="contact">
          <TabsList className="mb-4">
            {OBJECT_TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {OBJECT_TYPES.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <ObjectTypeTab objectType={t.value} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
