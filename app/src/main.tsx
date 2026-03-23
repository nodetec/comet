/* eslint-disable unicorn/prefer-top-level-await */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/shared/config/query-client";

import App from "./app";
import "./index.css";

declare global {
  interface Window {
    __cometLogConsoleDetach__?: (() => void) | null;
    __cometLogConsoleAttaching__?: boolean;
  }
}

async function attachDevLogConsole() {
  if (
    !import.meta.env.DEV ||
    window.__cometLogConsoleDetach__ ||
    window.__cometLogConsoleAttaching__
  ) {
    return;
  }

  window.__cometLogConsoleAttaching__ = true;

  try {
    const { attachConsole } = await import("@tauri-apps/plugin-log");
    window.__cometLogConsoleDetach__ = await attachConsole();
  } catch {
    // Ignore when running the frontend outside the Tauri shell.
  } finally {
    window.__cometLogConsoleAttaching__ = false;
  }
}

if (import.meta.env.DEV) {
  void attachDevLogConsole();

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.__cometLogConsoleDetach__?.();
      window.__cometLogConsoleDetach__ = null;
    });
  }
}

ReactDOM.createRoot(document.querySelector("#root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  </React.StrictMode>,
);
