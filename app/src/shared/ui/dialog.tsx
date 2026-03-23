import { Dialog } from "@base-ui/react/dialog";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/shared/lib/utils";

const DialogRoot = Dialog.Root;

const DialogPortal = Dialog.Portal;

const DialogClose = Dialog.Close;

function DialogBackdrop({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Backdrop>) {
  return (
    <Dialog.Backdrop
      className={cn(
        "pointer-events-auto fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 data-[closed]:opacity-0 data-[open]:opacity-100",
        className,
      )}
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
        "bg-card text-card-foreground border-accent fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-lg transition-all duration-200 outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[open]:scale-100 data-[open]:opacity-100",
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
    <Dialog.Title className={cn("text-sm font-medium", className)} {...props} />
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
