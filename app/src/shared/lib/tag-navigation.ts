import { useShellCommandStore } from "@/shared/stores/use-shell-command-store";

export function dispatchFocusTagPath(tagPath: string) {
  useShellCommandStore.getState().actions.requestFocusTagPath(tagPath);
}
