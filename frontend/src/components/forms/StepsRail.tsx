import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";

export type Step = {
  id: string;
  label: string;
  /** What has been chosen, shown under the label. */
  value?: string | null;
  done: boolean;
  error: boolean;
};

/** The form's sections down the left on wide screens: what's done, what's wrong. */
export function StepsRail({ label, steps, onGo }: { label: string; steps: Step[]; onGo: (id: string) => void }) {
  return (
    <Tray label={label}>
      <Sheet className="p-1">
        {steps.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onGo(s.id)}
            className="grid w-full cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-8 border-0 bg-transparent px-2 py-2.25 text-left font-sans outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            {s.error ? (
              <Icon name="error" size={18} fill className="grid size-5 place-items-center text-stop" />
            ) : s.done ? (
              <span className="m-px grid size-4.5 place-items-center rounded-full bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]">
                <Icon name="check" size={12} />
              </span>
            ) : (
              <span className="m-1.25 size-2.5 rounded-full border-[1.5px] border-strong" />
            )}
            <span className="flex min-w-0 flex-col gap-px">
              <span className={cn("fs-13 font-medium", s.error ? "text-stop" : "text-tx")}>{s.label}</span>
              {s.value && <span className="truncate fs-12 text-tx3">{s.value}</span>}
            </span>
          </button>
        ))}
      </Sheet>
    </Tray>
  );
}
