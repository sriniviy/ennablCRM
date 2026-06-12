import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Unlink,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Braces,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function normalizeToHtml(value: string): string {
  if (!value) return "<p></p>";
  if (/<[^>]+>/.test(value)) return value;
  return (
    value
      .split(/\n\n+/)
      .filter((p) => p.trim())
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("") || "<p></p>"
  );
}

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      title={title}
      disabled={disabled}
      className={cn(
        "h-6 w-6 flex items-center justify-center rounded text-[11px] transition-colors shrink-0",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "opacity-30 cursor-default pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-4 bg-border shrink-0 mx-0.5" />;
}

interface RichEmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  tokens?: readonly { token: string; label: string }[];
  className?: string;
  minHeight?: string;
}

export function RichEmailEditor({
  value,
  onChange,
  placeholder = "Write your email body…",
  tokens,
  className,
  minHeight = "140px",
}: RichEmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      TiptapUnderline,
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: normalizeToHtml(value),
    onUpdate({ editor }) {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeToHtml(value);
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, { emitUpdate: false } as Parameters<typeof editor.commands.setContent>[1]);
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = (editor.getAttributes("link").href as string) || "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = url.startsWith("http") ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden ring-offset-background transition-colors",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 select-none">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Sep />

        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          <span className="font-bold text-[10px] leading-none">H2</span>
        </ToolbarBtn>

        <Sep />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Sep />

        <ToolbarBtn
          onClick={setLink}
          active={editor.isActive("link")}
          title={editor.isActive("link") ? "Edit link" : "Insert link"}
        >
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        {editor.isActive("link") && (
          <ToolbarBtn
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove link"
          >
            <Unlink className="h-3.5 w-3.5" />
          </ToolbarBtn>
        )}

        <Sep />

        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <Sep />

        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarBtn>

        {tokens && tokens.length > 0 && (
          <>
            <Sep />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Braces className="h-3 w-3" />
                  Token
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {tokens.map(({ token, label }) => (
                  <DropdownMenuItem
                    key={token}
                    onSelect={() => {
                      editor.chain().focus().insertContent(token).run();
                    }}
                    className="gap-3"
                  >
                    <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 shrink-0">
                      {token}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="rich-email-editor-content"
        style={{ minHeight }}
      />

      {/* Footer */}
      <div className="px-3 py-1 border-t bg-muted/10 flex items-center justify-end">
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {charCount} chars
        </span>
      </div>
    </div>
  );
}
