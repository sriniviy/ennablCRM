import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useCallback, useEffect } from "react";
import {
  useCreateCampaign, useListContacts, useListCompanies,
  useListSegments, useCreateSegment, useCountSegment,
  countSegmentFilter, countSegment, evaluateSegmentFilter,
  getListSegmentsQueryKey,
} from "@workspace/api-client-react";
import type { SegmentFilter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import {
  ArrowLeft, ArrowRight, Check, Trash2, Type, AlignLeft, MousePointer,
  Minus, Image, Share2, Maximize2, Users, Calendar, Send, Save,
  ChevronLeft, ChevronRight, Clock, Tag, User, Smile, Columns, Monitor, Smartphone, Code,
  Mail, Building2, UserCheck, ExternalLink, Sparkles, Loader2, GripVertical, Copy,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

const uid = () => Math.random().toString(36).slice(2, 9);

type BlockType = "header" | "text" | "image" | "button" | "divider" | "spacer" | "social" | "columns";
type FontSize = "sm" | "md" | "lg" | "xl";
type SpacerHeight = "sm" | "md" | "lg";
type ColRatio = "50-50" | "60-40" | "40-60";

interface Block {
  id: string;
  type: BlockType;
  content: string;
  url?: string;
  align?: "left" | "center" | "right";
  fontSize?: FontSize;
  color?: string;
  buttonColor?: string;
  imageUrl?: string;
  imageAlt?: string;
  spacerHeight?: SpacerHeight;
  col1?: string;
  col2?: string;
  colRatio?: ColRatio;
}


function filterSummaryChips(filterJson: string): { label: string; icon: React.ReactNode }[] {
  let filter: SegmentFilter = {};
  try { filter = JSON.parse(filterJson); } catch { /* empty */ }
  const chips: { label: string; icon: React.ReactNode }[] = [];
  if (filter.status) chips.push({ label: filter.status, icon: <UserCheck className="h-3 w-3" /> });
  if (filter.tags?.length) chips.push({ label: filter.tags.join(", "), icon: <Tag className="h-3 w-3" /> });
  if (filter.companyId) chips.push({ label: "Specific company", icon: <Building2 className="h-3 w-3" /> });
  if (filter.emailMarketingContact) chips.push({ label: "Email marketing", icon: <Mail className="h-3 w-3" /> });
  if (filter.ennablUser) chips.push({ label: "Ennabl users", icon: <Users className="h-3 w-3" /> });
  return chips;
}

const FONT_SIZES: Record<FontSize, { label: string; px: number }> = {
  sm: { label: "S", px: 14 },
  md: { label: "M", px: 18 },
  lg: { label: "L", px: 24 },
  xl: { label: "XL", px: 32 },
};

const TEMPLATES: { id: string; label: string; desc: string; color: string; blocks: Block[] }[] = [
  {
    id: "blank", label: "Blank", desc: "Start fresh", color: "#e5e7eb",
    blocks: [
      { id: uid(), type: "header", content: "Your Heading Here", align: "center", fontSize: "lg" },
      { id: uid(), type: "text", content: "Write your message here.", align: "left", fontSize: "md" },
    ],
  },
  {
    id: "announcement", label: "Product Announcement", desc: "Announce something new", color: "#6366f1",
    blocks: [
      { id: uid(), type: "header", content: "🚀 Introducing Something New", align: "center", fontSize: "xl" },
      { id: uid(), type: "text", content: "We're thrilled to share exciting news with you, {{firstName}}.", align: "left", fontSize: "md" },
      { id: uid(), type: "image", content: "", imageUrl: "", imageAlt: "Product image", align: "center" },
      { id: uid(), type: "text", content: "This is a game-changer for teams like yours. Here's what you get:\n\n• Feature one that saves hours\n• Feature two that improves accuracy\n• Feature three you've been waiting for", align: "left", fontSize: "md" },
      { id: uid(), type: "button", content: "Learn More", url: "https://", align: "center", buttonColor: "#6366f1" },
    ],
  },
  {
    id: "newsletter", label: "Newsletter", desc: "Regular updates", color: "#10b981",
    blocks: [
      { id: uid(), type: "header", content: "Monthly Update — {{firstName}}", align: "left", fontSize: "lg" },
      { id: uid(), type: "divider", content: "" },
      { id: uid(), type: "text", content: "Here's what's been happening this month at Ennabl.", align: "left", fontSize: "md" },
      { id: uid(), type: "columns", content: "", col1: "Highlight #1\n\nYour first update here.", col2: "Highlight #2\n\nYour second update here.", colRatio: "50-50" },
      { id: uid(), type: "button", content: "Read Full Update", url: "https://", align: "left", buttonColor: "#10b981" },
    ],
  },
  {
    id: "followup", label: "Follow-Up", desc: "Personal touch", color: "#f59e0b",
    blocks: [
      { id: uid(), type: "header", content: "Following up, {{firstName}}", align: "left", fontSize: "lg" },
      { id: uid(), type: "text", content: "I wanted to follow up on our recent conversation and see if you had any questions.", align: "left", fontSize: "md" },
      { id: uid(), type: "text", content: "I'd love to schedule a quick call to discuss how we can help you.", align: "left", fontSize: "md" },
      { id: uid(), type: "button", content: "Book a Call", url: "https://", align: "left", buttonColor: "#f59e0b" },
    ],
  },
  {
    id: "event", label: "Event Invite", desc: "Drive attendance", color: "#8b5cf6",
    blocks: [
      { id: uid(), type: "header", content: "You're Invited, {{firstName}}!", align: "center", fontSize: "xl" },
      { id: uid(), type: "text", content: "Join us for an exclusive event you won't want to miss.", align: "center", fontSize: "md" },
      { id: uid(), type: "columns", content: "", col1: "📅 Date\n[Event Date]", col2: "📍 Location\n[Venue Name]", colRatio: "50-50" },
      { id: uid(), type: "spacer", content: "", spacerHeight: "sm" },
      { id: uid(), type: "button", content: "Reserve My Spot", url: "https://", align: "center", buttonColor: "#8b5cf6" },
    ],
  },
  {
    id: "renewal", label: "Renewal Reminder", desc: "Retain customers", color: "#ef4444",
    blocks: [
      { id: uid(), type: "header", content: "Your renewal is coming up, {{firstName}}", align: "left", fontSize: "lg" },
      { id: uid(), type: "text", content: "Your contract with Ennabl is up for renewal soon. We'd love to continue working with you.", align: "left", fontSize: "md" },
      { id: uid(), type: "text", content: "Here's a quick summary of what you've accomplished this year:\n\n• Achievement 1\n• Achievement 2\n• Achievement 3", align: "left", fontSize: "md" },
      { id: uid(), type: "button", content: "Renew Now", url: "https://", align: "left", buttonColor: "#ef4444" },
    ],
  },
];

function blocksToHtml(blocks: Block[]): string {
  const rows = blocks.map(b => {
    const align = b.align ?? "left";
    const color = b.color || "#333333";
    switch (b.type) {
      case "header": {
        const px = FONT_SIZES[b.fontSize ?? "lg"].px;
        return `<tr><td style="padding:20px 40px;text-align:${align};"><h1 style="margin:0;font-family:Arial,sans-serif;font-size:${px}px;font-weight:700;color:${color};line-height:1.3;">${b.content.replace(/\n/g, "<br>")}</h1></td></tr>`;
      }
      case "text": {
        const px = FONT_SIZES[b.fontSize ?? "md"].px;
        return `<tr><td style="padding:8px 40px;text-align:${align};"><p style="margin:0;font-family:Arial,sans-serif;font-size:${px}px;color:${color};line-height:1.7;white-space:pre-line;">${b.content}</p></td></tr>`;
      }
      case "columns": {
        const [w1, w2] = b.colRatio === "60-40" ? [60, 40] : b.colRatio === "40-60" ? [40, 60] : [50, 50];
        return `<tr><td style="padding:8px 40px;"><table width="100%" cellpadding="0" cellspacing="0"><tbody><tr>
          <td width="${w1}%" style="padding-right:12px;vertical-align:top;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.6;white-space:pre-line;">${b.col1 ?? ""}</td>
          <td width="${w2}%" style="padding-left:12px;vertical-align:top;font-family:Arial,sans-serif;font-size:15px;color:#444;line-height:1.6;white-space:pre-line;">${b.col2 ?? ""}</td>
        </tr></tbody></table></td></tr>`;
      }
      case "image":
        if (b.imageUrl) {
          return `<tr><td style="padding:16px 40px;text-align:${align};"><img src="${b.imageUrl}" alt="${b.imageAlt || ""}" style="max-width:100%;height:auto;display:inline-block;border-radius:6px;" /></td></tr>`;
        }
        return `<tr><td style="padding:16px 40px;text-align:center;"><div style="background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;padding:40px;font-family:Arial,sans-serif;font-size:14px;color:#9ca3af;">Image placeholder</div></td></tr>`;
      case "button": {
        const bg = b.buttonColor || "#6366f1";
        return `<tr><td style="padding:16px 40px;text-align:${align};"><a href="${b.url || "#"}" style="display:inline-block;padding:13px 30px;background:${bg};color:#fff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">${b.content}</a></td></tr>`;
      }
      case "divider":
        return `<tr><td style="padding:12px 40px;"><hr style="border:none;border-top:1px solid #e5e7eb;" /></td></tr>`;
      case "spacer": {
        const h = b.spacerHeight === "lg" ? 48 : b.spacerHeight === "md" ? 32 : 16;
        return `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
      }
      case "social":
        return `<tr><td style="padding:16px 40px;text-align:${align};">
          <a href="#" style="display:inline-block;margin:0 6px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;text-decoration:none;">LinkedIn</a>
          <a href="#" style="display:inline-block;margin:0 6px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;text-decoration:none;">X/Twitter</a>
          <a href="#" style="display:inline-block;margin:0 6px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;text-decoration:none;">Website</a>
        </td></tr>`;
      default: return "";
    }
  }).join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 0;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tbody>
${rows}
<tr><td style="padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">
  You're receiving this because you're on our list. <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>
</p></td></tr>
</tbody></table></body></html>`;
}

function TemplatePreview({ color, blocks }: { color: string; blocks: Block[] }) {
  return (
    <div className="w-full bg-white rounded border overflow-hidden" style={{ height: 120 }}>
      <div className="h-2 w-full" style={{ background: color }} />
      <div className="p-2 space-y-1">
        {blocks.slice(0, 4).map((b, i) => {
          if (b.type === "header") return <div key={i} className="h-2.5 rounded" style={{ background: color, width: "70%", opacity: 0.8 }} />;
          if (b.type === "text") return <div key={i} className="space-y-0.5">{[0, 1].map(j => <div key={j} className="h-1.5 rounded bg-gray-200" style={{ width: j === 1 ? "55%" : "90%" }} />)}</div>;
          if (b.type === "columns") return <div key={i} className="grid grid-cols-2 gap-1">{[0, 1].map(j => <div key={j} className="h-4 rounded bg-gray-100" />)}</div>;
          if (b.type === "button") return <div key={i} className="h-3 rounded w-20" style={{ background: color, opacity: 0.7 }} />;
          if (b.type === "divider") return <div key={i} className="h-px bg-gray-200 my-1" />;
          if (b.type === "image") return <div key={i} className="h-8 rounded bg-gray-100 border border-dashed border-gray-200" />;
          return null;
        })}
      </div>
    </div>
  );
}

const BLOCK_PALETTE: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "header", label: "Heading", icon: <Type className="h-4 w-4" /> },
  { type: "text", label: "Text", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "columns", label: "2 Columns", icon: <Columns className="h-4 w-4" /> },
  { type: "image", label: "Image", icon: <Image className="h-4 w-4" /> },
  { type: "button", label: "Button", icon: <MousePointer className="h-4 w-4" /> },
  { type: "divider", label: "Divider", icon: <Minus className="h-4 w-4" /> },
  { type: "spacer", label: "Spacer", icon: <Maximize2 className="h-4 w-4" /> },
  { type: "social", label: "Social", icon: <Share2 className="h-4 w-4" /> },
];

const PERSONALIZATION_TOKENS = [
  { label: "First Name", token: "{{firstName}}" },
  { label: "Last Name", token: "{{lastName}}" },
  { label: "Full Name", token: "{{fullName}}" },
];

const CONTACT_STATUSES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED", "UNQUALIFIED"];

function StepIndicator({ current }: { current: number }) {
  const steps = ["Template", "Design", "Audience", "Timing"];
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${i === current ? "bg-primary text-primary-foreground" : i < current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {i < current && <Check className="h-3 w-3" />}
            {s}
          </div>
          {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

function SegmentCountInline({ id }: { id: string }) {
  const { data } = useCountSegment(id);
  if (!data) return null;
  return (
    <Badge variant="outline" className="text-xs font-normal py-0">
      {data.count.toLocaleString()}
    </Badge>
  );
}

export function CampaignNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPersonalization, setShowPersonalization] = useState(false);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"canvas" | "preview" | "html">("canvas");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [uploadingImage, setUploadingImage] = useState(false);

  // AI campaign generation
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("Professional");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const [audienceMode, setAudienceMode] = useState<"segment" | "filter" | "individual">("filter");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>({ emailMarketingContact: true });
  const [filterCount, setFilterCount] = useState<number | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [newSegmentName, setNewSegmentName] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);

  const queryClient = useQueryClient();
  const { data: segmentsData } = useListSegments();
  const savedSegments = segmentsData ?? [];
  const createSegmentMutation = useCreateSegment();

  const [sendTiming, setSendTiming] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const createCampaign = useCreateCampaign();
  const { data: contacts } = useListContacts({ page: 1, pageSize: 500 });
  const { data: companiesData } = useListCompanies({ page: 1, pageSize: 200 });

  const getHeaders = useCallback(async () => {
    const { data } = await authClient.getSession();
    return {
      "Authorization": `Bearer ${data?.session?.token ?? ""}`,
      "Content-Type": "application/json",
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (audienceMode === "filter") {
        try {
          const result = await countSegmentFilter({ filter: segmentFilter });
          setFilterCount(result.count);
        } catch { /* ignore */ }
      } else if (audienceMode === "segment" && selectedSegmentId) {
        try {
          const result = await countSegment(selectedSegmentId);
          setFilterCount(result.count);
        } catch { /* ignore */ }
      } else if (audienceMode === "individual") {
        setFilterCount(selectedContacts.size);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [segmentFilter, audienceMode, selectedSegmentId, selectedContacts]);

  const activeBlock = blocks.find(b => b.id === activeBlockId) ?? null;
  const generatedHtml = blocksToHtml(blocks);

  const addBlock = (type: BlockType) => {
    const defaults: Partial<Block> =
      type === "header" ? { content: "New Heading", align: "center", fontSize: "lg" } :
      type === "text" ? { content: "Your text here.", align: "left", fontSize: "md" } :
      type === "columns" ? { content: "", col1: "Left column content.", col2: "Right column content.", colRatio: "50-50" } :
      type === "image" ? { content: "", imageUrl: "", imageAlt: "", align: "center" } :
      type === "button" ? { content: "Click Here", url: "https://", align: "center", buttonColor: "#6366f1" } :
      type === "spacer" ? { content: "", spacerHeight: "md" } :
      type === "social" ? { content: "", align: "center" } :
      { content: "" };
    const nb = { id: uid(), type, ...defaults } as Block;
    setBlocks(p => [...p, nb]);
    setActiveBlockId(nb.id);
  };

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks(p => p.map(b => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const removeBlock = (id: string) => { setBlocks(p => p.filter(b => b.id !== id)); setActiveBlockId(null); };
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(p => {
      const i = p.findIndex(b => b.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const a = [...p]; [a[i], a[j]] = [a[j], a[i]]; return a;
    });
  };

  const insertToken = (token: string) => {
    if (!activeBlock) return;
    if (activeBlock.type === "header" || activeBlock.type === "text") {
      updateBlock(activeBlock.id, { content: activeBlock.content + token });
    }
    setShowPersonalization(false);
  };

  const handleSaveSegment = async () => {
    if (!newSegmentName.trim()) return;
    setSavingSegment(true);
    try {
      const seg = await createSegmentMutation.mutateAsync({
        data: { name: newSegmentName.trim(), filter: segmentFilter },
      });
      await queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
      setSelectedSegmentId(seg.id);
      setAudienceMode("segment");
      setNewSegmentName("");
      toast({ title: "Segment saved!" });
    } catch {
      toast({ title: "Failed to save segment", variant: "destructive" });
    } finally {
      setSavingSegment(false);
    }
  };

  const getRecipientIds = async (): Promise<string[]> => {
    if (audienceMode === "individual") return Array.from(selectedContacts);

    const filter: SegmentFilter = audienceMode === "segment" && selectedSegmentId
      ? JSON.parse(savedSegments.find(s => s.id === selectedSegmentId)?.filterJson ?? "{}")
      : segmentFilter;

    try {
      const result = await evaluateSegmentFilter({ filter });
      return result.ids ?? [];
    } catch {
      return [];
    }
  };

  const handleFinish = async (mode: "draft" | "send" | "schedule") => {
    if (!name || !subject || !fromName || !fromEmail) {
      toast({ title: "Missing info", description: "Please fill campaign name, subject, from name and email.", variant: "destructive" });
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    try {
      const htmlContent = generatedHtml;
      const recipientIds = mode !== "draft" ? await getRecipientIds() : [];

      if (mode !== "draft" && recipientIds.length === 0) {
        toast({ title: "No recipients", description: "No contacts match your audience selection.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      const campaign = await createCampaign.mutateAsync({
        data: {
          name, subject, fromName, fromEmail, htmlContent,
          ...(mode === "schedule" && scheduledAt ? {
            status: "SCHEDULED" as const,
            scheduledAt,
            recipientIds,
          } : { status: "DRAFT" as const }),
        },
      });

      if (mode === "send") {
        const headers = await getHeaders();
        const res = await fetch(`/api/campaigns/${campaign.id}/send`, {
          method: "POST", headers,
          body: JSON.stringify({ recipientContactIds: recipientIds }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          toast({ title: "Send failed", description: err.error, variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        toast({ title: "Campaign sent!" });
      } else if (mode === "schedule") {
        toast({ title: "Campaign scheduled!", description: `Will send on ${new Date(scheduledAt).toLocaleString()}` });
      } else {
        toast({ title: "Saved as draft" });
      }
      setLocation("/campaigns");
    } catch {
      toast({ title: "Error", description: "Failed to save campaign.", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    setBlocks(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function generateAiCampaign() {
    if (!aiGoal.trim()) return;
    setAiGenerating(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("/api/campaigns/ai-draft", {
        method: "POST",
        headers,
        body: JSON.stringify({ goal: aiGoal.trim(), tone: aiTone, context: aiContext.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Generation failed");
      }
      const data = await res.json() as { name: string; subject: string; blocks: (Omit<Block, "id"> & { id?: string })[] };
      setName(data.name);
      setSubject(data.subject);
      setBlocks(data.blocks.map((b) => ({ ...b, id: uid(), content: b.content ?? "" })));
      setStep(1);
    } catch (err) {
      toast({ title: "AI generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => step === 0 ? setLocation("/campaigns") : setStep(step - 1)} className="-ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> {step === 0 ? "Campaigns" : "Back"}
          </Button>
          <h1 className="text-2xl font-bold">Create Campaign</h1>
        </div>

        <StepIndicator current={step} />

        {/* ── STEP 0: Template Gallery ── */}
        {step === 0 && (
          <div>
            <p className="text-muted-foreground mb-4">Pick a template to get started, or let AI write the whole thing.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* AI card */}
              <button
                onClick={() => setShowAiPanel((v) => !v)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${showAiPanel ? "border-primary bg-primary/5" : "border-transparent hover:border-primary bg-card hover:shadow-md"}`}
              >
                <div className="w-full rounded border overflow-hidden" style={{ height: 120 }}>
                  <div className="h-2 w-full bg-gradient-to-r from-primary to-violet-500" />
                  <div className="p-3 flex flex-col items-center justify-center h-[calc(100%-8px)] gap-2">
                    <Sparkles className="h-8 w-8 text-primary/40" />
                    <span className="text-[11px] text-muted-foreground text-center">AI will write your email from a brief</span>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Generate with AI
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Describe your goal, AI does the rest</p>
                </div>
              </button>

              {TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => { setBlocks(tpl.blocks.map(b => ({ ...b, id: uid() }))); setStep(1); }}
                  className="text-left p-4 rounded-xl border-2 border-transparent hover:border-primary bg-card transition-all hover:shadow-md"
                >
                  <TemplatePreview color={tpl.color} blocks={tpl.blocks} />
                  <div className="mt-3">
                    <p className="font-semibold text-sm">{tpl.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* AI generation panel */}
            {showAiPanel && (
              <div className="mt-4 border border-dashed border-primary/40 rounded-xl p-5 bg-primary/5 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-primary">Generate with AI</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Campaign goal <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      placeholder="e.g. Announce our new risk analytics feature to mid-market CFOs and book a demo call"
                      value={aiGoal}
                      onChange={(e) => setAiGoal(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tone</label>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    >
                      {["Professional", "Friendly", "Direct", "Urgent"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Context <span className="text-muted-foreground/60">(optional)</span>
                    </label>
                    <Textarea
                      placeholder="e.g. Audience is insurance brokers. Focus on time savings."
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      rows={1}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={generateAiCampaign}
                    disabled={!aiGoal.trim() || aiGenerating}
                    className="gap-2"
                  >
                    {aiGenerating ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5" /> Generate campaign</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    AI writes the name, subject, and email blocks — you can edit everything after.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 1: Email Builder ── */}
        {step === 1 && (
          <div className="grid grid-cols-[240px_1fr_280px] gap-4 items-start">
            {/* Left: palette + campaign info */}
            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign Info</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div><Label className="text-xs">Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Q3 Newsletter" className="h-8 text-sm mt-1" /></div>
                  <div><Label className="text-xs">Subject *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Exciting news inside!" className="h-8 text-sm mt-1" /></div>
                  <div><Label className="text-xs">From Name *</Label><Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Ennabl" className="h-8 text-sm mt-1" /></div>
                  <div><Label className="text-xs">From Email *</Label><Input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hello@ennabl.com" className="h-8 text-sm mt-1" /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Add Block</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BLOCK_PALETTE.map(({ type, label, icon }) => (
                      <button key={type} onClick={() => addBlock(type)} className="flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs hover:bg-accent hover:border-primary transition-colors text-left">
                        <span className="text-muted-foreground">{icon}</span> {label}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Center: canvas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1 bg-muted p-1 rounded-lg">
                  <button onClick={() => setPreviewMode("canvas")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === "canvas" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>✏️ Edit</button>
                  <button onClick={() => setPreviewMode("preview")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === "preview" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>👁 Preview</button>
                  <button onClick={() => setPreviewMode("html")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${previewMode === "html" ? "bg-white shadow-sm" : "text-muted-foreground"}`}><Code className="h-3 w-3" /> HTML</button>
                </div>
                {previewMode === "preview" && (
                  <div className="flex gap-1 bg-muted p-1 rounded-lg">
                    <button onClick={() => setPreviewWidth("desktop")} className={`px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${previewWidth === "desktop" ? "bg-white shadow-sm" : "text-muted-foreground"}`}><Monitor className="h-3 w-3" /> Desktop</button>
                    <button onClick={() => setPreviewWidth("mobile")} className={`px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${previewWidth === "mobile" ? "bg-white shadow-sm" : "text-muted-foreground"}`}><Smartphone className="h-3 w-3" /> Mobile</button>
                  </div>
                )}
                <Button onClick={() => { if (!name || !subject || !fromName || !fromEmail) { toast({ title: "Fill campaign info first", variant: "destructive" }); return; } setStep(2); }} size="sm">
                  Audience <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {previewMode === "canvas" && (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="rounded-xl border bg-muted/30 p-4 min-h-[600px]">
                    {blocks.length === 0 && (
                      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm opacity-50">
                        Click a block type on the left to add it
                      </div>
                    )}
                    <Droppable droppableId="campaign-blocks">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                          {blocks.map((block, idx) => (
                            <Draggable key={block.id} draggableId={block.id} index={idx}>
                              {(draggable, snapshot) => (
                                <div
                                  ref={draggable.innerRef}
                                  {...draggable.draggableProps}
                                  onClick={() => setActiveBlockId(block.id)}
                                  className={`group relative flex items-stretch rounded-lg border-2 bg-white dark:bg-card transition-colors ${snapshot.isDragging ? "shadow-lg border-primary/40" : activeBlockId === block.id ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
                                >
                                  {/* drag handle */}
                                  <div
                                    {...draggable.dragHandleProps}
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center px-1.5 text-muted-foreground/25 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                                    title="Drag to reorder"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>

                                  {/* block content */}
                                  <div className="flex-1 py-3 pr-3 min-w-0">
                                    {block.type === "header" && (
                                      <div style={{ textAlign: block.align ?? "center", color: block.color || "#111", fontSize: FONT_SIZES[block.fontSize ?? "lg"].px, fontWeight: 700, lineHeight: 1.3 }} className="truncate">
                                        {block.content || <span className="text-muted-foreground">Heading</span>}
                                      </div>
                                    )}
                                    {block.type === "text" && (
                                      <p style={{ textAlign: block.align ?? "left", color: block.color || "#444", fontSize: FONT_SIZES[block.fontSize ?? "md"].px, lineHeight: 1.6 }} className="text-sm whitespace-pre-wrap">
                                        {block.content || <span className="text-muted-foreground">Text block</span>}
                                      </p>
                                    )}
                                    {block.type === "columns" && (
                                      <div className="grid gap-2" style={{ gridTemplateColumns: block.colRatio === "60-40" ? "3fr 2fr" : block.colRatio === "40-60" ? "2fr 3fr" : "1fr 1fr" }}>
                                        <div className="rounded border border-dashed border-muted-foreground/20 p-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/20">{block.col1 || "Left column"}</div>
                                        <div className="rounded border border-dashed border-muted-foreground/20 p-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/20">{block.col2 || "Right column"}</div>
                                      </div>
                                    )}
                                    {block.type === "image" && (
                                      block.imageUrl
                                        ? <img src={block.imageUrl} alt={block.imageAlt} className="max-w-full rounded" />
                                        : <div className="h-20 bg-muted rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground text-sm"><Image className="h-5 w-5 mr-2" /> Add image URL in panel →</div>
                                    )}
                                    {block.type === "button" && (
                                      <div style={{ textAlign: block.align ?? "center" }}>
                                        <span className="inline-block px-5 py-2.5 text-sm font-semibold rounded-md text-white" style={{ background: block.buttonColor || "#6366f1" }}>
                                          {block.content || "Button"}
                                        </span>
                                      </div>
                                    )}
                                    {block.type === "divider" && <Separator />}
                                    {block.type === "spacer" && (
                                      <div className="flex items-center justify-center text-xs text-muted-foreground py-1">
                                        <Maximize2 className="h-3 w-3 mr-1" /> Spacer ({block.spacerHeight ?? "md"})
                                      </div>
                                    )}
                                    {block.type === "social" && (
                                      <div style={{ textAlign: block.align ?? "center" }} className="text-xs text-muted-foreground space-x-3">
                                        <span>LinkedIn</span><span>X / Twitter</span><span>Website</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* action toolbar */}
                                  <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-background border rounded-md px-1 shadow-sm z-10">
                                    <button onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} disabled={idx === 0} className="p-1 hover:bg-muted rounded disabled:opacity-30 text-xs" title="Move up">▲</button>
                                    <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} disabled={idx === blocks.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-30 text-xs" title="Move down">▼</button>
                                    <button
                                      onClick={e => { e.stopPropagation(); const nb = { ...block, id: uid() }; setBlocks(p => { const i = p.findIndex(b => b.id === block.id); const a = [...p]; a.splice(i + 1, 0, nb); return a; }); setActiveBlockId(nb.id); }}
                                      className="flex items-center gap-1 px-1.5 py-1 hover:bg-muted rounded text-xs text-muted-foreground"
                                      title="Duplicate block"
                                    >
                                      <Copy className="h-3 w-3" /> Duplicate
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); removeBlock(block.id); }} className="p-1 hover:bg-red-50 text-destructive rounded text-xs" title="Delete"><Trash2 className="h-3 w-3" /></button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                    <div className="rounded-lg border bg-muted/30 p-3 text-center text-xs text-muted-foreground mt-2">
                      🔒 Unsubscribe footer — always included
                    </div>
                  </div>
                </DragDropContext>
              )}

              {previewMode === "preview" && (
                <div className="rounded-xl border overflow-hidden bg-[#f9fafb] flex justify-center p-4" style={{ minHeight: 600 }}>
                  <div style={{ width: previewWidth === "mobile" ? 375 : "100%", transition: "width 0.2s ease" }}>
                    <iframe
                      srcDoc={generatedHtml}
                      title="Email preview"
                      className="w-full"
                      style={{ height: 650, border: "none", display: "block" }}
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}

              {previewMode === "html" && (
                <div className="rounded-xl border overflow-hidden" style={{ minHeight: 600 }}>
                  <div className="bg-muted/50 border-b px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Generated HTML</span>
                    <button onClick={() => { navigator.clipboard.writeText(generatedHtml); toast({ title: "Copied!" }); }} className="text-xs text-primary hover:underline">Copy</button>
                  </div>
                  <Textarea
                    readOnly
                    value={generatedHtml}
                    className="font-mono text-xs resize-none border-0 rounded-none bg-background"
                    style={{ height: 580 }}
                  />
                </div>
              )}
            </div>

            {/* Right: property panel */}
            <div className="space-y-3">
              {activeBlock ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      Edit {BLOCK_PALETTE.find(b => b.type === activeBlock.type)?.label ?? activeBlock.type}
                      <button onClick={() => removeBlock(activeBlock.id)} className="text-destructive hover:bg-destructive/10 rounded p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {(activeBlock.type === "header" || activeBlock.type === "text") && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs">Content</Label>
                            <div className="relative">
                              <button onClick={() => setShowPersonalization(p => !p)} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Smile className="h-3 w-3" /> Personalize
                              </button>
                              {showPersonalization && (
                                <div className="absolute right-0 top-6 z-20 bg-popover border rounded-lg shadow-lg p-2 space-y-1 w-36">
                                  {PERSONALIZATION_TOKENS.map(t => (
                                    <button key={t.token} onClick={() => insertToken(t.token)} className="block w-full text-left text-xs px-2 py-1.5 hover:bg-accent rounded">
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {activeBlock.type === "text"
                            ? <Textarea value={activeBlock.content} onChange={e => updateBlock(activeBlock.id, { content: e.target.value })} rows={4} className="text-sm" />
                            : <Input value={activeBlock.content} onChange={e => updateBlock(activeBlock.id, { content: e.target.value })} className="text-sm h-8" />}
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Font Size</Label>
                          <div className="grid grid-cols-4 gap-1">
                            {(["sm", "md", "lg", "xl"] as FontSize[]).map(s => (
                              <button key={s} onClick={() => updateBlock(activeBlock.id, { fontSize: s })} className={`py-1 text-xs rounded border font-medium ${activeBlock.fontSize === s ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>
                                {FONT_SIZES[s].label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Alignment</Label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["left", "center", "right"] as const).map(a => (
                              <button key={a} onClick={() => updateBlock(activeBlock.id, { align: a })} className={`py-1 text-xs rounded border capitalize ${activeBlock.align === a ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{a}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Text Color</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={activeBlock.color || "#333333"} onChange={e => updateBlock(activeBlock.id, { color: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                            <span className="text-xs text-muted-foreground">{activeBlock.color || "#333333"}</span>
                          </div>
                        </div>
                      </>
                    )}
                    {activeBlock.type === "columns" && (
                      <>
                        <div>
                          <Label className="text-xs mb-1.5 block">Column Ratio</Label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["50-50", "60-40", "40-60"] as ColRatio[]).map(r => (
                              <button key={r} onClick={() => updateBlock(activeBlock.id, { colRatio: r })} className={`py-1 text-xs rounded border ${activeBlock.colRatio === r ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{r}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs mb-1">Left Column</Label>
                          <Textarea value={activeBlock.col1 ?? ""} onChange={e => updateBlock(activeBlock.id, { col1: e.target.value })} rows={3} className="text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs mb-1">Right Column</Label>
                          <Textarea value={activeBlock.col2 ?? ""} onChange={e => updateBlock(activeBlock.id, { col2: e.target.value })} rows={3} className="text-xs" />
                        </div>
                      </>
                    )}
                    {activeBlock.type === "image" && (
                      <>
                        <div>
                          <Label className="text-xs mb-1.5 block">Upload Image</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="image/*"
                              id={`img-upload-${activeBlock.id}`}
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingImage(true);
                                try {
                                  const headers = await getHeaders();
                                  const r1 = await fetch("/api/storage/uploads/request-url", {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                                  });
                                  if (!r1.ok) throw new Error("Failed to get upload URL");
                                  const { uploadURL, objectPath } = await r1.json();
                                  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                                  updateBlock(activeBlock.id, { imageUrl: `/api/storage${objectPath}` });
                                } catch {
                                  toast({ title: "Upload failed", variant: "destructive" });
                                } finally {
                                  setUploadingImage(false);
                                  (document.getElementById(`img-upload-${activeBlock.id}`) as HTMLInputElement).value = "";
                                }
                              }}
                            />
                            <Button
                              size="sm" variant="outline"
                              onClick={() => document.getElementById(`img-upload-${activeBlock.id}`)?.click()}
                              disabled={uploadingImage}
                              className="text-xs"
                            >
                              {uploadingImage ? "Uploading…" : "📁 Upload file"}
                            </Button>
                            {activeBlock.imageUrl && (
                              <button onClick={() => updateBlock(activeBlock.id, { imageUrl: "" })} className="text-xs text-destructive hover:underline">Clear</button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex-1 h-px bg-border" />
                          <span>or paste URL</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div><Label className="text-xs">Image URL</Label><Input value={activeBlock.imageUrl ?? ""} onChange={e => updateBlock(activeBlock.id, { imageUrl: e.target.value })} placeholder="https://..." className="text-sm h-8 mt-1" /></div>
                        <div><Label className="text-xs">Alt Text</Label><Input value={activeBlock.imageAlt ?? ""} onChange={e => updateBlock(activeBlock.id, { imageAlt: e.target.value })} placeholder="Describe the image" className="text-sm h-8 mt-1" /></div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Alignment</Label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["left", "center", "right"] as const).map(a => (
                              <button key={a} onClick={() => updateBlock(activeBlock.id, { align: a })} className={`py-1 text-xs rounded border capitalize ${activeBlock.align === a ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{a}</button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {activeBlock.type === "button" && (
                      <>
                        <div><Label className="text-xs">Button Text</Label><Input value={activeBlock.content} onChange={e => updateBlock(activeBlock.id, { content: e.target.value })} className="text-sm h-8 mt-1" /></div>
                        <div><Label className="text-xs">URL</Label><Input value={activeBlock.url ?? ""} onChange={e => updateBlock(activeBlock.id, { url: e.target.value })} placeholder="https://" className="text-sm h-8 mt-1" /></div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Alignment</Label>
                          <div className="grid grid-cols-3 gap-1">
                            {(["left", "center", "right"] as const).map(a => (
                              <button key={a} onClick={() => updateBlock(activeBlock.id, { align: a })} className={`py-1 text-xs rounded border capitalize ${activeBlock.align === a ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{a}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs mb-1.5 block">Button Color</Label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={activeBlock.buttonColor || "#6366f1"} onChange={e => updateBlock(activeBlock.id, { buttonColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                            <span className="text-xs text-muted-foreground">{activeBlock.buttonColor || "#6366f1"}</span>
                          </div>
                        </div>
                      </>
                    )}
                    {activeBlock.type === "spacer" && (
                      <div>
                        <Label className="text-xs mb-1.5 block">Height</Label>
                        <div className="grid grid-cols-3 gap-1">
                          {(["sm", "md", "lg"] as SpacerHeight[]).map(h => (
                            <button key={h} onClick={() => updateBlock(activeBlock.id, { spacerHeight: h })} className={`py-1 text-xs rounded border capitalize ${activeBlock.spacerHeight === h ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{h}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeBlock.type === "social" && (
                      <div>
                        <Label className="text-xs mb-1.5 block">Alignment</Label>
                        <div className="grid grid-cols-3 gap-1">
                          {(["left", "center", "right"] as const).map(a => (
                            <button key={a} onClick={() => updateBlock(activeBlock.id, { align: a })} className={`py-1 text-xs rounded border capitalize ${activeBlock.align === a ? "bg-primary text-primary-foreground border-primary" : "border-muted hover:bg-muted"}`}>{a}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  <Type className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  Click a block to edit its properties
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: Audience ── */}
        {step === 2 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Choose Your Audience</CardTitle>
                {filterCount !== null && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{filterCount}</span> contacts will receive this email
                    {segmentFilter.emailMarketingContact && audienceMode === "filter" && (
                      <span className="ml-1">· unsubscribed contacts excluded</span>
                    )}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {([
                    { key: "filter", label: "Build a filter", icon: <Tag className="h-4 w-4" /> },
                    { key: "segment", label: "Saved segments", icon: <User className="h-4 w-4" /> },
                    { key: "individual", label: "Pick contacts", icon: <Users className="h-4 w-4" /> },
                  ] as { key: typeof audienceMode; label: string; icon: React.ReactNode }[]).map(opt => (
                    <button key={opt.key} onClick={() => setAudienceMode(opt.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${audienceMode === opt.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {audienceMode === "filter" && (
                  <div className="space-y-3 p-4 rounded-lg bg-muted/30 border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Contact Status</Label>
                        <select value={segmentFilter.status ?? ""} onChange={e => setSegmentFilter(p => ({ ...p, status: e.target.value || undefined }))} className="w-full mt-1 h-9 rounded-md border bg-background px-3 text-sm">
                          <option value="">Any status</option>
                          {CONTACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Tags (comma-separated)</Label>
                        <Input
                          value={(segmentFilter.tags ?? []).join(", ")}
                          onChange={e => setSegmentFilter(p => ({ ...p, tags: e.target.value ? e.target.value.split(",").map(t => t.trim()).filter(Boolean) : [] }))}
                          placeholder="enterprise, vip"
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Company</Label>
                        <select
                          value={segmentFilter.companyId ?? ""}
                          onChange={e => setSegmentFilter(p => ({ ...p, companyId: e.target.value || undefined }))}
                          className="w-full mt-1 h-9 rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">Any company</option>
                          {companiesData?.data?.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="em-contact" checked={segmentFilter.emailMarketingContact ?? false} onChange={e => setSegmentFilter(p => ({ ...p, emailMarketingContact: e.target.checked || undefined }))} className="h-4 w-4 rounded" />
                      <Label htmlFor="em-contact" className="text-sm cursor-pointer">Email marketing contacts only (recommended)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="ennabl-user" checked={segmentFilter.ennablUser ?? false} onChange={e => setSegmentFilter(p => ({ ...p, ennablUser: e.target.checked || undefined }))} className="h-4 w-4 rounded" />
                      <Label htmlFor="ennabl-user" className="text-sm cursor-pointer">Ennabl users only</Label>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <Input value={newSegmentName} onChange={e => setNewSegmentName(e.target.value)} placeholder="Save filter as segment…" className="h-8 text-sm flex-1" />
                      <Button size="sm" variant="outline" onClick={handleSaveSegment} disabled={!newSegmentName.trim() || savingSegment}>
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                )}

                {audienceMode === "segment" && (
                  <div className="space-y-2">
                    {savedSegments.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 text-center bg-muted/30 rounded-lg space-y-2">
                        <p>No saved segments yet. Switch to "Build a filter" to create one.</p>
                        <Link href="/segments" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" /> Manage segments
                        </Link>
                      </div>
                    ) : (
                      <>
                        {savedSegments.map(seg => {
                          const chips = filterSummaryChips(seg.filterJson);
                          return (
                            <button
                              key={seg.id}
                              onClick={() => setSelectedSegmentId(prev => prev === seg.id ? null : seg.id)}
                              className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedSegmentId === seg.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{seg.name}</span>
                                  <SegmentCountInline id={seg.id} />
                                </div>
                                {selectedSegmentId === seg.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                              </div>
                              {chips.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {chips.map((c, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs font-normal gap-1 py-0">
                                      {c.icon} {c.label}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No filters — all contacts</span>
                              )}
                            </button>
                          );
                        })}
                        <div className="pt-1 flex justify-end">
                          <Link href="/segments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> Manage segments
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {audienceMode === "individual" && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 flex items-center justify-between border-b">
                      <button onClick={() => {
                        if (!contacts?.data) return;
                        setSelectedContacts(selectedContacts.size === contacts.data.length ? new Set() : new Set(contacts.data.map(c => c.id)));
                      }} className="text-xs text-primary hover:underline">
                        {contacts?.data && selectedContacts.size === contacts.data.length ? "Deselect all" : "Select all"}
                      </button>
                      <span className="text-xs text-muted-foreground">{selectedContacts.size} selected</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {contacts?.data?.map(c => (
                        <div key={c.id} onClick={() => {
                          const s = new Set(selectedContacts);
                          s.has(c.id) ? s.delete(c.id) : s.add(c.id);
                          setSelectedContacts(s);
                        }} className={`flex items-center gap-3 p-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 ${selectedContacts.has(c.id) ? "bg-primary/5" : ""}`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedContacts.has(c.id) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                            {selectedContacts.has(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep(3)}>Timing <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Timing ── */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" /> When to Send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSendTiming("now")} className={`p-4 rounded-xl border-2 text-left transition-colors ${sendTiming === "now" ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}>
                    <Send className="h-5 w-5 mb-2 text-primary" />
                    <p className="font-semibold text-sm">Send Now</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Deliver immediately to your audience</p>
                  </button>
                  <button onClick={() => setSendTiming("schedule")} className={`p-4 rounded-xl border-2 text-left transition-colors ${sendTiming === "schedule" ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}>
                    <Calendar className="h-5 w-5 mb-2 text-primary" />
                    <p className="font-semibold text-sm">Schedule for Later</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pick a date and time to send</p>
                  </button>
                </div>

                {sendTiming === "schedule" && (
                  <div className="p-4 rounded-xl bg-muted/30 border space-y-2">
                    <Label className="text-sm font-medium">Send Date & Time</Label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      onChange={e => setScheduledAt(e.target.value)}
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    />
                    {scheduledAt && (
                      <p className="text-xs text-muted-foreground">Will send on {new Date(scheduledAt).toLocaleString()}</p>
                    )}
                  </div>
                )}

                <div className="bg-muted/30 rounded-xl p-4 space-y-1 border text-sm">
                  <p className="font-medium">Campaign Summary</p>
                  <p className="text-muted-foreground">Name: <span className="text-foreground">{name || "—"}</span></p>
                  <p className="text-muted-foreground">Subject: <span className="text-foreground">{subject || "—"}</span></p>
                  <p className="text-muted-foreground">From: <span className="text-foreground">{fromName} &lt;{fromEmail}&gt;</span></p>
                  <p className="text-muted-foreground">Blocks: <span className="text-foreground">{blocks.length}</span></p>
                  {filterCount !== null && <p className="text-muted-foreground">Audience: <span className="text-foreground">{filterCount} contacts</span></p>}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button variant="ghost" onClick={() => handleFinish("draft")} disabled={isSubmitting}>
                  <Save className="h-4 w-4 mr-1" /> Save Draft
                </Button>
              </div>
              <Button
                onClick={() => handleFinish(sendTiming === "now" ? "send" : "schedule")}
                disabled={isSubmitting || (sendTiming === "schedule" && !scheduledAt)}
                className="min-w-36"
              >
                {isSubmitting ? "Saving…" : sendTiming === "now"
                  ? <><Send className="h-4 w-4 mr-2" /> Send Campaign</>
                  : <><Calendar className="h-4 w-4 mr-2" /> Schedule</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
