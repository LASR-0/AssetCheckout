import type { ComponentProps, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { TrayLabel } from "@/components/ui/tray";
import { BrandMark } from "@/components/ui/brand-mark";

///  +-----------------------------------------------------------------+
///  |                  THE FRAMED MODAL                               |
///  +-----------------------------------------------------------------+
//
//  A tray-coloured frame holding a white sheet, as in the designs' report-a-
//  problem flow: a header row (brand mark, small-caps label, close), the
//  sheet with the content, and a footer row (help on the left, actions on
//  the right). Centred on desktop; a bottom sheet below the phone breakpoint.
//
//  On desktop the frame and everything in it render at 1.25×: it is portaled
//  out of the page column, and at 1:1 it read as smaller than the page.
//  The width prop is the 1:1 width.
//
//  One Radix Dialog for both layouts, so focus trapping, Escape and the
//  scroll lock behave the same on a phone as on a desktop.
//
//    <Modal open onOpenChange label="Report a problem">
//      <ModalBody>
//        <ModalTitle>What's wrong with it?</ModalTitle>
//        ...
//      </ModalBody>
//      <ModalFooter help={<ModalHelp onClick={...} />}>
//        <Button>Back</Button>
//        <Button variant="primary">Continue</Button>
//      </ModalFooter>
//    </Modal>
///  +-----------------------------------------------------------------+

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The small-caps label in the frame's header. */
  label: ReactNode;
  children: ReactNode;
  /** Frame width on desktop, in design px. */
  width?: number;
  className?: string;
};

export function Modal({ open, onOpenChange, label, children, width = 560, className }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-80 bg-scrim data-[state=open]:animate-fade-in motion-reduce:animate-none" />
        {/* Positioning wrapper rather than translate-centring, so the frame
            can be a bottom sheet on phones and grow to the viewport height. */}
        <div className="pointer-events-none fixed inset-0 z-80 flex items-end justify-center pt-6 phone:items-center phone:p-6">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            style={{ maxWidth: `${width / 16}rem` }}
            className={cn(
              "pointer-events-auto flex max-h-full w-full flex-col rounded-t-16 border border-line bg-tray px-1 pt-1 pb-4 shadow-modal outline-none",
              "data-[state=open]:animate-sheet-up phone:rounded-16 phone:pb-1 phone:[zoom:1.25] phone:data-[state=open]:animate-pop-in motion-reduce:animate-none",
              "max-phone:max-w-none!",
              className
            )}
          >
            <div className="flex items-center gap-2.5 pt-2 pr-1.5 pb-2.25 pl-2.5">
              <BrandMark />
              <TrayLabel>{label}</TrayLabel>
              <span className="flex-1" />
              <DialogPrimitive.Close
                aria-label="Close"
                className="grid size-9 cursor-pointer place-items-center rounded-9 text-mut outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon name="close" size={17.5} />
              </DialogPrimitive.Close>
            </div>
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The white sheet the content sits on. Scrolls when the content is long. */
export function ModalBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-12 border border-line bg-sheet px-4.5 pt-5 pb-5.5",
        className
      )}
      {...props}
    />
  );
}

/** Required once per modal: it is the dialog's accessible name. */
export function ModalTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("m-0 font-head fs-16.5 leading-[1.3] font-semibold text-tx", className)}
      {...props}
    />
  );
}

type ModalFooterProps = ComponentProps<"div"> & {
  /** Left-aligned, usually <ModalHelp>. */
  help?: ReactNode;
};

export function ModalFooter({ help, className, children, ...props }: ModalFooterProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 px-2.5 pt-2.5 pb-1.5", className)}
      {...props}
    >
      {help}
      <span className="flex-1" />
      {children}
    </div>
  );
}

/** The quiet "How this works" link in a modal footer. */
export function ModalHelp({
  children = "How this works",
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex cursor-pointer items-center gap-1 rounded-6 p-0 font-sans fs-11.5 font-medium text-tx3 outline-none hover:text-tx focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className
      )}
      {...props}
    >
      <Icon name="help" size={15} />
      {children}
    </button>
  );
}
