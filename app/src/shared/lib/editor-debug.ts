type EditorDebugPayload = Record<string, unknown>;

declare global {
  interface Window {
    __COMET_DEBUG_EDITOR?: boolean;
    __COMET_DISABLE_LIST_EXTENSIONS?: boolean;
    __COMET_DISABLE_LIST_DECORATIONS?: boolean;
    __COMET_DISABLE_LIST_INTERACTIONS?: boolean;
    __COMET_DISABLE_LIST_SELECTION_NORMALIZATION?: boolean;
  }
}

function hasLocalStorageDebugFlag() {
  try {
    return window.localStorage.getItem("comet:debug-editor") === "1";
  } catch {
    return false;
  }
}

export function isEditorDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.__COMET_DEBUG_EDITOR === true || hasLocalStorageDebugFlag();
}

export function isListExtensionsDisabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.__COMET_DISABLE_LIST_EXTENSIONS === true ||
      window.localStorage.getItem("comet:disable-list-extensions") === "1"
    );
  } catch {
    return window.__COMET_DISABLE_LIST_EXTENSIONS === true;
  }
}

export function isListDecorationsDisabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.__COMET_DISABLE_LIST_DECORATIONS === true ||
      window.localStorage.getItem("comet:disable-list-decorations") === "1"
    );
  } catch {
    return window.__COMET_DISABLE_LIST_DECORATIONS === true;
  }
}

export function isListInteractionsDisabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.__COMET_DISABLE_LIST_INTERACTIONS === true ||
      window.localStorage.getItem("comet:disable-list-interactions") === "1"
    );
  } catch {
    return window.__COMET_DISABLE_LIST_INTERACTIONS === true;
  }
}

export function isListSelectionNormalizationDisabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.__COMET_DISABLE_LIST_SELECTION_NORMALIZATION === true ||
      window.localStorage.getItem(
        "comet:disable-list-selection-normalization",
      ) === "1"
    );
  } catch {
    return window.__COMET_DISABLE_LIST_SELECTION_NORMALIZATION === true;
  }
}

export function logEditorDebug(
  scope: string,
  message: string,
  payload?: EditorDebugPayload,
) {
  if (!isEditorDebugEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  if (payload) {
    console.debug(`[comet-editor:${scope}] ${message} @ ${timestamp}`, payload);
    return;
  }

  console.debug(`[comet-editor:${scope}] ${message} @ ${timestamp}`);
}

export function summarizeRanges(
  ranges: readonly { from: number; to: number }[],
  limit = 8,
) {
  const summary = ranges.slice(0, limit).map(({ from, to }) => `${from}-${to}`);
  if (ranges.length > limit) {
    summary.push(`...+${ranges.length - limit}`);
  }
  return summary;
}
