import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { composeSupportMessage } from "@/api/troubleshooting";
import type { SupportMessageDraft } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |        WRITING TO IT WHEN THE ARTICLE RAN OUT                   |
///  +-----------------------------------------------------------------+
//
//  For the problems that are not urgent enough to ring about. Somebody here
//  has worked through an article and it did not fix their problem, so the most
//  useful thing they can hand IT is which ground is already covered — that is
//  what the checkboxes are for, and it is the round-trip this saves.
//
//  THE PASTE STEP IS ANNOUNCED BEFORE THEY CLICK, not after. Teams cannot be
//  opened with a message already in the box: ?message= and ?topicName= are
//  documented for chat deep links only, and were tried twice on this channel
//  link — form-encoded, then with %20 on a URL matching the documented
//  channel format — and ignored both times. So the honest flow is copy, open
//  Teams, paste. A person who is not told that clicks the button, sees an
//  empty compose box, and reasonably concludes it failed.
//
//  THE MESSAGE IS SHOWN IN FULL, and that is not decoration either. It goes
//  into a public channel under their own name, so they get to read it, edit
//  it, and copy it by hand if the clipboard refuses.
//
//  IT IS NOT SENT FOR THEM. They post it themselves, in their own Teams
//  identity, so IT's reply threads back and notifies them. Posted by the app
//  on their behalf, the answer would land somewhere they are not looking.
///  +-----------------------------------------------------------------+

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectKey: string;
  symptomId: string;
  channelName: string;
  /** Recorded when they actually go through with it. */
  onSent: () => void;
};

