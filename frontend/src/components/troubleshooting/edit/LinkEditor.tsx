import { useId } from "react";
import EditableText from "./EditableText";
import type { ExternalLink } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |            A LINK OUT OF THE LIBRARY                            |
///  +-----------------------------------------------------------------+
//
//  The sibling of BranchEditor. That one picks a symptom from a list this
//  library owns; this one takes an address it does not, so there is nothing to
//  pick from and nothing to validate against beyond the shape.
//
//  THE LABEL IS THE POINT, not the address. A reader should be able to tell
//  where a button goes without reading a URL, and some of these are Teams deep
//  links carrying two GUIDs — unreadable by anyone, and the reason a link
//  cannot just be written into the step's text.
//
//  http and https only, enforced by the schema on the way in. This string ends
//  up in an href, and an admin-editable field that reaches an href is exactly
//  where a javascript: URL would do damage.
///  +-----------------------------------------------------------------+

type Props = {
  link: ExternalLink | undefined;
  onChange: (link: ExternalLink) => void;
};

export default function LinkEditor({ link, onChange }: Props) {
  const urlId = useId();
  const current = link ?? { label: "", url: "" };

  const invalid = current.url.length > 0 && !/^https?:\/\//i.test(current.url);

  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
      <span className="text-[12px] text-info-light">Reads as</span>
      <EditableText
        value={current.label}
        onChange={(label) => onChange({ ...current, label })}
        ariaLabel="Link label"
        className="text-[13px]"
        placeholder="What the reader wants — “Message Sue about my ESS account”"
      />

      <label htmlFor={urlId} className="text-[12px] text-info-light">
        Goes to
      </label>
      <div className="flex min-w-0 flex-col gap-1">
        <input
          id={urlId}
          value={current.url}
          onChange={(e) => onChange({ ...current, url: e.target.value })}
          placeholder="https://…"
          className={`w-full rounded-md border bg-surface px-2.5 py-1.5 font-mono text-[12.5px] outline-none ${
            invalid ? "border-error text-error" : "border-outline focus:border-primary"
          }`}
        />
        {/* Said here rather than only on publish: the address is usually
            pasted, and finding out it was rejected several minutes later is a
            worse way to learn it. */}
        {invalid && (
          <span className="text-[11.5px] text-error">
            Must start with http:// or https://
          </span>
        )}
      </div>
    </div>
  );
}
