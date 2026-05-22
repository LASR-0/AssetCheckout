import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import type { ReactNode } from "react";

///  +-----------------------------------------------------------------+
///  |                     RESPONSIVE DIALOG WRAPPER                   |
///  +-----------------------------------------------------------------+
//
//  Picks between Dialog (desktop, ≥768px) and Drawer (mobile, <768px) at
//  render time based on the viewport.
//
//  The shape matches shadcn's Dialog API exactly so existing dialog files
//  can swap their imports with minimal other changes.
//
//  Style notes:
//    - className on ResponsiveDialogContent applies to both branches. Width
//      constraints (`min-w-[640px]`, etc.) only have effect on desktop because
//      drawers are inherently full-width.
//    - The drawer's draggable handle and rounded top-corners are baked into
//      shadcn's DrawerContent — no extra config needed.
//    - On mobile, the whole drawer scrolls as one continuous surface. We wrap
//      children in an internal scrollable div inside DrawerContent rather than
//      trying to put overflow-y on DrawerContent itself. This sidesteps two
//      shadcn defaults that would otherwise fight us:
//        1. DrawerContent is `flex flex-col`
//        2. DrawerFooter has `mt-auto`, pushing itself to the bottom of the
//           flex container and creating phantom whitespace above it
//      With our own div as a single child of DrawerContent, the flex layout
//      collapses (one child, nothing to distribute), mt-auto becomes a no-op,
//      and we get clean linear scroll.
///  +-----------------------------------------------------------------+

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
}: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      {children}
    </Drawer>
  );
}

type ResponsiveContentProps = {
  className?: string;
  children: ReactNode;
};

export function ResponsiveDialogContent({
  className,
  children,
}: ResponsiveContentProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    // Desktop: keep shadcn's DialogContent default behaviour, plus clip overflow
    // to rounded corners (so the bottom gradient ribbon stays inside the curve).
    const merged = `overflow-hidden ${className ?? ""}`;
    return <DialogContent className={merged}>{children}</DialogContent>;
  }

  // Mobile drawer: keep className styling (background, border, rounded corners,
  // etc.) on DrawerContent, then introduce our own scrollable wrapper as the
  // single child. By being the only flex child, our wrapper renders as a normal
  // block — meaning the body's children flow naturally without DrawerFooter's
  // mt-auto creating phantom whitespace.
  return (
    <DrawerContent className={className}>
      <div className="w-full overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </DrawerContent>
  );
}

export function ResponsiveDialogHeader({
  className,
  children,
}: ResponsiveContentProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogHeader className={className}>{children}</DialogHeader>;
  }

  return <DrawerHeader className={className}>{children}</DrawerHeader>;
}

export function ResponsiveDialogTitle({
  className,
  children,
}: ResponsiveContentProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogTitle className={className}>{children}</DialogTitle>;
  }

  return <DrawerTitle className={className}>{children}</DrawerTitle>;
}

export function ResponsiveDialogFooter({
  className,
  children,
}: ResponsiveContentProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogFooter className={className}>{children}</DialogFooter>;
  }

  return <DrawerFooter className={className}>{children}</DrawerFooter>;
}