import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { actionFor } from "@/lib/route";
import { needCopy } from "@/lib/routeCopy";
import type { Row } from "./useHome";
import { ACTION } from "./styles";

type Props = {
  needs: Row[];
  approvals: number;
  /** The request whose action is in flight, so its button can say so. */
  busyId: number | null;
  onOpen: (row: Row) => void;
  onAct: (row: Row) => void;
};

/**
 * What is waiting on the reader, first. Their own requests get a card with
 * the action right there; approver work only gets counted, with a way into
 * Requests, because the queue lives there and is not rebuilt here.
 */
export default function NeedsYou({ needs, approvals, busyId, onOpen, onAct }: Props) {
  return (
    <>
      {needs.length > 0 && (
        <section
          aria-label="Needs you"
          className="rounded-14 bg-brand-sub p-0.75 shadow-[inset_0_0_0_1px_var(--brand-line)]"
        >
          <div className="flex items-center gap-2 px-2.5 pt-1.75 pb-1.5 font-title fs-10 font-medium tracking-label text-brand-tx uppercase">
            Needs you
            <span className="grid h-4.5 min-w-4.5 place-items-center rounded-9 bg-brand px-1.25 font-sans fs-10 font-semibold tracking-normal text-on-brand">
              {needs.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.75">
            {needs.map((row) => {
              const { r, route } = row;
              const copy = needCopy(r, route.step!);
              const action = actionFor(r, route) ?? "Open";
              const busy = busyId === r.id;
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4.5 gap-y-3.5 rounded-11 border border-brand-line bg-sheet p-4"
                >
                  <span className="grid size-11 flex-none place-items-center rounded-11 bg-brand-sub text-brand-tx">
                    <Icon name={copy.icon} size={21} weight={300} />
                  </span>
                  <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-0.75">
                    <div className="fs-14 font-semibold">{copy.title}</div>
                    <div className="fs-12.5 leading-normal text-pretty text-tx3">{copy.text}</div>
                  </div>
                  <div className="flex flex-[1_1_100%] gap-2 phone:flex-none">
                    <Button variant="secondary" className={cn(ACTION, "flex-1")} onClick={() => onOpen(row)}>
                      Details
                    </Button>
                    <Button
                      variant="primary"
                      className={cn(ACTION, "flex-1 px-4")}
                      disabled={busy}
                      onClick={() => onAct(row)}
                    >
                      {busy ? "Saving…" : action}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {approvals > 0 && (
        <Link
          to="/requests"
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-12 border border-brand-line bg-sheet py-2.5 pr-3 pl-3.5 text-tx transition-colors outline-none hover:bg-brand-sub focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            needs.length > 0 && "mt-4 phone:mt-5"
          )}
        >
          <span className="grid h-6.5 min-w-6.5 place-items-center rounded-13 bg-brand px-2 fs-11.5 font-semibold text-on-brand">
            {approvals}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="fs-13 font-semibold">Needs you</span>
            <span className="fs-11.5 text-tx3">
              {approvals === 1 ? "1 request is" : `${approvals} requests are`} waiting for your approval
            </span>
          </span>
          <span className="flex items-center gap-1 fs-12 font-medium whitespace-nowrap text-brand-tx">
            Open Requests
            <Icon name="arrow_forward" size={15.5} />
          </span>
        </Link>
      )}
    </>
  );
}
