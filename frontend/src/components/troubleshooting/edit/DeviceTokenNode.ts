import { Node, mergeAttributes } from "@tiptap/core";
import { DEVICE_TOKENS, type DeviceToken } from "@/lib/richText";

///  +-----------------------------------------------------------------+
///  |                {device} AS A THING, NOT AS TEXT                 |
///  +-----------------------------------------------------------------+
//
//  An article says "restart your {device}" and the repository substitutes
//  "phone" or "laptop" at serve time, so one article can be listed under
//  several subjects — see fillTokens. Sixty-nine step bodies rely on it.
//
//  THE PROBLEM A RICH EDITOR CREATES. As plain text in a textarea a token is
//  eight characters nobody can damage without noticing. In a rich editor a
//  selection can cover half of it: bold "devi" and the stored text becomes
//  "{**devi**ce}", which is not a token any more. fillTokens stops matching
//  it, the reader sees a literal brace, and the publish gate rejects the
//  article with a message about an unrecognised placeholder that the author
//  has no way to connect to the word they emboldened.
//
//  SO IT IS AN ATOM. `atom: true` means ProseMirror treats it as a single
//  indivisible unit — the cursor steps over it, a selection takes all of it
//  or none, and there is no inside for a mark to land in half of. The failure
//  is not caught later; it cannot be expressed.
//
//  IT STILL TAKES MARKS, because a token inside a bold sentence has to stay
//  bold — see the RichNode type, where marks sit on tokens for exactly this.
///  +-----------------------------------------------------------------+

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    deviceToken: {
      /** Insert a token at the cursor. */
      insertDeviceToken: (token: DeviceToken) => ReturnType;
    };
  }
}

export const DeviceTokenNode = Node.create({
  name: "deviceToken",
  group: "inline",
  inline: true,
  atom: true,
  /** "_" allows every mark, so a token inside a bold run stays inside it. */
  marks: "_",

  addAttributes() {
    return {
      token: {
        default: "device" as DeviceToken,
        parseHTML: (element) => element.getAttribute("data-token"),
        renderHTML: (attributes) => ({ "data-token": attributes.token }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-token]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Shown as the bare word in a chip rather than as "{device}". The author
    // is writing a sentence and needs to read it as one: "restart your
    // {device} now" reads as a template, "restart your [device] now" reads as
    // English with a slot in it. The braces are still what gets stored.
    // inline-block, and that is the fix for a real bug rather than a
    // preference. Vertical padding on a plain inline element does not push
    // the line box out, so the chip's background bled over the lines above
    // and below it and two tokens near each other overlapped. inline-block
    // gives it a box, `align-baseline` keeps it sitting on the text baseline
    // instead of hopping, and `leading-none` stops the extra height the box
    // would otherwise add from opening the line spacing up around it.
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class:
          "inline-block align-baseline leading-none rounded bg-primary/15 " +
          "px-1.5 py-[0.15em] mx-[0.05em] text-primary font-medium " +
          "whitespace-nowrap cursor-default select-none",
        title: `Replaced with the device name — {${node.attrs.token}}`,
      }),
      String(node.attrs.token),
    ];
  },

  addCommands() {
    return {
      insertDeviceToken:
        (token: DeviceToken) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { token } }),
    };
  },
});

/** The four spellings, for the insert menu. */
export const DEVICE_TOKEN_CHOICES = DEVICE_TOKENS;
