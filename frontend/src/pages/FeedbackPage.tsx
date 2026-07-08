import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getFeedbackEnabled,
  submitFeedback,
  type FeedbackResponse,
} from "@/api/feedback";

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

type Phase = "loading" | "form" | "submitting" | "success" | "disabled";

const OPTIONS: { value: FeedbackResponse; label: string }[] = [
  { value: "improved", label: "Yes, it improved" },
  { value: "no_change", label: "No or negligible improvement" },
  { value: "worse", label: "Worse than before" },
];

export default function FeedbackPage() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [improvedRequesting, setImprovedRequesting] = useState<FeedbackResponse | null>(null);
  const [improvesItOverall, setImprovesItOverall] = useState<FeedbackResponse | null>(null);
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Gate on the feedback_enabled setting. The server also enforces this on
  // submit; this is the client-side UX so a disabled feature isn't shown.
  useEffect(() => {
    getFeedbackEnabled()
      .then((r) => setPhase(r.enabled ? "form" : "disabled"))
      .catch(() => setPhase("disabled"));
  }, []);

  const bothAnswered = improvedRequesting !== null && improvesItOverall !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bothAnswered) return;
    setError(null);
    setPhase("submitting");

    try {
      await submitFeedback({
        improvedRequesting: improvedRequesting!,
        improvesItOverall: improvesItOverall!,
        comments: comments.trim() || undefined,
      });
      setPhase("success");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setPhase("form");
    }
  }

  return (
    <main className="min-h-screen bg-landing-bg text-on-background flex flex-col">
      <div className="flex-grow pt-24 pb-12 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <div className="flex flex-row">
              <span className="material-symbols-outlined mx-3 !text-4xl">forum</span>
              <h1 className="text-4xl font-bold flex tracking-tight mb-2">Share Feedback</h1>
            </div>
            <p className="text-info-light ml-5">
              Your feedback is completely anonymous — nothing about who submitted it is recorded.
              Let us know how Checkout is working for you.
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-md">
            {phase === "loading" && (
              <div className="flex items-center justify-center gap-3 text-info-light text-sm py-12">
                <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
                Loading...
              </div>
            )}

            {phase === "disabled" && (
              <div className="text-center py-10 space-y-4">
                <span className="material-symbols-outlined !text-5xl text-info-light">
                  speaker_notes_off
                </span>
                <p className="text-on-surface-variant">
                  Feedback isn&apos;t currently being collected.
                </p>
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-3 text-white font-bold rounded-3xl shadow-lg hover:cursor-pointer hover:brightness-110 transition-all twilight-gradient"
                >
                  Back to home
                </button>
              </div>
            )}

            {phase === "success" && (
              <div className="text-center py-10 space-y-4">
                <span className="material-symbols-outlined !text-6xl text-green-500">
                  check_circle
                </span>
                <h2 className="text-2xl font-bold text-on-surface-variant">Thank you!</h2>
                <p className="text-info-light max-w-md mx-auto">
                  Your feedback has been submitted anonymously. We appreciate you taking the time.
                </p>
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-3 text-white font-bold rounded-3xl shadow-lg hover:cursor-pointer hover:brightness-110 transition-all twilight-gradient"
                >
                  Back to home
                </button>
              </div>
            )}

            {(phase === "form" || phase === "submitting") && (
              <form onSubmit={handleSubmit} className="space-y-10">
                {/* Question 1 */}
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
                    1. Has Checkout improved how you request assets?
                  </label>
                  <RadioGroup
                    value={improvedRequesting ?? ""}
                    onValueChange={(v) => setImprovedRequesting(v as FeedbackResponse)}
                    className="space-y-3"
                  >
                    {OPTIONS.map((opt) => {
                      const selected = improvedRequesting === opt.value;
                      return (
                        <div key={opt.value} className="flex items-center gap-3">
                          <RadioGroupItem value={opt.value} id={`ir-${opt.value}`} />
                          <label
                            htmlFor={`ir-${opt.value}`}
                            className={`text-sm font-medium hover:cursor-pointer transition-colors ${
                              selected ? "text-nav-selected" : "text-info-light"
                            }`}
                          >
                            {opt.label}
                          </label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>

                {/* Question 2 */}
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
                    2. Do you think tools like this improve IT overall?
                  </label>
                  <RadioGroup
                    value={improvesItOverall ?? ""}
                    onValueChange={(v) => setImprovesItOverall(v as FeedbackResponse)}
                    className="space-y-3"
                  >
                    {OPTIONS.map((opt) => {
                      const selected = improvesItOverall === opt.value;
                      return (
                        <div key={opt.value} className="flex items-center gap-3">
                          <RadioGroupItem value={opt.value} id={`io-${opt.value}`} />
                          <label
                            htmlFor={`io-${opt.value}`}
                            className={`text-sm font-medium hover:cursor-pointer transition-colors ${
                              selected ? "text-nav-selected" : "text-info-light"
                            }`}
                          >
                            {opt.label}
                          </label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>

                {/* Comments */}
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
                    3. Any other comments?{" "}
                    <span className="lowercase text-info-light font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={5}
                    placeholder="Tell us anything else you'd like us to know..."
                    className="w-full text-on-surface-variant bg-surface-container/40 ring-purple-900 p-3 border-1 border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-900/30 resize-y"
                  />
                </div>

                <button
                  type="submit"
                  disabled={phase === "submitting" || !bothAnswered}
                  className="w-full py-4 text-white font-bold rounded-3xl shadow-lg hover:shadow-xl hover:cursor-pointer hover:brightness-110 transition-all twilight-gradient disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center">
                    {phase === "submitting" ? (
                      <>
                        <span className="mr-2">Submitting...</span>
                        <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
                      </>
                    ) : (
                      <>
                        <span className="mb-0.5 mr-2">Submit Feedback</span>
                        <span
                          className="material-symbols-outlined leading-none mb-0.5"
                          style={{ fontVariationSettings: `'FILL' 1` }}
                        >
                          send
                        </span>
                      </>
                    )}
                  </span>
                </button>

                {!bothAnswered && (
                  <p className="text-xs text-info-light text-center">
                    Please answer both questions to submit.
                  </p>
                )}

                {error && (
                  <div className="flex items-center justify-center gap-2 text-sm text-error bg-error-background rounded-xl p-3">
                    <span className="material-symbols-outlined !text-[18px]">info</span>
                    <span className="text-center">{error}</span>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      <footer className="w-full py-6 bg-nav px-8 font-semibold text-xs text-nav-tab">
        © {COMPANY}
      </footer>
    </main>
  );
}