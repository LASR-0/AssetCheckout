"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ChevronDownIcon, XIcon, CheckIcon } from "lucide-react"

const Combobox = ComboboxPrimitive.Root

///  +-----------------------------------------------------------------+
///  |            WHEEL SCROLL INSIDE A RADIX DIALOG                   |
///  +-----------------------------------------------------------------+
//
//  Radix's Dialog locks page scrolling with react-remove-scroll, which
//  registers a non-passive `wheel` listener on `document` and passes the
//  dialog content as its only "shard" (an allowed subtree). Any wheel event
//  whose target is neither inside the lock container nor inside a shard is
//  unconditionally preventDefault()-ed — see react-remove-scroll's
//  SideEffect.js, `shouldStop = !noIsolation`.
//
//  This popup is portaled to <body>, so it is outside both. The result: the
//  option list cannot be scrolled with the wheel or trackpad, while dragging
//  its scrollbar still works (a drag is not a wheel event). That asymmetry is
//  the tell.
//
//  Fix: stop the wheel event at the popup so it never reaches the listener on
//  document. Bubble phase, not capture, so descendants still see their own
//  events; native scrolling is untouched because stopPropagation does not
//  preventDefault. Scroll chaining to the page behind is already handled by
//  `overscroll-contain` on ComboboxList.
//
//  Portaling into the dialog instead would also satisfy react-remove-scroll,
//  but DialogContent is overflow-hidden AND transformed (so it forms a
//  containing block even for fixed positioning) — dropdowns near the dialog
//  edge would clip. Hence stopping the event rather than moving the popup.
///  +-----------------------------------------------------------------+

const stopWheelPropagation = (event: WheelEvent) => event.stopPropagation()

///  +-----------------------------------------------------------------+
///  |   CONFINED BY THE VIEWPORT, NOT BY WHATEVER BOX THE INPUT IS IN  |
///  +-----------------------------------------------------------------+
//
//  Base UI's positioner defaults `collisionBoundary` to `'clipping-ancestors'`,
//  which it hands straight to Floating UI: the popup is squeezed to fit inside
//  the nearest ancestor of the ANCHOR that clips — any `overflow: auto/hidden`
//  box, however small.
//
//  That is wrong for a popup that is portaled to <body>. It is not laid out
//  inside that box and cannot be clipped by it, so there is nothing for it to
//  be confined to except the screen.
//
//  WHAT IT LOOKED LIKE. Put a combobox inside a scrollable dialog body and the
//  scroll box becomes the boundary. Scroll the input near the bottom of it and
//  `--available-height` — which ComboboxList's max-height is derived from —
//  collapses to a few dozen pixels. The list gets a sliver: the options are
//  there and the wheel does nothing, because there is no room to scroll rather
//  than no permission to. (Flipping above the input is the other half of the
//  escape route — see the next block.)
//
//  What we want instead is "no boundary of your own, just the screen". Floating
//  UI ALWAYS intersects `boundary` with its `rootBoundary`, and that defaults to
//  the viewport — so handing it a rect big enough to never be the binding
//  constraint leaves the viewport as the only limit. That is what UNBOUNDED is.
//
//  DO NOT PUT `document.documentElement` HERE. It reads like the same idea and
//  it is not. Floating UI measures an element boundary as
//  `getBoundingClientRect().top + clientTop`, height `clientHeight` — and for
//  the document element that is `-scrollY` with the VIEWPORT's height. So the
//  boundary slides up the page as you scroll: at scrollY 900 on a 700px window
//  its bottom edge is 200px ABOVE the top of the screen. Everything then counts
//  as overflowing, `--available-height` goes NEGATIVE, and every popup below the
//  fold opens as a ~10px sliver. It measures correctly at scrollY 0 only, which
//  is exactly why it looked right in dialogs — react-remove-scroll pins the page
//  at 0 while one is open — and broke on the settings page, worse the further
//  down you were.
//
//  A NO-OP WHERE NOTHING CLIPS. On the request forms the anchor has no clipping
//  ancestor, so clipping-ancestors already resolved to the viewport and the
//  measurement is unchanged. Only the case that was broken moves.
//
//  Callers can still override it — the settings selectors deliberately confine
//  some popups, and this is a default, not a rule.
//
//  THE BOUNDARY WAS ONLY HALF OF IT. Confining the popup to the screen fixes
//  the case where a small scroll box was the boundary, but the screen itself
//  runs out too: a field sitting 400px down a 500px-tall viewport has ~50px
//  under it, and `--available-height` is that 50px no matter what the boundary
//  is. With `side: "none"` the popup could not go anywhere else, so it opened
//  as a ~22px sliver — one clipped row — while the space ABOVE the input sat
//  unused. It reads as a broken menu rather than a cramped one, and it "fixes
//  itself" when the window grows (or the page is zoomed out) because that is
//  the only thing that ever gave it room. `side: "flip"` lets it open upward
//  when below is the worse side, which is what every other menu here does.
//
//  `align` stays "shift" and `fallbackAxisSide` stays "none": the popup is
//  anchor-width and belongs directly above or below its input, never beside it.
///  +-----------------------------------------------------------------+

