# MyCRM – Design System Reference

This document is the single source of truth for the visual language and component conventions used in MyCRM (the `artifacts/crm-flat` workspace). Use it when building new pages, features, or asking another AI agent to extend the app so that everything looks and feels consistent.

---

## 1. Philosophy

The aesthetic is called **"flat"** and is the defining difference from most SaaS dashboards:

- **Sharp corners everywhere** — `border-radius: 0.2rem` (≈ 3 px). Nothing is pill-shaped. Nothing rounds softly. Even cards and buttons are nearly square.
- **Dense, compact layout** — text is `text-sm` (14 px) or smaller throughout. Navigation items are `py-1.5`. Form labels are `text-xs`. Information density is high.
- **Crisp borders, not shadows** — borders (`hsl(214 20% 86%)`) are the primary separation device. Shadows are very subtle (`0px 1px 3px rgba(0,0,0,0.07)`) and used sparingly.
- **Neutral-first palette** — the background is almost white (`hsl(210 20% 97%)`), cards are pure white, and the only accent color is a single blue primary. Status colors (amber, green, red) are used only for semantic meaning.
- **Hover state via elevation, not color change** — interactive surfaces use a pseudo-element overlay (`--elevate-1 = rgba(0,0,0,0.02)`) rather than a full background color swap.

---

## 2. Tech Stack

| Layer | Tool |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 7 |
| Routing | wouter |
| Styling | Tailwind CSS v4 |
| Components | **shadcn/ui** (copied source, not npm) |
| Primitives | Radix UI (via shadcn) |
| Icons | **lucide-react** (always `h-4 w-4` or smaller) |
| Data fetching | TanStack Query v5 + custom `@workspace/api-client-react` hooks |
| Rich text | TipTap (email body editor only) |
| Animations | tw-animate-css |
| Class merging | `cn()` from `clsx` + `tailwind-merge` |
| Toast | sonner |
| Font | Inter (sans), Georgia (serif), Menlo (mono) |

---

## 3. Design Tokens (CSS Variables)

All tokens are defined in `src/index.css` and consumed via Tailwind's `hsl(var(--token))` pattern.

### 3.1 Light Mode (default)

```
--background:        210 20% 97%    /* near-white page background */
--foreground:        220 25% 12%    /* near-black text */
--border:            214 20% 86%    /* all dividers and box outlines */

--card:              0 0% 100%      /* pure white card surface */
--card-foreground:   220 25% 12%
--card-border:       214 20% 88%

--primary:           221 83% 53%    /* blue — the only accent */
--primary-foreground:210 40% 98%

--secondary:         214 20% 94%    /* light grey chips, secondary buttons */
--secondary-foreground: 220 25% 18%

--muted:             214 20% 94%    /* backgrounds for code, tags, pills */
--muted-foreground:  215 16% 48%    /* de-emphasized labels */

--destructive:       0 84.2% 60.2% /* red — errors, delete actions */

--sidebar:           0 0% 100%      /* white sidebar */
--sidebar-border:    214 20% 88%
--sidebar-accent:    214 20% 94%    /* sidebar item hover */

--ring:              221 83% 53%    /* focus ring = primary */
--radius:            0.2rem         /* sharp corners everywhere */
```

### 3.2 Dark Mode

```
--background:        220 15% 9%
--foreground:        210 20% 92%
--border:            220 15% 18%
--card:              220 15% 11%
--sidebar:           220 15% 10%
--primary:           217 91% 60%    /* slightly brighter blue in dark */
--muted:             220 15% 15%
--muted-foreground:  215 12% 52%
```

### 3.3 Elevation Variables (custom — not Tailwind)

```
--elevate-1: rgba(0,0,0,0.02)    /* subtle hover tint */
--elevate-2: rgba(0,0,0,0.05)    /* stronger active tint */
/* dark mode: rgba(255,255,255,0.02) and rgba(255,255,255,0.05) */
```

