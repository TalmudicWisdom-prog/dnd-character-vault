import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/global.css";

window.addEventListener("error", (event) => {
  const error = event.error as Error | undefined;
  console.error(`Global application error: ${error?.name ?? "Error"}: ${error?.message ?? event.message}`);
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("sw.js", document.baseURI);
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL }).catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
