import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Footer actions (buttons). Omit for a footer-less panel. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Centered dialog (Radix). Overlay click + Esc close it. Use for create/edit
 * forms and confirmations. Body scrolls if content overflows.
 */
export function Modal({ open, onClose, title, subtitle, footer, children }: BaseProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {subtitle ? <DialogDescription>{subtitle}</DialogDescription> : null}
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Right-anchored slide-over panel (Radix). Use for record detail views where the
 * list should stay visible in context. Same close behavior as Modal.
 */
export function SlideOver({ open, onClose, title, subtitle, footer, children }: BaseProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default Modal;