export default function SupportMessageDialog({
  open,
  onOpenChange,
  subjectKey,
  symptomId,
  channelName,
  onSent,
}: Props) {
  const [draft, setDraft] = useState<SupportMessageDraft | null>(null);
  const [tried, setTried] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");

  // Recomposed on the server whenever the answers change, so what is on screen
  // is exactly what gets copied — see the header for why the browser does not
  // build this itself.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    composeSupportMessage(subjectKey, symptomId, { stepsTried: tried, notes })
      .then((res) => !cancelled && setDraft(res))
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [open, subjectKey, symptomId, tried, notes]);

  // Reset between openings, so the next article does not inherit the last
  // one's ticks.
  useEffect(() => {
    if (open) return;
    setTried([]);
    setNotes("");
    setCopied("idle");
    setError(null);
  }, [open]);

  const toggle = (index: number) =>
    setTried((current) =>
      current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index].sort((a, b) => a - b)
    );

  //  COPY ONLY — the anchor does the opening.
  //
  //  This used to end in window.open(), which meant the control had to be a
  //  <button> and the destination was invisible until the tab was already
  //  there. It is an <a href> now, so hovering shows the target in the status
  //  bar and the browser's own "copy link address" and open-in-new-tab both
  //  work. That matters more here than on an ordinary link: this one leaves
  //  the app for Teams, carrying a message the person is about to post
  //  publicly, and being able to see where it goes first is the difference
  //  between trusting it and guessing.
  //
  //  Nothing is awaited before the navigation. writeText() is called inside
  //  the click, which is what the clipboard permission actually requires, and
  //  the anchor opens in a new tab — so the copy finishes on a page that is
  //  still there either way.
  async function copyDraft() {
    if (!draft) return;

    let ok = false;
    try {
      await navigator.clipboard.writeText(draft.text);
      ok = true;
    } catch {
      // Needs a secure context and permission, and can still be refused. The
      // message is on screen and selectable, so this degrades to copying it
      // by hand rather than to a dead end.
      ok = false;
    }

    setCopied(ok ? "ok" : "failed");
    onSent();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:max-w-4xl` with the sm: prefix, not a bare `max-w-*`: DialogContent
          ships `sm:max-w-sm`, and tailwind-merge keeps both when the variants
          differ — so an unprefixed override loses on every screen above 640px,
          which is every screen this is read on.

          No `overflow-x-hidden` either. It clips rather than scrolls, so
          anything that did overflow became invisible instead of reachable. The
          preview breaks long words instead, which is what was overflowing. */}
        <DialogContent className="max-h-[85vh] gap-5 overflow-y-auto border border-outline bg-surface p-7 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Send a message to IT</DialogTitle>
          <DialogDescription>
            For when it can wait for a reply. Tell them what you have already
            tried so nobody asks you to do it twice.
          </DialogDescription>
        </DialogHeader>

        {/* First thing in the form, deliberately. Every step below is one
            Teams gives no way to automate — the compose box has to be opened
            by hand, the clipboard cannot be split across two fields, and the
            subject box only exists once the post is expanded. Somebody not
            told all three clicks the button and concludes it failed. */}
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <span className="material-symbols-outlined shrink-0 !text-[20px] text-warning">
            content_paste
          </span>
          <div className="flex min-w-0 flex-col gap-2 text-[13px] leading-relaxed text-on-surface-variant">
            <strong className="font-semibold">
              Three steps you have to do yourself — Teams can&rsquo;t do them for you.
            </strong>
            <ol className="flex list-decimal flex-col gap-1.5 pl-4">
              <li>
                Press <em>Copy and open Teams</em>. Your message goes to the
                clipboard and {channelName} opens in a new tab.
              </li>
              <li>
                In Teams, click <strong>New conversation</strong> (or{" "}
                <strong>Post in channel</strong>) to open the message box, then
                paste with{" "}
                <kbd className="rounded border border-outline bg-surface px-1 font-mono text-[11px]">
                  Ctrl
                </kbd>{" "}
                +{" "}
                <kbd className="rounded border border-outline bg-surface px-1 font-mono text-[11px]">
                  V
                </kbd>
                .
              </li>
              <li>
                The first line is a subject. Cut it into the Teams subject box,
                delete the instructions above the line, then send. The pasted
                message tells you exactly what to remove.
              </li>
            </ol>
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        {draft && draft.steps.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-on-background">
              Which of these did you try?
            </legend>
            {draft.steps.map((step) => (
              <label
                key={step.index}
                className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] text-on-surface-variant hover:bg-surface-container-low/40 hover:cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={tried.includes(step.index)}
                  onChange={() => toggle(step.index)}
                  className="mt-0.5 hover:cursor-pointer"
                />
                <span className="min-w-0">{step.title}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-on-background">
            Anything else worth knowing?
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="When it started, what you were doing, anything you noticed."
            className="w-full resize-y rounded-md border border-outline bg-surface-container-lowest px-3 py-2 text-[13.5px] outline-none focus:border-primary"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-on-background">
            What will be sent
          </span>
          <pre className="max-h-64 overflow-y-auto rounded-md border border-outline bg-surface-container-low/30 p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-on-surface-variant">
            {draft ? draft.text : "Composing…"}
          </pre>
          <span className="text-[12px] text-info-light">
            This goes into a channel other people at KSB can see, under your name.
          </span>
        </div>

        {copied === "failed" && (
          <p className="rounded-md border border-error/40 bg-error-background p-2.5 text-[13px] text-error">
            Your browser would not let us copy it. Select the message above and
            copy it manually — Teams has been opened in another tab.
          </p>
        )}

        {copied === "ok" && (
          <p className="rounded-md border border-outline bg-surface-container-low/30 p-2.5 text-[13px] text-on-surface-variant">
            Copied. Paste it into {channelName} and press send.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* An anchor, not a button, so the destination is visible before it
              is taken — see copyDraft. `href` is only present once the draft
              has landed, which is what keeps the disabled state honest: a
              hrefless <a> is not focusable and not activatable, so there is
              no window where this looks ready and copies nothing.

              rel="noopener noreferrer" because target="_blank" otherwise
              hands Teams a live window.opener back into the app.

              No `title`: it would duplicate what the status bar already shows
              on hover, and a raw Teams channel URL is not a thing anybody
              reads for reassurance. The destination is named in words
              underneath instead. */}
          <a
            href={draft?.channelUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!draft?.channelUrl}
            onClick={() => void copyDraft()}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold twilight-gradient text-white shadow-brand transition-all ${
              draft?.channelUrl
                ? "hover:opacity-90 active:scale-95 hover:cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined !text-[18px]">content_copy</span>
            Copy and open Teams
          </a>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-outline px-3.5 py-2 text-sm font-semibold text-info-light transition-colors hover:bg-surface-container-low/40 hover:cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Says the destination in words, because the status bar only shows it
            while the pointer is on the link and says it in a URL. This is a
            link out of the app into a place the reader is about to post
            something public — worth naming plainly. */}
        {draft?.channelUrl && (
          <span className="text-[12px] text-info-light">
            Opens {channelName} on teams.microsoft.com in a new tab.
          </span>
        )}
      </DialogContent>
    </Dialog>
  );
}
