import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { DEV_CREDENTIALS } from "./features/auth/dev-credentials";
import "./i18n";
import "./app/globals.css";

// Fails the app loudly if the dev-only gate on the credential table is ever
// removed, rather than silently shipping working admin logins. These are real
// seeded accounts with published passwords, so this is the last line of
// defence, not a formality.
if (import.meta.env.PROD && DEV_CREDENTIALS.length > 0) {
  throw new Error("Development credentials must not exist in a production build");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
