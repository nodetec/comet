import React from "react";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import ReactDOM from "react-dom/client";

import Settings from "./Settings";

import "~/styles/globals.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "~/components/theme/theme-provider";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("settings") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools buttonPosition="top-right" />
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Settings />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
