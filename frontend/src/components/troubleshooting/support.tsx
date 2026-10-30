import { useState, type ComponentProps } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";
import { Textarea } from "@/components/ui/textarea";
import { Modal, ModalBody, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { btn } from "@/components/ui/variants";
import { composeGeneralSupportMessage, composeSupportMessage } from "@/api/troubleshooting";
import { callHref, trackEscape, type EscapeContext } from "./escape";
import { useSettledSearch } from "@/hooks/useSettledSearch";
import type { TroubleshootingConfig } from "@/types/troubleshootingType";


///  +-----------------------------------------------------------------+
///  |                  GETTING HOLD OF IT                             |
///  +-----------------------------------------------------------------+
//
//  The escape hatch, in every place the page offers it: the front page's
//  "Get support now" card, the end of a guided article, the foot of the
//  all-steps view, an unwritten symptom, a search that found nothing.
//
//  UNCONFIGURED IS A REAL STATE. With no support number the server serves
//  an "XX XXXX XXXX" placeholder; nothing here links to it, because a link
//  that dials a row of X's looks like it works. With no Teams channel the
//  message option is left out entirely — a button that opens nothing is
//  worse than no button.
//
//  RECORDED, ANONYMOUSLY. Calling, messaging and running out of steps all
//  record ESCAPE_TAKEN, told apart by `detail`, so the pilot can see how
//  people leave the library rather than one averaged number.
///  +-----------------------------------------------------------------+

/** A tel: link that records the call. Only for a configured number. */
export function CallLink({
  config,
  context,
  onClick,
  ...props
}: ComponentProps<"a"> & { config: TroubleshootingConfig; context?: EscapeContext }) {
  return (
    <a
      href={callHref(config.supportPhone)}
      onClick={(e) => {
        trackEscape("called", context);
        onClick?.(e);
      }}
      {...props}
    />
  );
}

/** The front page's "Get support now" card. */
export function SupportCard({ config, onMessage }: { config: TroubleshootingConfig | null; onMessage: () => void }) {
  return (
    <Tray label="Get support now" data-tour="ts-escape">
      <Sheet className="flex flex-col gap-1 px-3.5 pt-3 pb-3.25">
        {!config ? (
          <span className="fs-12.5 text-mut">Loading…</span>
        ) : config.supportPhoneConfigured ? (
          <>
            <CallLink
              config={config}
              className="font-title fs-15 font-medium tracking-head text-brand-tx no-underline hover:underline"
            >
              {config.supportPhone}
            </CallLink>
            <span className="fs-11.5 text-mut">IT support{config.supportHours ? ` · ${config.supportHours}` : ""}</span>
          </>
        ) : (
          <>
            {config.supportChannelConfigured && (
              <button
                type="button"
                onClick={onMessage}
                className="flex cursor-pointer items-center gap-1.5 self-start border-0 bg-transparent p-0 text-left font-sans fs-12.5 font-medium text-brand-tx outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon name="chat" size={16} />
                Send IT a message
              </button>
            )}
            <span className="fs-11.5 text-mut">No support number is set up yet.</span>
          </>
        )}
      </Sheet>
    </Tray>
  );
}

/**
 * The calling and messaging buttons, as a row: the end of an article, an
 * unwritten symptom, a search with no match. Renders only what's set up.
 */
export function EscapeButtons({
  config,
  context,
  onMessage,
  messageLabel = "Message IT",
  callLabel,
  primary = "message",
  size = "lg",
  className,
}: {
  config: TroubleshootingConfig | null;
  context?: EscapeContext;
  onMessage: () => void;
  messageLabel?: string;
  /** Defaults to the number itself. */
  callLabel?: string;
  /** Which of the two is the solid button. */
  primary?: "message" | "call";
  size?: "md" | "lg";
  className?: string;
}) {
  if (!config) return null;
  const message = config.supportChannelConfigured;
  const call = config.supportPhoneConfigured;
  if (!message && !call) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {message && (
        <button
          type="button"
          onClick={onMessage}
          className={btn({ variant: primary === "message" ? "primary" : "secondary", size })}
        >
          <Icon name="chat" size={16} />
          {messageLabel}
        </button>
      )}
      {call && (
        <CallLink
          config={config}
          context={context}
          className={btn({ variant: primary === "call" || !message ? "primary" : "secondary", size, className: "no-underline" })}
        >
          <Icon name="call" size={16} />
          {callLabel ?? config.supportPhone}
        </CallLink>
      )}
    </div>
  );
}

///  ── The Teams message ───────────────────────────────────────────────
//
//  Composed on the server (the template is a setting, and step titles carry
//  {device} tokens it resolves), shown in full, and copied for them to post
//  themselves. It is never sent for them: posted in their own Teams identity,
//  IT's reply threads back and notifies them.
//
//  THE PASTE STEP IS SAID BEFORE THEY CLICK. Teams can't be opened with a
//  message already in the box (?message= is ignored on channel links), so the
//  honest flow is copy, open, paste — and somebody not told that sees an empty
//  compose box and concludes it failed.

export type MessageTarget =
  | { kind: "article"; subjectKey: string; symptomId: string; tried: number[] }
  | { kind: "general"; query: string; subjectKey: string | null };

type MessageProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: MessageTarget;
  channelName: string;
};

