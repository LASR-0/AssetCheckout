import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComboboxField from "@/components/ui/comboboxfield";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented";
import { Sheet, Tray } from "@/components/ui/tray";
import { ChoiceChip, Flag, HolderChip, IdentityPill, StateChip } from "@/components/ui/pills";
import CountBadge from "@/components/ui/countbadge";
import { Icon } from "@/components/ui/icon";
import { Modal, ModalBody, ModalFooter, ModalHelp, ModalTitle } from "@/components/ui/modal";
import { Inspector, InspectorHeader } from "@/components/ui/inspector";
import { useToast } from "@/components/ui/toast-context";
import { RouteChain, RouteDots, RouteRail } from "@/components/ui/route-rail";
import { buildRoute, holderOf, stageMeta, type Viewer } from "@/lib/route";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  DEV ONLY: THE COMPONENT GALLERY                |
///  +-----------------------------------------------------------------+
//
//  Every redesign primitive on one page, for checking against the design
//  files side by side: flip the theme in the nav to see dark. Registered
//  in App.tsx only when import.meta.env.DEV, and lazy-loaded, so none of
//  this reaches a production bundle.
///  +-----------------------------------------------------------------+

const viewer: Viewer = { userId: 300, name: "Sarah Kim", role: "REQUESTER", stockKeeperLocations: [] };

const base = {
  userId: 300,
  userName: "Sarah Kim",
  categoryId: 1,
  categoryName: "Mobile Phones",
  requestKind: "ASSET",
  requestType: "STANDARD",
  managerId: 301,
  manager: "Grace O'Neill",
  userLocationId: 7,
  userLocationName: "Perth",
  createdAt: "2026-10-14T01:00:00Z",
  approvedAt: "2026-10-15T01:00:00Z",
  approvedBy: "Grace O'Neill",
  adminApprovedAt: "2026-10-16T01:00:00Z",
  adminApprovedBy: "Luke Barrett",
};

const SAMPLES: { title: string; request: Request }[] = [
  {
    title: "iPhone 16e · ready to collect",
    request: { ...base, id: 1042, status: "COMPLETED", fulfilledAt: "2026-10-16T01:00:00Z", collectionReadyAt: "2026-10-22T01:00:00Z" } as Request,
  },
  {
    title: "iPad A16 – Case · in transit",
    request: {
      ...base,
      id: 1057,
      requestKind: "ACCESSORY",
      status: "COMPLETED",
      needsShipping: true,
      fulfilledAt: "2026-10-21T01:00:00Z",
      shippedAt: "2026-10-24T01:00:00Z",
    } as Request,
  },
  {
    title: "Monitor · rejected as stale",
    request: {
      ...base,
      id: 990,
      requestType: "NON_STANDARD",
      status: "REJECTED",
      approvedAt: null,
      adminApprovedAt: null,
      reason: "REJECTED: Stale request\n REQUEST: Colour-accurate screen",
      rejectedBy: "Automated Job",
      rejectedAt: "2026-09-03T00:00:00Z",
    } as Request,
  },
  {
    title: "Wi-Fi Hotspot · overdue loan",
    request: {
      ...base,
      id: 975,
      requestKind: "LOAN",
      requestType: "LOAN",
      status: "COMPLETED",
      fulfilledAt: "2026-10-10T00:00:00Z",
      collectionReadyAt: "2026-10-13T00:00:00Z",
      receivedAt: "2026-10-14T00:00:00Z",
      loan: { startDate: "2026-10-14T00:00:00Z", endDate: "2026-10-25T00:00:00Z" },
    } as Request,
  },
];

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tray label={label}>
      <Sheet className="flex flex-col gap-4 p-3.5">{children}</Sheet>
    </Tray>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>;
}

const SWATCHES = [
  "canvas", "tray", "track", "sheet", "subtle", "hover", "line", "line2", "strong",
  "tx", "tx2", "tx3", "mut", "dis", "placeholder",
  "brand", "brand-tx", "brand-sub", "brand-line", "ink", "ink-hover",
  "ok", "ok-bg", "prog", "prog-bg", "stop", "stop-bg", "id1", "id2", "id3", "id4",
];

