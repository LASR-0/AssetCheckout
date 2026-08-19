import type { JSONContent } from "@tiptap/core";
import {
  parseRichText,
  serialiseRichText,
  type DeviceToken,
  type RichNode,
} from "./richText";

///  +-----------------------------------------------------------------+
///  |        BETWEEN THE STORED STRING AND THE EDITOR DOCUMENT        |
///  +-----------------------------------------------------------------+
//
//  The stored value is a string of inline markup — see lib/richText for why.
//  Tiptap works in a ProseMirror document. This is the only place that knows
//  both, so the editor never sees markup and the parser never sees a
//  document.
//
//  ONE PARAGRAPH, ALWAYS. Every field this edits is a single paragraph of
//  prose: a step body, a note, a warning, the summary, a figure caption. None
//  of them may contain a line break, because the stored schema is one string
//  and the reader renders it inside one <p>. The editor's Document is
//  configured to allow exactly one paragraph — see RichTextEditor — so there
//  is nothing here that has to decide what a second one would mean.
///  +-----------------------------------------------------------------+

type Mark = { type: string; attrs?: Record<string, unknown> };

/** Marks in the order the serialiser nests them, so a round trip is stable. */
function marksFor(node: RichNode): Mark[] {
  const marks: Mark[] = [];
  if (node.href) marks.push({ type: "link", attrs: { href: node.href } });
  if (node.bold) marks.push({ type: "bold" });
  if (node.italic) marks.push({ type: "italic" });
  return marks;
}

/** Stored markup to an editor document. */
export function toDoc(value: string): JSONContent {
  const content: JSONContent[] = parseRichText(value).map((node) => {
    const marks = marksFor(node);

    if (node.type === "token") {
      return { type: "deviceToken", attrs: { token: node.token }, marks };
    }

    return { type: "text", text: node.text, marks };
  });

  // An empty paragraph must have no `content` key at all — ProseMirror
  // rejects an empty array, and an empty field is the normal state of a note
  // somebody has just added.
  return {
    type: "doc",
    content: [content.length ? { type: "paragraph", content } : { type: "paragraph" }],
  };
}

/** An editor document back to stored markup. */
export function fromDoc(doc: JSONContent): string {
  const nodes: RichNode[] = [];

  const walk = (node: JSONContent): void => {
    if (node.type === "text" || node.type === "deviceToken") {
      const marks = node.marks ?? [];
      const link = marks.find((m) => m.type === "link");

      const applied = {
        ...(marks.some((m) => m.type === "bold") ? { bold: true as const } : {}),
        ...(marks.some((m) => m.type === "italic") ? { italic: true as const } : {}),
        ...(link?.attrs?.href ? { href: String(link.attrs.href) } : {}),
      };

      if (node.type === "deviceToken") {
        nodes.push({
          type: "token",
          token: String(node.attrs?.token ?? "device") as DeviceToken,
          ...applied,
        });
      } else if (node.text) {
        nodes.push({ type: "text", text: node.text, ...applied });
      }
      return;
    }

    node.content?.forEach(walk);
  };

  walk(doc);

  return serialiseRichText(nodes);
}
