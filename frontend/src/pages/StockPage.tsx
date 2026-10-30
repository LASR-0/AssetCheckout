import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Inspector } from "@/components/ui/inspector";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast-context";
import { useTourReady } from "@/components/tour/TourProvider";
import { invalidateWorkflow } from "@/api/queries";
import { markReadyToCollect } from "@/api/requests";
import { returnLoan } from "@/api/loans";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { requestTitle } from "@/lib/requestDisplay";
import { Docket } from "@/components/requests/Docket";
import type { LogRow } from "@/components/requests/useRequestLog";
import { Queues, type QueueKind } from "@/components/stock/Queues";
import { Ledger } from "@/components/stock/Ledger";
import { useStock, type Site } from "@/components/stock/useStock";

///  +-----------------------------------------------------------------+
///  |                  STOCK                                          |
///  +-----------------------------------------------------------------+
//
//  The stock keeper's page. It opens on the work: the requests at this site
//  waiting on them, with the action on each row (mark it ready, mark a loan
//  returned). Beside it, the ledger of what Snipe-IT says is physically
//  here, which answers "whose is that one on the shelf?".
//
//  A keeper picks between their own sites; an admin can open any site to
//  cover for an absent keeper, and is told whose site they're covering.
//
//  Opening a queue row shows its docket (the request log's own), in place
//  of the ledger on desktop, sliding over the page on a phone.
///  +-----------------------------------------------------------------+

function Dot({ colour }: { colour: string | null }) {
  return <span aria-hidden className={cn("size-2 flex-none rounded-full", !colour && "bg-strong")} style={colour ? { background: colour } : undefined} />;
}

