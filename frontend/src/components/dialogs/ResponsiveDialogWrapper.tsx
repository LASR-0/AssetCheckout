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
    const merged = `overflow-hidden ${className ?? ""}`;
    return <DialogContent className={merged}>{children}</DialogContent>;
  }

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