import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// For GitHub Pages SPA routing
const query = window.location.search;
if (query.startsWith('?/')) {
  const path = query.slice(2);
  window.history.replaceState(null, '', path);
}

createRoot(document.getElementById("root")!).render(<App />);