export default function UiGallery() {
  const toast = useToast();
  const [seg, setSeg] = useState<"needs" | "flight" | "done" | "all">("needs");
  const [on, setOn] = useState(true);
  const [chip, setChip] = useState("Laptops");
  const [modal, setModal] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const inspected = SAMPLES.find((s) => s.request.id === inspect);

  return (
    <div className="min-h-screen bg-canvas font-sans text-tx">
      <div className="mx-auto flex max-w-[77.5rem] flex-col gap-5 px-3 pt-5 pb-24 phone:px-8 phone:pt-7">
        <div>
          <h1 className="m-0 font-head fs-21 font-semibold tracking-head">Redesign components</h1>
          <p className="m-0 mt-1 fs-13 text-tx3">
            Dev only. Flip the theme in the nav to check dark; compare with prototype/Redesign Pages.
          </p>
        </div>

        <Section label="Tokens">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
            {SWATCHES.map((t) => (
              <div key={t} className="flex items-center gap-2 fs-11.5 text-tx2">
                <span className="size-6 shrink-0 rounded-6 border border-line" style={{ background: `var(--${t})` }} />
                {t}
              </div>
            ))}
          </div>
        </Section>

        <Section label="Type">
          <div className="flex flex-col gap-2">
            <span className="font-head fs-21 font-semibold tracking-head">Heading 21 · Urbanist</span>
            <span className="fs-16.5 font-semibold">Inspector title 16.5</span>
            <span className="fs-13.5">Operator body 13.5 · IBM Plex Sans 0123456789</span>
            <span className="fs-15">Requester body 15</span>
            <span className="font-mono fs-12.5">KSB-004812 · PF3K9Q2A · #1042</span>
            <span className="font-title fs-10 font-medium tracking-label text-mut uppercase">Small-caps label · Martian Mono</span>
          </div>
        </Section>

        <Section label="Buttons">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Row key={size}>
              <Button variant="primary" size={size}>Mark collected</Button>
              <Button variant="brand" size={size}>Publish</Button>
              <Button variant="secondary" size={size}>Back</Button>
              <Button variant="ghost" size={size}><Icon name="tune" size={16} />Filter</Button>
              <Button variant="danger" size={size}>Reject</Button>
              <Button variant="danger-solid" size={size}>Reject request</Button>
              <Button variant="link" size={size}>See all my devices</Button>
            </Row>
          ))}
          <Row>
            <Button variant="primary" disabled>Disabled primary</Button>
            <Button variant="secondary" disabled>Disabled secondary</Button>
            <Button variant="ghost" size="icon" aria-label="More"><Icon name="more_horiz" size={18} /></Button>
            <Button variant="secondary" size="icon" aria-label="Close"><Icon name="close" size={17.5} /></Button>
          </Row>
        </Section>

        <Section label="Fields">
          <div className="grid gap-3 phone:grid-cols-2">
            <Input placeholder="Search requests (md, operator)" />
            <Input size="lg" placeholder="As printed on the device (lg, requester)" />
            <Input aria-invalid placeholder="Invalid" defaultValue="Missing serial" />
            <Input disabled placeholder="Disabled" />
            <Select>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ready">Ready to deploy</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <ComboboxField
              items={["Brisbane HQ", "Toowoomba", "Sydney", "Perth", "Gladstone"]}
              defaultValue=""
              onSelect={(v) => toast(`Picked ${v}`)}
              placeholder="Site (combobox)"
              size="compact"
              keyHint="site"
            />
            <Textarea placeholder="Anything IT should know" />
            <Textarea size="lg" placeholder="In your own words (lg)" />
          </div>
        </Section>

        <Section label="Choices">
          <Row>
            <SegmentedControl
              label="View"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: "needs", label: "Needs you" },
                { value: "flight", label: "In progress" },
                { value: "done", label: "Done" },
                { value: "all", label: "All" },
              ]}
            />
            <SegmentedControl
              label="Spec"
              size="md"
              value={seg === "needs" ? "needs" : "flight"}
              onValueChange={(v) => setSeg(v)}
              options={[
                { value: "needs", label: "Standard" },
                { value: "flight", label: "Non-standard" },
              ]}
            />
          </Row>
          <Row>
            <Switch checked={on} onCheckedChange={setOn} aria-label="Ask for an event name" />
            <span className="fs-12.5">Ask for an event name</span>
            <RadioGroup defaultValue="a" className="ml-6 flex w-auto gap-4">
              {["a", "b"].map((v) => (
                <label key={v} className="flex items-center gap-2 fs-13">
                  <RadioGroupItem value={v} /> Option {v.toUpperCase()}
                </label>
              ))}
            </RadioGroup>
          </Row>
          <Row>
            {["Laptops", "Phones", "Tablets", "Monitors"].map((c) => (
              <ChoiceChip key={c} selected={chip === c} onClick={() => setChip(c)}>{c}</ChoiceChip>
            ))}
          </Row>
        </Section>

        <Section label="Pills, chips, flags and badges">
          <Row>
            <IdentityPill accent="id1">Standard asset</IdentityPill>
            <IdentityPill accent="id2">Non-standard</IdentityPill>
            <IdentityPill accent="id3">Correction</IdentityPill>
            <IdentityPill accent="id4">Loan · due 3 Nov</IdentityPill>
            <IdentityPill icon="location_on">Perth</IdentityPill>
          </Row>
          <Row>
            {["PENDING", "SHIPPED", "READY_TO_COLLECT", "ON_LOAN", "COLLECTED", "OVERDUE", "REJECTED"].map((s) => {
              const m = stageMeta(s);
              return <StateChip key={s} intent={m.intent} icon={m.icon}>{m.label}</StateChip>;
            })}
          </Row>
          <Row>
            <StateChip intent="prog" icon="storefront" size="md">Ready to collect (md)</StateChip>
            <HolderChip icon="front_hand" mine>With you</HolderChip>
            <HolderChip icon="support_agent">With IT</HolderChip>
            <HolderChip icon="local_shipping">In transit → Perth</HolderChip>
          </Row>
          <Row>
            <Flag icon="verified">Auto-approved</Flag>
            <Flag icon="edit_note">Edited</Flag>
            <Flag icon="event">Starts 12 Nov</Flag>
            <Flag icon="location_off" alert>Location missing</Flag>
            <span className="flex items-center gap-1.5 fs-13">Requests <CountBadge count={3} label="need you" /></span>
            <span className="flex items-center gap-1.5 fs-13">Stock <CountBadge count={12} tone="ink" label="to hand over" /></span>
          </Row>
        </Section>

        <Section label="Route rail · inline, micro and full">
          <div className="flex flex-col divide-y divide-line2">
            {SAMPLES.map(({ title, request }) => {
              const route = buildRoute(request);
              const holder = holderOf(request, route, viewer);
              const m = stageMeta(route.stage);
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setInspect(request.id)}
                  className="grid cursor-pointer grid-cols-1 items-center gap-3 bg-transparent py-3 text-left hover:bg-subtle phone:grid-cols-[minmax(0,1fr)_minmax(9.375rem,13.75rem)_minmax(0,11.875rem)]"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate fs-13 font-medium">{title}</span>
                    <span className="flex items-center gap-2 fs-11 text-mut">
                      <span className="font-mono fs-10.5">#{request.id}</span>
                      <RouteDots route={route} />
                    </span>
                  </span>
                  <RouteRail route={route} />
                  {holder ? (
                    <HolderChip icon={holder.icon} mine={holder.label === "With you"}>{holder.label}</HolderChip>
                  ) : (
                    <StateChip intent={m.intent} icon={m.icon}>{m.label}</StateChip>
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="Floating layers">
          <Row>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions"><Icon name="more_horiz" size={18} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon="edit">Edit request</DropdownMenuItem>
                <DropdownMenuItem icon="event">Set start date</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon="block" variant="danger">Reject</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button variant="secondary">Hover for tooltip</Button></TooltipTrigger>
                <TooltipContent>Waiting on the Perth stock keeper</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Popover>
              <PopoverTrigger asChild><Button variant="secondary">Popover</Button></PopoverTrigger>
              <PopoverContent>
                <span className="fs-13 font-medium">Starts 12 Nov</span>
                <span className="fs-12 text-tx3">Reminders are held until the start date.</span>
              </PopoverContent>
            </Popover>
            <Button variant="secondary" onClick={() => setModal(true)}>Framed modal</Button>
            <Button
              variant="secondary"
              onClick={() => toast("#1042 marked collected. How did it go?", { action: { label: "Leave feedback", onClick: () => {} } })}
            >
              Toast
            </Button>
          </Row>
        </Section>
      </div>

      <Modal open={modal} onOpenChange={setModal} label="Report a problem">
        <ModalBody>
          <ModalTitle>What's wrong with it?</ModalTitle>
          <RadioGroup defaultValue="broken" className="gap-1.5">
            {[
              ["broken", "It's not working"],
              ["mismatch", "The model or serial doesn't match what I actually have"],
              ["gone", "I no longer have it"],
            ].map(([v, l]) => (
              <label key={v} className="flex min-h-13 cursor-pointer items-center gap-3 rounded-10 border border-line px-3.5 py-2.5 fs-13 has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-sub">
                <RadioGroupItem value={v} />
                {l}
              </label>
            ))}
          </RadioGroup>
        </ModalBody>
        <ModalFooter help={<ModalHelp />}>
          <Button variant="secondary" onClick={() => setModal(false)}>Back</Button>
          <Button variant="primary" onClick={() => setModal(false)}>Continue</Button>
        </ModalFooter>
      </Modal>

      {inspected && (
        <Inspector open onClose={() => setInspect(null)} label={`Request #${inspected.request.id}`} backLabel="Gallery">
          {(() => {
            const r = inspected.request;
            const route = buildRoute(r);
            const m = stageMeta(route.stage);
            const holder = holderOf(r, route, viewer);
            return (
              <>
                <InspectorHeader
                  code={`#${r.id}`}
                  title={inspected.title.split(" · ")[0]}
                  pills={
                    <>
                      <IdentityPill accent="id1">Standard asset</IdentityPill>
                      <IdentityPill icon="location_on">{r.userLocationName}</IdentityPill>
                    </>
                  }
                  chip={<StateChip intent={m.intent} icon={m.icon}>{m.label}</StateChip>}
                  onClose={() => setInspect(null)}
                />
                <Tray label="Route">
                  <Sheet className="px-3.5 pt-1 pb-2">
                    <RouteChain route={route} holder={holder ? holder.label + holder.detail : undefined} />
                  </Sheet>
                </Tray>
              </>
            );
          })()}
        </Inspector>
      )}
    </div>
  );
}
