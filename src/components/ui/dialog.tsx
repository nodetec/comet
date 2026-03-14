import { Dialog } from "@base-ui/react/dialog";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const DialogRoot = Dialog.Root;

const DialogPortal = Dialog.Portal;

const DialogClose = Dialog.Close;

function DialogBackdrop({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Backdrop>) {
  return (
    <Dialog.Backdrop
      className={cn("fixed inset-0 z-50 bg-black/60", className)}
      {...props}
    />
  );
}

function DialogPopup({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Popup>) {
  return (
    <Dialog.Popup
      className={cn(
        "bg-card fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-lg outline-none",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  DialogRoot,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
