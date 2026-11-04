import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { UndoRedo } from "@tiptap/extensions";
import { toDoc, fromDoc } from "@/lib/richTextDoc";
import { DeviceTokenNode, DEVICE_TOKEN_CHOICES } from "./DeviceTokenNode";
import type { RichTextFieldProps } from "./RichTextField";

///  +-----------------------------------------------------------------+
///  |             BOLD, ITALIC, LINKS — AND NOTHING ELSE              |
///  +-----------------------------------------------------------------+
//
//  THE EXTENSION LIST IS THE FEATURE LIST. StarterKit would have been one
//  import instead of eight, and would have brought headings, lists, block
//  quotes, code blocks, horizontal rules and strikethrough with it — every
//  one of them a construct the stored format cannot express and the reader
//  cannot render. An author would find them in the editor, use them, and lose
//  their work on save. Naming each extension makes the editor's capabilities
//  and the format's capabilities the same list.
//
//  ONE PARAGRAPH. `Document.extend({ content: "paragraph" })` — the schema
//  stores one string per field and the reader puts it in one <p>, so Enter
//  must not be able to make a second one.
//
//  IT IS LOADED LAZILY, from RichTextField. Tiptap is ~147 kB gzipped against
//  an app bundle of 285 kB, and only admins in edit mode ever need it.
///  +-----------------------------------------------------------------+

/** Mirrors linkSchema on the server. The gate refuses the rest at publish. */
const SAFE_HREF = /^https?:\/\//i;

/**
 * A toolbar control.
 *
 * `wide` is the difference between a control holding a glyph and one holding
 * a word. The mark buttons are single characters and want to be square; the
 * token buttons say "devices", which does not fit in a square and overflowed
 * into its neighbour when they shared one size. Sized by content rather than
 * fixed, with a minimum so B and I still read as buttons.
 */
function ToolbarButton({
  onClick,
  active,
  label,
  wide = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown, not onClick: a click moves focus out of the editor first,
      // which collapses the selection the command is about to act on.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-6.5 shrink-0 cursor-pointer items-center justify-center rounded-6 border-0 font-sans outline-none focus-visible:outline-2 focus-visible:outline-brand ${
        wide ? "px-2 fs-11 font-medium" : "min-w-6.5 px-1.75 fs-12"
      } ${active ? "bg-brand-sub text-brand-tx" : "bg-transparent text-tx2 hover:bg-hover"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, hint }: { editor: Editor; hint?: string }) {
  const setLink = () => {
    const existing = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link address (http:// or https://)", existing ?? "https://");

    // Cancelled. Distinct from an empty string, which means "remove it".
    if (input === null) return;

    const href = input.trim();

    if (!href) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    if (!SAFE_HREF.test(href)) {
      // Refused here as well as at publish, because being told at the moment
      // you typed it is the only feedback that names the thing you did.
      window.alert("Links have to start with http:// or https://.");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line2 bg-subtle px-1.5 py-1">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <span className="italic font-serif">I</span>
      </ToolbarButton>
      <ToolbarButton onClick={setLink} active={editor.isActive("link")} label="Link">
        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>
          link
        </span>
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-line" />

      {/* The tokens, spelled out rather than hidden behind a menu. They are
          the reason an author uses this editor differently from any other,
          and a writer who cannot see them will write "your phone" into an
          article that is also listed under tablets. */}
      {DEVICE_TOKEN_CHOICES.map((token) => (
        <ToolbarButton
          key={token}
          wide
          onClick={() => editor.chain().focus().insertDeviceToken(token).run()}
          label={`Insert {${token}} — replaced with the device name`}
        >
          {token}
        </ToolbarButton>
      ))}

      {hint && <span className="ml-1 hidden fs-11 text-mut desk:inline">{hint}</span>}
    </div>
  );
}

export default function RichTextEditorInner({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className = "",
  hint,
}: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [
      Document.extend({ content: "paragraph" }),
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({
        openOnClick: false,
        autolink: false,
        // The editor must not accept a scheme the reader will refuse to
        // render — that would be a link that looks saved and never works.
        protocols: ["http", "https"],
      }),
      DeviceTokenNode,
      UndoRedo,
    ],
    content: toDoc(value),
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: "outline-none min-h-[1.5em] leading-relaxed",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(fromDoc(e.getJSON())),
  });

  // Reset when the value changes underneath us — undo, discard, or switching
  // to another article. Guarded by comparing the serialised form, or every
  // keystroke would re-seed the document and put the cursor back at the start.
  useEffect(() => {
    if (!editor) return;
    if (fromDoc(editor.getJSON()) === value) return;
    editor.commands.setContent(toDoc(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-10 border border-dashed border-brand-line bg-sheet focus-within:border-brand">
      {editor && <Toolbar editor={editor} hint={hint} />}
      <EditorContent editor={editor} className={`px-3 py-2.5 text-tx ${className}`} />
    </div>
  );
}