function SitePicker({ stock, onPick, className }: { stock: ReturnType<typeof useStock>; onPick: (s: Site) => void; className?: string }) {
  const { site, sites, admin } = stock;
  const waiting = site ? stock.waitingAt(site.id) : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 w-full cursor-pointer items-center gap-2 rounded-9 border border-strong bg-sheet pr-2 pl-3 font-sans fs-13.5 font-medium whitespace-nowrap text-tx outline-none hover:border-mut focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:border-brand max-phone:h-11",
          className
        )}
      >
        <Icon name="location_on" size={17} weight={300} className="text-mut" />
        {site && <Dot colour={stock.colourOf(site.id)} />}
        <span className="min-w-0 flex-1 truncate text-left">{site ? site.name : "Choose a location"}</span>
        {waiting > 0 && <span className="fs-12 font-normal text-mut">{waiting} waiting</span>}
        <Icon name="expand_more" size={18} className="text-mut" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(30rem,var(--radix-dropdown-menu-content-available-height))] w-80 max-phone:w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel className="px-2.5 pt-2 pb-1.5 font-title fs-10 font-medium tracking-label text-mut uppercase">
          {admin ? "Any site" : "Your sites"}
        </DropdownMenuLabel>
        {sites.map((s) => {
          const n = stock.waitingAt(s.id);
          const keeper = admin ? stock.keeperOf(s.id) : null;
          const sub = admin
            ? stock.keeps(s.id)
              ? "You keep this site"
              : stock.keepersKnown
                ? keeper
                  ? `Keeper: ${keeper}`
                  : "No keeper · falls to IT"
                : n
                  ? `${n} waiting to hand over`
                  : "Nothing waiting"
            : n
              ? `${n} waiting to hand over`
              : "Nothing waiting";
          return (
            <DropdownMenuItem key={s.id} onSelect={() => onPick(s)} className={cn("min-h-11.5 gap-2.5", s.id === site?.id && "bg-subtle")}>
              <Dot colour={stock.colourOf(s.id)} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate fs-13.5 font-medium">{s.name}</span>
                <span className={cn("fs-12", admin && stock.keepersKnown && !keeper && !stock.keeps(s.id) ? "text-prog" : "text-mut")}>{sub}</span>
              </span>
              {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-10 bg-track px-1.5 fs-11.5 font-semibold text-tx2">{n}</span>}
              {s.id === site?.id && <Icon name="check" size={18} className="text-brand" />}
            </DropdownMenuItem>
          );
        })}
        {admin && (
          <>
            <DropdownMenuSeparator />
            <p className="m-0 px-2.5 pt-1 pb-1.5 fs-12 leading-[1.45] text-mut">Admins can open any site to cover for an absent keeper.</p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notice({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-start justify-center px-3 pt-2 pb-30 phone:p-6">
      <div className="flex max-w-115 flex-col items-start gap-2.5 rounded-14 border border-line bg-sheet p-5.5">
        <span className="grid size-10 place-items-center rounded-10 bg-track text-tx2">
          <Icon name={icon} size={20} weight={300} />
        </span>
        {children}
      </div>
    </div>
  );
}

export default function StockPage() {
  const stock = useStock();
  const toast = useToast();
  const phone = !useMediaQuery("(min-width: 36rem)");
  const wide = useMediaQuery("(min-width: 75rem)");
  useTourReady(!stock.loading);

  const [sel, setSel] = useState<number | null>(null);
  const [pending, setPending] = useState<Record<number, string>>({});
  const [flash, setFlash] = useState<number | null>(null);

  const { site, queues, viewer } = stock;
  const all = [...queues.hand, ...queues.ready, ...queues.loans];
  const selected = sel == null ? null : all.find((x) => x.r.id === sel) ?? null;

  // The floating docket keeps its last request while it slides away.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected && selected !== lastSelected) setLastSelected(selected);

  useEffect(() => {
    if (phone || sel == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, sel]);

  function pickSite(s: Site) {
    stock.pickSite(s.id);
    setSel(null);
  }

  function landed(id: number) {
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  }

  async function act(row: LogRow, kind: QueueKind) {
    const r = row.r;
    if (pending[r.id]) return;
    const loan = kind === "loans";
    setPending((p) => ({ ...p, [r.id]: loan ? "Checking in…" : "Marking ready…" }));
    try {
      if (loan) {
        const res = await returnLoan(r.id);
        await invalidateWorkflow();
        if (!res.checkedIn) toast(`${res.message} The loan is still open; try the return again.`);
        else toast(`${requestTitle(r)} checked back in to Snipe-IT. The loan is closed.`);
      } else {
        await markReadyToCollect(r.id);
        await invalidateWorkflow();
        landed(r.id);
        toast(`Marked ready. ${r.userName} has been emailed to collect it.`);
      }
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "That didn't go through. Please try again.");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[r.id];
        return next;
      });
    }
  }

  const keeper = site && stock.admin && !stock.keeps(site.id) && stock.keepersKnown ? stock.keeperOf(site.id) : null;
  const covering = !!site && stock.admin && !stock.keeps(site.id);
  const sub = !stock.canUse
    ? "For stock keepers: what is waiting at your site, and what is on the shelf."
    : site
      ? `What's at ${site.name}, who's holding it, and what's waiting on ${covering ? "the keeper" : "you"}.`
      : "Pick a location to act as its stock keeper.";

  const docket = (row: LogRow) => <Docket key={row.r.id} row={row} viewer={viewer} intent="look" onLanded={landed} />;

  return (
    <div className={cn("mx-auto flex w-full max-w-[calc(50%+45rem)] flex-col", !phone && "h-full min-h-0 [zoom:1.15]")}>
      <div className="relative z-20 flex flex-none flex-wrap items-end gap-x-6 gap-y-3 px-3 pt-4.5 pb-3 phone:px-6 phone:pt-5.5 phone:pb-4">
        <div className="min-w-0 flex-[1_1_17.5rem]">
          <h1 className="m-0 font-head fs-21 font-medium tracking-head">Stock</h1>
          <p className="m-0 mt-0.75 fs-13 text-pretty text-mut">{sub}</p>
        </div>
        {stock.canUse && <SitePicker stock={stock} onPick={pickSite} className="phone:w-70" />}
      </div>

      {covering && (
        <div className="mx-3 mb-3 flex flex-none items-center gap-2 rounded-9 bg-brand-sub px-3 py-2 fs-13 text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)] phone:mx-6 phone:mb-3.5">
          <Icon name={keeper ? "swap_horiz" : "support_agent"} size={17} />
          <span className="text-pretty">
            {keeper
              ? `You're covering for ${keeper}, the ${site.name} stock keeper. Anything you do here is recorded as you.`
              : stock.keepersKnown
                ? `No stock keeper is assigned at ${site.name}, so its handovers fall to IT. You're covering.`
                : `You're covering ${site.name} as an admin. Anything you do here is recorded as you.`}
          </span>
        </div>
      )}

      {stock.authLoading ? null : !stock.canUse ? (
        <Notice icon="inventory_2">
          <div className="fs-15 font-medium">You aren't assigned as a stock keeper.</div>
          <div className="fs-13.5 leading-[1.55] text-pretty text-tx3">
            If this looks wrong, ask IT to assign you to your location under Settings → Stock Keepers.
          </div>
        </Notice>
      ) : !site ? (
        <Notice icon="location_on">
          <div className="fs-13.5 leading-[1.55] text-pretty text-tx2">
            You can act as stock keeper anywhere, so pick a location above to see its handover queue and what Snipe-IT records there.
          </div>
          <SitePicker stock={stock} onPick={pickSite} className="w-auto max-phone:w-full" />
        </Notice>
      ) : (
        <div
          className={cn(
            "grid gap-5",
            phone ? "grid-cols-1 px-3 pb-40" : "min-h-0 flex-1 px-6",
            !phone && (wide ? "grid-cols-[minmax(27.5rem,32.5rem)_minmax(0,1fr)]" : "grid-cols-[minmax(25rem,28.75rem)_minmax(0,1fr)]")
          )}
        >
          <div className={cn("flex min-w-0 flex-col gap-3.5", !phone && "min-h-0 overflow-auto pr-0.5 pb-6")}>
            <Queues
              queues={queues}
              canAct={stock.canAct}
              pending={pending}
              flash={flash}
              selected={phone ? null : sel}
              phone={phone}
              onOpen={(row) => setSel(row.r.id)}
              onAct={(row, kind) => void act(row, kind)}
            />
          </div>

          {/* The ledger scrolls its own table; only the docket scrolls the column. */}
          <div className={cn("min-w-0", !phone && "flex min-h-0 flex-col pb-6", !phone && selected && "overflow-auto")}>
            {!phone && selected ? (
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <Button variant="secondary" className="h-8 gap-1 pr-2.5 pl-1.5 fs-13" onClick={() => setSel(null)}>
                    <Icon name="arrow_back" size={18} />
                    Back to the ledger
                  </Button>
                  <kbd className="font-sans fs-12 text-mut">Esc</kbd>
                </div>
                {docket(selected)}
              </div>
            ) : (
              <Ledger key={site.id} site={site} me={viewer.name} phone={phone} fill={!phone} />
            )}
          </div>
        </div>
      )}

      {phone && (
        <Inspector open={!!selected} onClose={() => setSel(null)} label={selected ? `Request #${selected.r.id}` : "Request"} backLabel="Stock" className="bg-canvas">
          {(selected ?? lastSelected) && docket((selected ?? lastSelected)!)}
        </Inspector>
      )}
    </div>
  );
}
