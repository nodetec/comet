import { useCommandStore } from "@/shared/stores/use-command-store";

export function dispatchFocusTagPath(tagPath: string) {
  useCommandStore.getState().actions.requestFocusTagPath(tagPath);
}