### 3.4 Chart Colors

```
--chart-1: 221 83% 53%  (blue)
--chart-2: 142 71% 45%  (green)
--chart-3: 31  90% 50%  (amber/orange)
--chart-4: 271 81% 56%  (purple)
--chart-5: 0   84% 60%  (red)
```

---

## 4. Typography Scale

Use only these Tailwind classes — do not invent new font sizes.

| Role | Class | Size |
|---|---|---|
| Page title | `text-xl font-semibold tracking-tight` | 20 px |
| Section heading | `text-base font-semibold` | 16 px |
| Card title | `text-sm font-semibold` | 14 px |
| Body / table cells | `text-sm` | 14 px |
| Secondary info | `text-xs text-muted-foreground` | 12 px |
| Form label | `text-xs text-muted-foreground` | 12 px |
| Nav group label | `text-[10px] font-semibold tracking-widest uppercase` | 10 px |
| Badge / tag | `text-xs font-medium` | 12 px |
| Micro label / meta | `text-[10px]` or `text-[11px]` | 10–11 px |

**Weights used:** `font-normal` (400), `font-medium` (500), `font-semibold` (600), `font-bold` (700). Never `font-light` or `font-extrabold`.

---

## 5. Spacing & Layout

### Page container
```tsx
<div className="mx-auto max-w-[1400px]">
  {/* page content */}
</div>
```
This wrapper is applied by `SidebarLayout` — do not repeat it inside pages.

### Page padding
Handled by the layout: `p-4 md:p-6`. Pages output content directly without extra wrappers.

### Common gaps
- Between major sections: `space-y-6`
- Inside a form/card: `space-y-4` or `space-y-3`
- Between form fields: `space-y-3`
- Between inline elements: `gap-2` or `gap-3`
- Tight groups (icon + label): `gap-1.5` or `gap-2`

### Page header pattern
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-xl font-semibold tracking-tight">Page Title</h1>
    <p className="text-sm text-muted-foreground mt-0.5">Short description</p>
  </div>
  <Button size="sm">Primary Action</Button>
</div>
```

---

## 6. Sidebar Layout

All authenticated pages use:
```tsx
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default function MyPage() {
  return (
    <SidebarLayout>
      {/* page content */}
    </SidebarLayout>
  );
}
```

The sidebar is:
- **Width:** 208 px expanded (`w-52`), 56 px collapsed (`w-14`)
- **Background:** `bg-sidebar` (white in light mode)
- **Nav items:** `text-sm font-medium`, `py-1.5 px-3`, active state = `bg-primary/10 text-primary border-l-2 border-primary`
- **Group labels:** `text-[10px] font-semibold tracking-widest uppercase text-muted-foreground`
- **Collapsible:** persisted to `localStorage`; collapsed items show icon-only with Tooltip

Nav structure (in order):
- PIPELINE: Dashboard, Deals
- RECORDS: Contacts, Needs Review, Companies, Tasks, Activities
- ENGAGE: Campaigns, Segments
- INSIGHTS: Reports
- ADMIN: HubSpot Import, Audit Log, Settings

---

## 7. Component Library (shadcn/ui)

All component source lives in `src/components/ui/`. Import from `@/components/ui/<name>`. Do **not** use npm shadcn — the source is already present and customized.

### Available standard components
`accordion` · `alert` · `aspect-ratio` · `avatar` · `badge` · `breadcrumb` · `button` · `card` · `carousel` · `chart` · `checkbox` · `collapsible` · `command` · `context-menu` · `dialog` · `drawer` · `dropdown-menu` · `form` · `input` · `input-otp` · `kbd` · `label` · `menubar` · `navigation-menu` · `pagination` · `popover` · `progress` · `radio-group` · `resizable` · `scroll-area` · `select` · `separator` · `sheet` · `skeleton` · `slider` · `sonner` · `switch` · `table` · `tabs` · `textarea` · `toast` · `toaster` · `toggle` · `toggle-group` · `tooltip`

### Custom components in `src/components/ui/`
| File | Purpose |
|---|---|
| `button-group.tsx` | Groups related buttons in a joined row |
| `collapsible-card.tsx` | Card with show/hide toggle + gradient fade preview |
| `empty.tsx` | Standard empty-state placeholder |
| `field.tsx` | Form field primitives: `FieldSet`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldError` |
| `input-group.tsx` | Input + leading/trailing icon or text |
| `item.tsx` | List-item primitives: `ItemGroup`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` |
| `spinner.tsx` | Loading spinner |

---

## 8. Button Conventions

```tsx
/* Primary action */
<Button size="sm">Save</Button>

