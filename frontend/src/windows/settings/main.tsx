import React from "react";

import ReactDOM from "react-dom/client";

import Settings from "./Settings";

import "~/styles/globals.css";

import { ThemeProvider } from "~/components/theme/theme-provider";

ReactDOM.createRoot(document.getElementById("settings") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Settings />
    </ThemeProvider>
  </React.StrictMode>,
);
