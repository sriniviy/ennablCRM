import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useRef, useCallback } from "react";
import { useCreateCampaign, useListContacts } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Check, Plus, Trash2, GripVertical, Type, AlignLeft, MousePointer, Minus, Eye, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

type BlockType = "header" | "text" | "button" | "divider";

interface Block {
  id: string;
  type: BlockType;
  content: string;
  url?: string;
  align?: "left" | "center" | "right";
}

const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_BLOCKS: Block[] = [
  { id: uid(), type: "header", content: "Hello {{firstName}}!", align: "center" },
  { id: uid(), type: "text", content: "We have some exciting news to share with you.", align: "left" },
  { id: uid(), type: "button", content: "Learn More", url: "https://example.com", align: "center" },
];

const blocksToHtml = (blocks: Block[]): string => {
  const rows = blocks.map(b => {
    const align = b.align ?? "left";
    switch (b.type) {
      case "header":
        return `<tr><td style="padding:24px 40px;text-align:${align};"><h1 style="margin:0;font-family:Arial,sans-serif;font-size:28px;font-weight:700;color:#111;">${b.content}</h1></td></tr>`;
      case "text":
        return `<tr><td style="padding:8px 40px;text-align:${align};"><p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#444;line-height:1.6;">${b.content}</p></td></tr>`;
      case "button":
        return `<tr><td style="padding:20px 40px;text-align:${align};"><a href="${b.url || "#"}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">${b.content}</a></td></tr>`;
      case "divider":
        return `<tr><td style="padding:12px 40px;"><hr style="border:none;border-top:1px solid #e5e7eb;" /></td></tr>`;
      default:
        return "";
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 0;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tbody>
${rows}
<tr><td style="padding:24px 40px;text-align:center;"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;">You received this email because you're on our list. <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a></p></td></tr>
</tbody>
</table>
</body></html>`;
};

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  header: <Type className="h-4 w-4" />,
  text: <AlignLeft className="h-4 w-4" />,
  button: <MousePointer className="h-4 w-4" />,
  divider: <Minus className="h-4 w-4" />,
};

const BLOCK_LABELS: Record<BlockType, string> = {
  header: "Heading",
  text: "Text",
  button: "Button",
  divider: "Divider",
};

export function CampaignNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"edit" | "preview" | "html">("edit");

  const { data: contacts } = useListContacts({ page: 1, pageSize: 200 });
  const createCampaign = useCreateCampaign();
  const createFnRef = useRef(createCampaign.mutateAsync);
  createFnRef.current = createCampaign.mutateAsync;

  const addBlock = (type: BlockType) => {
    const defaults: Partial<Block> =
      type === "header" ? { content: "New heading", align: "center" } :
      type === "text" ? { content: "Your text here.", align: "left" } :
      type === "button" ? { content: "Click here", url: "https://", align: "center" } :
      { content: "" };
    const newBlock = { id: uid(), type, ...defaults } as Block;
    setBlocks(prev => [...prev, newBlock]);
    setActiveBlockId(newBlock.id);
  };

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setActiveBlockId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const htmlContent = blocksToHtml(blocks);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !fromName || !fromEmail) {
      toast({ title: "Validation error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    if (blocks.length === 0) {
      toast({ title: "Empty email", description: "Add at least one content block.", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleToggleContact = (id: string) => {
    const s = new Set(selectedContacts);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedContacts(s);
  };

  const handleSelectAll = () => {
    if (!contacts?.data) return;
    setSelectedContacts(selectedContacts.size === contacts.data.length ? new Set() : new Set(contacts.data.map(c => c.id)));
  };

  const handleSave = async () => {
    if (selectedContacts.size === 0) {
      toast({ title: "No recipients", description: "Select at least one contact.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await createFnRef.current({ data: { name, subject, fromName, fromEmail, htmlContent } });
      toast({ title: "Campaign saved!", description: "Configure RESEND_API_KEY to enable sending." });
      setLocation("/campaigns");
    } catch {
      toast({ title: "Error", description: "Failed to create campaign.", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" onClick={() => step === 2 ? setStep(1) : setLocation("/campaigns")} className="mb-2 -ml-3 text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> {step === 2 ? "Back to editor" : "Back to campaigns"}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Create Campaign</h1>
          <p className="text-muted-foreground">{step === 1 ? "Design your email." : "Select recipients."}</p>
        </div>

        {step === 1 && (
          <form onSubmit={handleNext}>
            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
              {/* Left: settings + block controls */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Campaign Info</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="cn-name">Internal Name *</Label>
                      <Input id="cn-name" value={name} onChange={e => setName(e.target.value)} placeholder="Q3 Newsletter" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cn-subject">Subject Line *</Label>
                      <Input id="cn-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Exciting news inside!" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cn-fn">From Name *</Label>
                        <Input id="cn-fn" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Acme" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cn-fe">From Email *</Label>
                        <Input id="cn-fe" type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hello@acme.com" required />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Add Block</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {(["header", "text", "button", "divider"] as BlockType[]).map(type => (
                        <Button key={type} type="button" variant="outline" size="sm" className="justify-start gap-2" onClick={() => addBlock(type)}>
                          {BLOCK_ICONS[type]} {BLOCK_LABELS[type]}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {activeBlock && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        Edit {BLOCK_LABELS[activeBlock.type]}
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeBlock(activeBlock.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeBlock.type !== "divider" && (
                        <div className="space-y-1.5">
                          <Label>Content</Label>
                          {activeBlock.type === "text" ? (
                            <Textarea
                              value={activeBlock.content}
                              onChange={e => updateBlock(activeBlock.id, { content: e.target.value })}
                              rows={4}
                            />
                          ) : (
                            <Input
                              value={activeBlock.content}
                              onChange={e => updateBlock(activeBlock.id, { content: e.target.value })}
                            />
                          )}
                        </div>
                      )}
                      {activeBlock.type === "button" && (
                        <div className="space-y-1.5">
                          <Label>Button URL</Label>
                          <Input
                            value={activeBlock.url ?? ""}
                            onChange={e => updateBlock(activeBlock.id, { url: e.target.value })}
                            placeholder="https://"
                          />
                        </div>
                      )}
                      {activeBlock.type !== "divider" && (
                        <div className="space-y-1.5">
                          <Label>Alignment</Label>
                          <div className="flex gap-1">
                            {(["left", "center", "right"] as const).map(a => (
                              <Button
                                key={a} type="button" variant={activeBlock.align === a ? "default" : "outline"}
                                size="sm" className="flex-1 text-xs capitalize"
                                onClick={() => updateBlock(activeBlock.id, { align: a })}
                              >
                                {a}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: canvas + preview */}
              <div className="flex flex-col gap-4">
                <Tabs value={previewTab} onValueChange={v => setPreviewTab(v as typeof previewTab)}>
                  <div className="flex items-center justify-between mb-3">
                    <TabsList>
                      <TabsTrigger value="edit" className="gap-1.5"><GripVertical className="h-3.5 w-3.5" /> Canvas</TabsTrigger>
                      <TabsTrigger value="preview" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Preview</TabsTrigger>
                      <TabsTrigger value="html" className="gap-1.5"><Code className="h-3.5 w-3.5" /> HTML</TabsTrigger>
                    </TabsList>
                    <Button type="submit" size="sm">Continue to Recipients →</Button>
                  </div>

                  <TabsContent value="edit">
                    <div className="rounded-xl border bg-muted/30 p-4 min-h-[500px] space-y-2">
                      {blocks.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                          <Plus className="h-8 w-8 mb-2 opacity-30" />
                          Add a block from the panel to get started
                        </div>
                      )}
                      {blocks.map((block, idx) => (
                        <div
                          key={block.id}
                          className={`group relative rounded-lg border-2 transition-colors cursor-pointer p-3 bg-white dark:bg-card ${activeBlockId === block.id ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}
                          onClick={() => setActiveBlockId(block.id)}
                        >
                          <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveBlock(block.id, -1); }} disabled={idx === 0}>▲</Button>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); moveBlock(block.id, 1); }} disabled={idx === blocks.length - 1}>▼</Button>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}><Trash2 className="h-3 w-3" /></Button>
                          </div>

                          {block.type === "header" && (
                            <h2 style={{ textAlign: block.align ?? "center" }} className="text-2xl font-bold leading-tight truncate">{block.content || <span className="text-muted-foreground">Heading</span>}</h2>
                          )}
                          {block.type === "text" && (
                            <p style={{ textAlign: block.align ?? "left" }} className="text-sm leading-relaxed whitespace-pre-wrap">{block.content || <span className="text-muted-foreground">Text paragraph</span>}</p>
                          )}
                          {block.type === "button" && (
                            <div style={{ textAlign: block.align ?? "center" }}>
                              <span className="inline-block px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md">
                                {block.content || "Button"}
                              </span>
                            </div>
                          )}
                          {block.type === "divider" && <Separator />}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="preview">
                    <div className="rounded-xl border overflow-hidden bg-[#f9fafb]" style={{ minHeight: 500 }}>
                      <iframe
                        srcDoc={htmlContent}
                        title="Email preview"
                        className="w-full"
                        style={{ height: 600, border: "none" }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="html">
                    <div className="rounded-xl border overflow-hidden" style={{ minHeight: 500 }}>
                      <Textarea
                        value={htmlContent}
                        readOnly
                        className="h-[600px] font-mono text-xs resize-none rounded-none border-0"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </form>
        )}

        {step === 2 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Select Recipients</CardTitle>
              <div className="text-sm text-muted-foreground font-medium">{selectedContacts.size} selected</div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted/50 p-3 flex items-center justify-between border-b">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    {contacts?.data && selectedContacts.size === contacts.data.length ? "Deselect All" : "Select All"}
                  </Button>
                  <span className="text-sm text-muted-foreground">{contacts?.data?.length ?? 0} contacts</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {contacts?.data?.map(contact => {
                    const isSelected = selectedContacts.has(contact.id);
                    return (
                      <div
                        key={contact.id}
                        className={`flex items-center justify-between p-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => handleToggleContact(contact.id)}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{contact.firstName} {contact.lastName}</span>
                          <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-6">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleSave} disabled={isSubmitting || selectedContacts.size === 0}>
                {isSubmitting ? "Saving…" : "Save Campaign"}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </SidebarLayout>
  );
}