const COLLISION_AVOIDANCE = {
  side: "flip",
  align: "shift",
  fallbackAxisSide: "none",
} as const

/** A rect large enough that it never binds, so Floating UI's own root boundary
 *  — the viewport — is what actually confines the popup. Client coordinates, and
 *  a constant: unlike an element it has nothing to re-measure, so it cannot go
 *  stale on scroll or resize. */
const UNBOUNDED = { x: -1e6, y: -1e6, width: 2e6, height: 2e6 } as const

/** Ref callback for the popup element. The popup mounts only while the
 *  combobox is open, so this has to be a ref callback — an effect keyed on
 *  mount would run while the node is still absent and never see it. Relies on
 *  React 19 ref-callback cleanup. */
function useStopWheel() {
  return React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    node.addEventListener("wheel", stopWheelPropagation)
    return () => node.removeEventListener("wheel", stopWheelPropagation)
  }, [])
}

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
}) {
  return (
    <InputGroup className={cn("w-auto", className)}>
      <ComboboxPrimitive.Input
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            asChild
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          >
            <ComboboxTrigger />
          </InputGroupButton>
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  collisionBoundary,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor" | "collisionBoundary"
  >) {
  const stopWheelRef = useStopWheel()

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        // See UNBOUNDED above — the default would confine the popup to
        // whatever scrollable box the input happens to sit in.
        collisionBoundary={collisionBoundary ?? UNBOUNDED}
        collisionAvoidance={COLLISION_AVOIDANCE}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          ref={stopWheelRef}
          data-slot="combobox-content"
          data-chips={!!anchor}
          // Ring dropped to match ComboboxChips below: the popup's edge comes
          // from the border comboboxfield passes plus the shadow, so the
          // hairline ring was only doubling it up.
          className={cn("group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md duration-100 data-[chips=true]:min-w-(--anchor-width) data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className
      )}
      {...props}
    />
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  )
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className
      )}
      {...props}
    />
  )
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        // No focus ring — this was the purple one. `focus-within:ring-ring/50`
        // compiles to nothing (--ring lives in App.css, which main.tsx never
        // imports), so `focus-within:ring-3` supplied a width with no colour
        // and fell through to Tailwind's `var(--tw-ring-color, currentcolor)`.
        // comboboxfield.tsx then set --tw-ring-color globally on the field via
        // `!ring-purple-900`, and that's what filled it in. Both halves are
        // gone now; same reasoning for the aria-invalid ring, whose colour
        // class (--destructive) is equally undefined.
        "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors has-aria-invalid:border-destructive has-data-[slot=combobox-chip]:px-1 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50",
        className
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="-ml-1 opacity-50 hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
}
