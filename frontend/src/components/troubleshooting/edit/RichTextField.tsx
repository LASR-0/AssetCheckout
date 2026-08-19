import { Suspense, lazy } from "react";

///  +-----------------------------------------------------------------+
///  |        THE RICH FIELD, AND WHY IT ARRIVES SEPARATELY            |
///  +-----------------------------------------------------------------+
//
//  Tiptap and ProseMirror measure ~147 kB gzipped. The app's whole bundle is
//  285 kB. Loading it with the page would put half again as much JavaScript
//  in front of every reader — on the troubleshooting section, which is where
//  somebody lands when something is already broken and they are probably on
//  the worst connection they have — to serve the handful of admins who ever
//  turn edit mode on.
//
//  So it is imported only when a rich field actually renders, which is only
//  inside edit mode. This is the first lazy boundary in the app; if a second
//  one is ever wanted, the pattern is here.
//
//  THE PROP SHAPE IS EditableText'S, deliberately. Five fields moved from
//  that component to this one and the rest did not, so the two have to be
//  swappable at the call site — anything else would mean rewriting call sites
//  to change which fields are rich.
///  +-----------------------------------------------------------------+

export type RichTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  /** Matches EditableText: `primary` for prose, `muted` for metadata. */
  tone?: "primary" | "muted";
};

const RichTextEditorInner = lazy(() => import("./RichTextEditorInner"));

export default function RichTextField(props: RichTextFieldProps) {
  return (
    <Suspense
      fallback={
        // The text, in place, at the size it will be. A spinner here would
        // make the page flicker through a hole every time edit mode opens;
        // this only differs from the loaded editor by not being typeable yet.
        <div
          className={`rounded-md border border-dashed border-outline/60 px-2 py-1 opacity-60 ${
            props.className ?? ""
          }`}
        >
          {props.value || props.placeholder || ""}
        </div>
      }
    >
      <RichTextEditorInner {...props} />
    </Suspense>
  );
}
