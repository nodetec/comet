import React from "react";

import ReactDOM from "react-dom/client";

import App from "./App";

import "~/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "~/components/ui/sonner";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* <ReactQueryDevtools buttonPosition="top-left" /> */}
      <App />
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
