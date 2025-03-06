import React from "react";

import ReactDOM from "react-dom/client";

import App from "./App";

import "~/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";

const queryClient = new QueryClient({
  // defaultOptions: {
  //   queries: {
  //     placeholderData: (prev) => prev,
  //   },
  // },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* <ReactQueryDevtools buttonPosition="bottom-right" /> */}
      <TooltipProvider>
        <App />
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
