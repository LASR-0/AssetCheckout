import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/variants";
import { Textarea } from "@/components/ui/textarea";
import { Tray, Sheet } from "@/components/ui/tray";
import { Page } from "@/components/shell/Page";
import { Field, FieldError } from "@/components/forms/FormSection";
import { OptionRows } from "@/components/forms/Choices";
import { feedbackEnabledQuery } from "@/api/queries";
import { submitFeedback, type FeedbackResponse } from "@/api/feedback";

///  +-----------------------------------------------------------------+
///  |                          FEEDBACK                               |
///  +-----------------------------------------------------------------+
//
//  Two required questions and an optional comment. Anonymous: nothing about
//  who sent it is stored, and the page says so before anyone answers.
//
//  Gated on the feedback switch. The server also refuses submissions while
//  it is off; this is the client-side courtesy of not offering the form.
///  +-----------------------------------------------------------------+

const ANSWERS: { value: FeedbackResponse; label: string }[] = [
  { value: "improved", label: "Yes, it has improved" },
  { value: "no_change", label: "No or negligible improvement" },
  { value: "worse", label: "Worse than before" },
];

const ACTION = "h-11 fs-12 phone:h-8.5";

function BackHome() {
  return (
    <Link to="/" className={cn(buttonVariants({ variant: "secondary" }), ACTION)}>
      Back to home
    </Link>
  );
}

export default function FeedbackPage() {
  const { data: enabled, isPending } = useQuery(feedbackEnabledQuery);
  const [requesting, setRequesting] = useState<FeedbackResponse | null>(null);
  const [overall, setOverall] = useState<FeedbackResponse | null>(null);
  const [comments, setComments] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setTried(true);
    if (!requesting || !overall) return;
    setSending(true);
    setError(null);
    try {
      await submitFeedback({
        improvedRequesting: requesting,
        improvesItOverall: overall,
        comments: comments.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't send it. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const questions = [
    { tray: "Requesting hardware", q: "Is this an improvement to how you request hardware?", value: requesting, set: setRequesting },
    { tray: "IT in general", q: "Is this an improvement to IT in general?", value: overall, set: setOverall },
  ];

  return (
    <Page max={1320} className="px-3 pt-5 pb-10 phone:px-8 phone:pt-7 phone:pb-40">
      <div className="mx-auto flex w-full max-w-[45rem] flex-col gap-3.5 phone:gap-4">
        <div>
          <div className="font-title fs-10 font-medium tracking-label text-mut uppercase">Feedback</div>
          <h1 className="mt-2 font-head fs-19 leading-[1.25] font-medium tracking-[-0.01em] phone:fs-21">
            How is the new Checkout working for you?
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 fs-13 text-tx3">
            <Icon name="visibility_off" size={16} className="text-mut" />
            Anonymous. We don't store who sent it.
          </p>
        </div>

        {isPending ? (
          <Tray>
            <Sheet className="h-30" />
          </Tray>
        ) : !enabled ? (
          <Tray>
            <Sheet className="flex flex-wrap items-center gap-3 px-3.5 py-4">
              <span className="flex-[1_1_16rem] fs-13 text-tx2">Feedback is turned off at the moment.</span>
              <BackHome />
            </Sheet>
          </Tray>
        ) : sent ? (
          <Tray>
            <Sheet className="flex flex-col items-start gap-2 px-3.5 py-4.5">
              <span className="grid size-9 place-items-center rounded-full bg-ok-bg text-ok">
                <Icon name="check" size={20} />
              </span>
              <span className="fs-15 font-semibold">Thank you!</span>
              <span className="fs-13 text-tx3">Your answers went to IT without your name on them.</span>
              <span className="mt-1">
                <BackHome />
              </span>
            </Sheet>
          </Tray>
        ) : (
          <>
            {questions.map((q) => (
              <Tray key={q.tray} label={q.tray}>
                <Sheet className="flex flex-col gap-2 p-3.5">
                  <div className="mb-1 fs-13.5 font-semibold">{q.q}</div>
                  <OptionRows label={q.q} value={q.value} onChange={q.set} options={ANSWERS} />
                  <FieldError>{tried && !q.value ? "Please pick an answer." : null}</FieldError>
                </Sheet>
              </Tray>
            ))}
            <Tray label="Anything else">
              <Sheet className="p-3.5">
                <Field label="Comments" optional>
                  <Textarea
                    size="lg"
                    rows={4}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Tell us how we can improve this service, or suggest improvements to IT as a whole."
                  />
                </Field>
              </Sheet>
            </Tray>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end">
              <Button variant="primary" className={cn(ACTION, "flex-[1_1_100%] px-5 fs-12.5 phone:flex-none")} disabled={sending} onClick={send}>
                {sending ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
