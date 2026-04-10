import { type RefObject, useEffect } from "react";

export function renameErrorMessage(
  input: string,
  normalizedTarget: string | null,
) {
  if (input.trim().length === 0) {
    return null;
  }

  if (normalizedTarget == null) {
    return "Enter a valid tag path.";
  }

  return null;
}

export function resetRenameDialog(params: {
  setRenameDialogOpen: (open: boolean) => void;
  setRenameSourcePath: (path: string) => void;
  setRenameInputValue: (value: string) => void;
}) {
  params.setRenameDialogOpen(false);
  params.setRenameSourcePath("");
  params.setRenameInputValue("");
}

export function submitRenameDialog(params: {
  event: { preventDefault(): void };
  renameHasChanged: boolean;
  normalizedRenameTarget: string | null;
  renameSourcePath: string;
  onRenameTag: (fromPath: string, toPath: string) => void;
  onClose: () => void;
}) {
  const {
    event,
    renameHasChanged,
    normalizedRenameTarget,
    renameSourcePath,
    onRenameTag,
    onClose,
  } = params;

  event.preventDefault();
  if (!renameHasChanged || !normalizedRenameTarget) {
    return;
  }

  onRenameTag(renameSourcePath, normalizedRenameTarget);
  onClose();
}

export function useRenameInputFocus(
  renameDialogOpen: boolean,
  renameInputRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (!renameDialogOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [renameDialogOpen, renameInputRef]);
}
