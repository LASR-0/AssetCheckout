import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { PreviewState, PreviewStep } from "@/lib/formRoute";

const ON: PreviewState[] = ["done", "current"];

function Marker({ state }: { state: PreviewState }) {
  switch (state) {
    case "done":
      return (
        <span className="grid size-4 place-items-center rounded-full bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]">
          <Icon name="check" size={11} />
        </span>
      );
    case "now":
      return <span className="my-0.5 size-3 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-sub)]" />;
    case "current":
      return <span className="my-0.5 size-3 rounded-full bg-prog shadow-[0_0_0_3px_var(--prog-bg)]" />;
    case "loop":
      return (
        <span className="grid size-4 place-items-center rounded-full border-[1.5px] border-strong bg-sheet text-tx3">
          <Icon name="u_turn_left" size={11} />
        </span>
      );
    default:
      return <span className="my-0.75 size-2.5 rounded-full border-[1.5px] border-strong bg-sheet" />;
  }
}

/**
 * A predicted route (lib/formRoute), drawn as a vertical line of steps. With
 * `sentOn`, the done steps carry that date and the current one says "now",
 * as on the success page.
 */
export function RoutePreview({ steps, sentOn, className }: { steps: PreviewStep[]; sentOn?: string; className?: string }) {
  const last = steps.length - 1;
  return (
    <ol className={cn("m-0 list-none p-0", className)}>
      {steps.map((s, i) => {
        const nextOn = i < last && ON.includes(steps[i + 1].state);
        const date = sentOn === undefined ? null : s.state === "done" ? sentOn : s.state === "current" ? "now" : "";
        return (
          <li
            key={s.title}
            className={cn(
              "grid gap-x-3",
              date === null ? "grid-cols-[1.125rem_minmax(0,1fr)]" : "grid-cols-[1.125rem_minmax(0,1fr)_auto]"
            )}
          >
            <div className="flex flex-col items-center" aria-hidden>
              <span
                className={cn("min-h-2.5 w-0", i > 0 && "border-l-[1.5px]", ON.includes(s.state) ? "border-tx2" : "border-strong")}
              />
              <Marker state={s.state} />
              <span
                className={cn("min-h-2.5 w-0 flex-1", i < last && "border-l-[1.5px]", nextOn ? "border-tx2" : "border-strong")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 pt-2 pb-2.5">
              <span
                className={cn(
                  "fs-13",
                  s.state === "now" || s.state === "current" ? "font-semibold" : "font-medium",
                  s.state === "future" || s.state === "loop" ? "text-tx2" : "text-tx"
                )}
              >
                {s.title}
                {s.state === "current" && <span className="sr-only"> (where it is now)</span>}
              </span>
              <span className="fs-12 leading-[1.45] text-pretty text-tx3">{s.sub}</span>
              {s.flag && (
                <span className="mt-0.5 flex items-center gap-1 fs-11.5 text-ok">
                  <Icon name={s.flag.icon} size={14} />
                  {s.flag.text}
                </span>
              )}
            </div>
            {date !== null && (
              <span className={cn("py-2.25 fs-11 whitespace-nowrap", date === "now" ? "font-medium text-prog" : "text-mut")}>
                {date}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The same route as a row of dots, for the phone's submit bar. */
export function RouteDotsPreview({ steps }: { steps: PreviewStep[] }) {
  return (
    <span aria-hidden className="flex flex-none items-center gap-1">
      {steps.map((s) => (
        <span
          key={s.title}
          className={cn(
            "size-1.75 rounded-full",
            s.state === "done" ? "bg-ok" : s.state === "now" ? "bg-brand" : s.state === "current" ? "bg-prog" : "border-[1.5px] border-strong"
          )}
        />
      ))}
    </span>
  );
}
