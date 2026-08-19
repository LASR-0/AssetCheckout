import { Fragment } from "react";
import { parseRichText, type RichNode } from "@/lib/richText";

///  +-----------------------------------------------------------------+
///  |          RENDERING THE MARKUP ARTICLE PROSE CAN CARRY           |
///  +-----------------------------------------------------------------+
//
//  REACT ELEMENTS, NEVER innerHTML. This is the reason the stored format is a
//  markup subset rather than HTML: there is no dangerouslySetInnerHTML here,
//  no sanitiser, and no path at all from a stored string to executable
//  markup. The parser produces nodes and this turns nodes into elements — a
//  string that says "<script>" renders as the characters "<script>", because
//  it is text and was never anything else.
//
//  IT REPLACES A BARE {step.body}, so it has to behave like one: no wrapper
//  element, no layout of its own. The caller keeps its <p> or its callout and
//  this fills it.
//
//  FOUR FIELDS USE IT, not five: step bodies, notes, warnings and the article
//  summary. Figure captions are plain text at both ends — a caption is a
//  navigation path, and the marks bought nothing there worth the field no
//  longer looking like one.
//
//  A LINK STILL HAS TO EARN ITS href. The publish gate refuses anything that
//  is not http or https before it can be saved — see checkPublishable — but
//  this checks again at the point of rendering, because the gate guards the
//  editor and this also renders the seeded corpus, hand-edited files, and any
//  row that predates the gate. A link that fails renders as its own text: the
//  reader still gets the sentence, just without somewhere to click.
///  +-----------------------------------------------------------------+

/** Mirrors linkSchema on the server: http and https, nothing else. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function Marked({ node, children }: { node: RichNode; children: React.ReactNode }) {
  let out = <>{children}</>;

  // Innermost first, so the nesting matches how it serialises.
  if (node.italic) out = <em>{out}</em>;
  if (node.bold) out = <strong>{out}</strong>;

  if (node.href && isSafeHref(node.href)) {
    out = (
      <a
        href={node.href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2 hover:no-underline"
      >
        {out}
      </a>
    );
  }

  return out;
}

/**
 * Inline prose with bold, italic and links.
 *
 * `text` is whatever the server served, which means device tokens are already
 * substituted — see nameTheSubject. A token node reaching here at all means
 * something served raw text by mistake, so it renders as its literal source
 * rather than vanishing: visible nonsense is findable, a silent gap is not.
 */
export default function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((node, index) => (
        <Fragment key={index}>
          <Marked node={node}>
            {node.type === "token" ? `{${node.token}}` : node.text}
          </Marked>
        </Fragment>
      ))}
    </>
  );
}
