import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/query-client";

import "./index.css";

const isMobile =
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  ("ontouchstart" in window && window.innerWidth < 768);

const App = lazy(() =>
  isMobile ? import("./mobile/mobile-app") : import("./App"),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <App />
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