/* Destructive */
<Button size="sm" variant="destructive">Delete</Button>

/* Secondary */
<Button size="sm" variant="outline">Cancel</Button>

/* Ghost (icon-only or subtle inline) */
<Button variant="ghost" size="icon" className="h-7 w-7">
  <Pencil className="h-3.5 w-3.5" />
</Button>

/* Inline text-button (AI panel, expand more, etc.) */
<Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-primary/70 hover:text-primary">
  <Sparkles className="h-3 w-3" />
  Write with AI
</Button>
```

**Size guide:**
- `size="sm"` — standard for most actions inside pages/dialogs
- `size="icon"` combined with `h-7 w-7` — small icon-only buttons in table rows / cards
- `h-6` / `h-5` — micro buttons in toolbars or inline actions

---

## 9. Card Pattern

Cards are plain `<div>` with border and background, **not** the `<Card>` shadcn component (which is reserved for dashboard widgets):

```tsx
/* Standard bordered section */
<div className="border rounded-lg p-4 space-y-3 bg-card">
  ...
</div>

/* Muted inset panel (e.g. sub-form, AI panel) */
<div className="border rounded-lg p-3 space-y-2.5 bg-muted/30">
  ...
</div>

/* Dashed accent panel (AI / special section) */
<div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2.5 bg-primary/5">
  ...
</div>
```

---

## 10. Forms & Inputs

### Label pattern
```tsx
<div>
  <label className="text-xs text-muted-foreground mb-1 block">Field name</label>
  <Input placeholder="…" value={val} onChange={…} />
</div>
```

### Label + action row pattern
```tsx
<div className="flex items-center justify-between mb-1">
  <label className="text-xs text-muted-foreground">Body</label>
  <SomeActionButton />
</div>
```

### Select
Always use the shadcn `Select` from `@/components/ui/select`. Never native `<select>`.

### Form spacing
```tsx
<div className="space-y-3">
  <div>...</div>  {/* field */}
  <div>...</div>  {/* field */}
</div>
```

### Disabled / loading state
- Mutations: pass `disabled={mutation.isPending}` to the submit button
- Label: `{mutation.isPending ? "Saving…" : "Save"}`

---

## 11. Dialogs

All create/edit flows open in a `Dialog`, never in a new page (unless the entity is complex enough to merit its own route).

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-[480px]">
    <DialogHeader>
      <DialogTitle>Add Contact</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      {/* form fields */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Max widths used:**
- Narrow (simple form): `sm:max-w-[480px]`
- Medium (multi-field): `sm:max-w-[560px]` or `sm:max-w-[640px]`
- Wide (preview/compare): `sm:max-w-[760px]` or `max-w-3xl`

---

## 12. Tables

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

<div className="border rounded-lg overflow-hidden">
  <Table>
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-9 text-xs font-semibold text-muted-foreground">Name</TableHead>
        <TableHead className="h-9 text-xs font-semibold text-muted-foreground">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={…}>
          <TableCell className="py-2 text-sm font-medium">{row.name}</TableCell>
          <TableCell className="py-2 text-sm text-muted-foreground">{row.status}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

Key details:
- Header height: `h-9`
- Header text: `text-xs font-semibold text-muted-foreground`
- Cell padding: `py-2`
- Row hover: `hover:bg-muted/50`
- Wrap in `border rounded-lg overflow-hidden` div

---

## 13. Badges & Status Pills

```tsx
import { Badge } from "@/components/ui/badge";