export function MessageDialog({ open, onOpenChange, target, channelName }: MessageProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} label="Message IT" width={580}>
      {/* Mounted only while open, so the next opening starts clean rather
          than inheriting the last one's ticks and notes. */}
      {open && <MessageBody target={target} channelName={channelName} onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

function MessageBody({ target, channelName, onClose }: { target: MessageTarget; channelName: string; onClose: () => void }) {
  const [tried, setTried] = useState<number[]>(target.kind === "article" ? target.tried : []);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const settledNotes = useSettledSearch(notes, 400);

  const draft = useQuery({
    queryKey: ["troubleshooting", "message", target, tried, settledNotes],
    queryFn: () =>
      target.kind === "article"
        ? composeSupportMessage(target.subjectKey, target.symptomId, { stepsTried: tried, notes: settledNotes })
        : composeGeneralSupportMessage({ query: target.query, subjectKey: target.subjectKey, notes: settledNotes }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  const text = draft.data?.text;
  const url = draft.data?.channelUrl ?? null;
  const steps = draft.data?.steps ?? [];
  const context = target.kind === "article" ? { subjectKey: target.subjectKey, symptomId: target.symptomId } : { subjectKey: target.subjectKey };

  const toggle = (index: number) =>
    setTried((now) => (now.includes(index) ? now.filter((i) => i !== index) : [...now, index].sort((a, b) => a - b)));

  async function copy() {
    if (!text) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Needs a secure context and permission. The message is on screen
      // and selectable, so this degrades to copying it by hand.
    }
    setCopied(ok ? "ok" : "failed");
    trackEscape("messaged", context);
  }

  return (
    <>
      <ModalBody>
        <div className="flex flex-col gap-1">
          <ModalTitle>Send a message to IT</ModalTitle>
          <p className="m-0 fs-12 leading-normal text-pretty text-mut">
            Checkout writes the message, including what you&rsquo;ve tried. Add anything that helps, then send it yourself in Teams.
          </p>
        </div>

        <div className="flex gap-2.5 rounded-10 bg-prog-bg px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--prog-line)]">
          <Icon name="content_paste" size={17} className="mt-px text-prog" />
          <p className="m-0 fs-12 leading-[1.5] text-tx2">
            <span className="font-medium text-tx">Teams can&rsquo;t take it for you.</span> After copying, click <b>New conversation</b> (or{" "}
            <b>Post in channel</b>) in {channelName}, paste with <kbd className="rounded-4 border border-line bg-sheet px-1 font-mono fs-10.5">Ctrl</kbd> +{" "}
            <kbd className="rounded-4 border border-line bg-sheet px-1 font-mono fs-10.5">V</kbd>, move the first line into the subject box, then send.
          </p>
        </div>

        {steps.length > 0 && (
          <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
            <legend className="mb-1.5 p-0 fs-12 font-medium text-tx">Which of these did you try?</legend>
            {steps.map((step) => (
              <label key={step.index} className="flex cursor-pointer items-start gap-2.5 rounded-7 px-2 py-1.5 fs-12.5 leading-[1.45] text-tx2 hover:bg-hover">
                <input type="checkbox" checked={tried.includes(step.index)} onChange={() => toggle(step.index)} className="mt-0.5 size-3.5 cursor-pointer accent-(--brand)" />
                <span className="min-w-0">
                  {step.index + 1}. {step.title}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <pre className="m-0 max-h-64 overflow-auto rounded-9 border border-line2 bg-subtle px-3.5 py-3 font-mono fs-11.5 leading-[1.6] break-words whitespace-pre-wrap text-tx2">
          {text ?? (draft.isError ? "Couldn't write the message. Please try again." : "Writing…")}
        </pre>

        <label className="flex flex-col gap-1.5">
          <span className="fs-12 font-medium text-tx">
            Add detail <span className="font-normal text-mut">(optional)</span>
          </span>
          <Textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setCopied("idle");
            }}
            rows={3}
            maxLength={2000}
            placeholder="When it started, what you were doing…"
            className="min-h-18 fs-12.5"
          />
        </label>

        {copied === "ok" && (
          <div className="flex gap-2.25 rounded-9 bg-ok-bg px-3 py-2.5 fs-12 leading-[1.45] text-tx shadow-[inset_0_0_0_1px_var(--ok-line)]">
            <Icon name="check_circle" size={16} className="text-ok" />
            <span>Copied. Teams is opening: paste the message and press Send.</span>
          </div>
        )}
        {copied === "failed" && (
          <div className="flex gap-2.25 rounded-9 bg-stop-bg px-3 py-2.5 fs-12 leading-[1.45] text-tx shadow-[inset_0_0_0_1px_var(--stop-line)]">
            <Icon name="error" size={16} className="text-stop" />
            <span>Your browser wouldn&rsquo;t let us copy it. Select the message above and copy it by hand; Teams has opened in another tab.</span>
          </div>
        )}
      </ModalBody>
      <ModalFooter help={<span className="flex-1 basis-50 fs-11.5 text-mut">Checkout never sends this for you.</span>}>
        <button type="button" onClick={onClose} className={btn({ size: "md" })}>
          Cancel
        </button>
        {/* An anchor, so the destination shows on hover and opens in a new
            tab; the copy happens inside the click, which is what the
            clipboard permission needs. No href until the text has landed. */}
        <a
          href={url && text ? url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url || !text}
          onClick={() => void copy()}
          className={btn({
            variant: "primary",
            size: "md",
            className: cn("no-underline", (!url || !text) && "pointer-events-none bg-track text-dis"),
          })}
        >
          <Icon name="content_copy" size={16} />
          {copied === "idle" ? "Copy and open Teams" : "Copy again"}
        </a>
      </ModalFooter>
    </>
  );
}
