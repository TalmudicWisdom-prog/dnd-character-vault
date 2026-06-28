import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerVaultServiceWorker } from "./pwa/updates";
import "./styles/global.css";

window.addEventListener("error", (event) => {
  const error = event.error as Error | undefined;
  console.error(`Global application error: ${error?.name ?? "Error"}: ${error?.message ?? event.message}`);
});

window.addEventListener("load", () => {
  void registerVaultServiceWorker();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
);