/* Default — grey */
<Badge variant="outline">{label}</Badge>

/* Semantic status — use raw Tailwind, not Badge, for colors */
<span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
  Active
</span>

<span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
  Pending
</span>

<span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
  Failed
</span>
```

**Status color map:**
| Status | Light | Dark |
|---|---|---|
| Active / success | `bg-green-100 text-green-700` | `dark:bg-green-900/30 dark:text-green-400` |
| Warning / pending | `bg-amber-100 text-amber-700` | `dark:bg-amber-900/30 dark:text-amber-400` |
| Error / danger | `bg-red-100 text-red-700` | `dark:bg-red-900/30 dark:text-red-400` |
| Info / neutral | `bg-blue-100 text-blue-700` | `dark:bg-blue-900/40 dark:text-blue-300` |
| Inactive / grey | `bg-muted text-muted-foreground` | (inherits) |
| AI / special | `bg-violet-100 text-violet-700` | `dark:bg-violet-900/30 dark:text-violet-400` |

---

## 14. Icons

Always use **lucide-react**. Never use any other icon library.

**Standard sizes:**
- Navigation icons: `h-3.5 w-3.5` (inside nav links)
- Button icons: `h-4 w-4`
- Micro toolbar icons: `h-3 w-3` or `h-3.5 w-3.5`
- Inline text icons: `h-3 w-3` with `shrink-0`

```tsx
import { Pencil, Trash2, Plus, ChevronDown, Sparkles } from "lucide-react";

<Plus className="h-4 w-4" />
```

---

## 15. Hover Elevation System (custom)

Instead of `hover:bg-gray-100`, interactive elements use the elevation pseudo-element system:

```tsx
/* Apply to any clickable surface */
className="hover-elevate cursor-pointer"

/* Stronger press effect */
className="hover-elevate active-elevate"
```

This overlays a `rgba(0,0,0,0.02)` tint on hover and `rgba(0,0,0,0.05)` on active, which works identically in dark mode (substitutes white-based tints automatically).

**When to use:**
- List items that are clickable but not styled as buttons
- Card rows in tables or activity feeds
- Any surface where a background color change would look too heavy

---

## 16. Empty States

```tsx
import { Empty } from "@/components/ui/empty";

<Empty
  icon={Users}
  title="No contacts yet"
  description="Add your first contact to get started."
  action={<Button size="sm" onClick={…}>Add Contact</Button>}
/>
```

---

## 17. Loading States

Use `Skeleton` for content areas, and button `isPending` states for actions:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

/* Card loading placeholder */
<div className="space-y-2">
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>
```

---

## 18. Toasts

Use sonner via the `useToast` hook or `toast()` directly:

```tsx
import { toast } from "sonner";
// OR
import { useToast } from "@/hooks/use-toast";
const { toast } = useToast();

toast({ title: "Saved", description: "Contact updated." });
toast({ title: "Error", description: err.message, variant: "destructive" });
```

---

## 19. Dark Mode

Dark mode is toggled by adding the `.dark` class to `<html>`. Use `useTheme()` hook:

```tsx
import { useTheme } from "@/hooks/use-theme";
const { theme, toggle } = useTheme();
```

All colors are defined via CSS variables with `.dark` overrides in `index.css`. Use `dark:` Tailwind variants for the rare cases where a component uses hardcoded colors (e.g. semantic status badges).

---

## 20. File & Component Structure

