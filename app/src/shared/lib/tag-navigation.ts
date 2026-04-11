import { useShellCommandStore } from "@/features/shell/store/use-shell-command-store";

export function dispatchFocusTagPath(tagPath: string) {
  useShellCommandStore.getState().actions.requestFocusTagPath(tagPath);
}
