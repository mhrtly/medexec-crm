import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/error-boundary";
import App from "./App";
import "./index.css";

try {
  if (!window.location.hash || window.location.hash === '#') {
    history.replaceState(null, '', '#/');
  }
} catch (_) {
  // Ignore in sandboxed iframes
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
