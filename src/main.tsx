import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Load extensions before app renders
import { loadBuiltinExtensions } from "./lib/extensions";
loadBuiltinExtensions();

createRoot(document.getElementById("root")!).render(<App />);
