export const APP_VERSION = "1.1.0";
// Vitest renders Settings outside Vite's build-time replacement step.
export const BUILD_ID = typeof __BUILD_ID__ === "undefined" ? "development" : __BUILD_ID__;
