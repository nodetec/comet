import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/shared/config/query-client";

import App from "./app";
import "./index.css";

createRoot(document.querySelector("#root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV ? (
        <ReactQueryDevtools
          buttonPosition="bottom-left"
          initialIsOpen={false}
          position="left"
        />
      ) : null}
    </QueryClientProvider>
  </React.StrictMode>,
);