```
src/
  pages/           # One file per route — page-level components
  components/
    ui/            # shadcn/ui base components (do not modify unless intentional)
    layout/        # SidebarLayout, page shells
    contacts/      # Feature-scoped: ContactDialog, etc.
    deals/         # DealDialog, etc.
    notes/         # NotesFeed, etc.
    tasks/         # TaskDialog, etc.
  hooks/           # use-theme, use-toast, use-ai-prefs, etc.
  lib/             # utils.ts (cn helper), auth-client, api helpers
```

**Naming:**
- Pages: `kebab-case.tsx` matching the route (`contact-detail.tsx` → `/contacts/:id`)
- Components: `kebab-case.tsx`
- Hooks: `use-kebab-case.ts`
- All exports are named (not default) for components other than pages

---

## 21. Data Fetching Pattern

```tsx
import { useListContacts, useCreateContact } from "@workspace/api-client-react";
import { useSessionToken } from "@/hooks/use-session-token";

// Read
const { data, isLoading } = useListContacts({ page: 1, pageSize: 25 });

// Write
const createMutation = useMutation({
  mutationFn: () => apiFetch("/contacts", { method: "POST", body: JSON.stringify(payload) }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    toast({ title: "Contact created" });
    setOpen(false);
  },
  onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
});
```

Use `apiFetch` (from `@/lib/api`) for custom endpoints not yet in the generated client.

---

## 22. AI Feature Conventions

AI-powered panels follow this visual pattern:

```tsx
/* AI panel trigger button */
<Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-primary/70 hover:text-primary">
  <Sparkles className="h-3 w-3" />
  Write with AI
</Button>

/* Improve-with-AI button */
<Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-violet-600/80 hover:text-violet-700 dark:text-violet-400/80 dark:hover:text-violet-300">
  <RefreshCw className="h-3 w-3" />
  Improve with AI
</Button>

/* AI panel container */
<div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2.5 bg-primary/5">
  <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
    <Sparkles className="h-3.5 w-3.5" />
    Write with AI
  </p>
  {/* panel contents */}
</div>

/* AI disclaimer banner */
<div className="bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200/60 px-3 py-1.5">
  <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
    <Sparkles className="h-3 w-3 shrink-0" />
    AI-generated — review before saving.
  </p>
</div>
```

---

## 23. Rich Email Editor (TipTap)

Used exclusively in sequence step email body fields.

```tsx
import { RichEmailEditor } from "@/components/rich-email-editor";

<RichEmailEditor
  value={htmlString}
  onChange={(html) => setBody(html)}
  placeholder="Write your email body…"
  tokens={TOKENS}          /* optional: { token, label }[] */
  minHeight="140px"        /* optional */
/>
```

The component outputs valid HTML. Use `stripHtml(html)` for plain-text previews in list cards, and `dangerouslySetInnerHTML` for rendered previews.

---

## 24. Key Rules for AI Agents

1. **Never round corners more than `rounded-lg`** (which maps to ~4 px given `--radius: 0.2rem`). No `rounded-xl`, `rounded-2xl`, `rounded-full` except for avatars.
2. **No gradients** as backgrounds. Gradients appear only as fade masks (e.g. `CollapsibleCard`).
3. **Keep text small** — if you feel the urge to use `text-base` or larger inside a card or table, it's probably wrong. `text-sm` is the maximum for body content.
4. **Icons are always lucide-react**, always sized `h-4 w-4` or smaller.
5. **Primary blue is the only brand color.** Avoid adding new accent colors. Use semantic color only for status.
6. **Dialogs for CRUD, not page navigation.** Create/edit stays in-place.
7. **shadcn is already installed.** Import from `@/components/ui/<component>`. Never install shadcn packages via npm.
8. **Button label matches action.** Loading state: replace label with `"Saving…"` / `"Deleting…"`, not a spinner in the center.
9. **All pages must be wrapped in `<SidebarLayout>`.**
10. **Form labels go above inputs**, are `text-xs text-muted-foreground`, and use `<label>` (not placeholder-as-label).
