export const FOCUS_TAG_PATH_EVENT = "comet:focus-tag-path";

export type FocusTagPathDetail = {
  tagPath: string;
};

export function dispatchFocusTagPath(tagPath: string) {
  window.dispatchEvent(
    new CustomEvent<FocusTagPathDetail>(FOCUS_TAG_PATH_EVENT, {
      detail: { tagPath },
    }),
  );
}
