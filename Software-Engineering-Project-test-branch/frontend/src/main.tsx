import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { MOCK_LOCAL_CREDENTIALS } from "./features/auth/mock-auth";
import "./i18n";
import "./app/globals.css";

// Fails the app loudly if the dev-only gate on the mock credential table is
// ever removed, rather than silently shipping working admin logins.
if (import.meta.env.PROD && MOCK_LOCAL_CREDENTIALS.length > 0) {
  throw new Error("Mock credentials must not exist in production build");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
