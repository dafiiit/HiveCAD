import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Load extensions before app renders
import { loadBuiltinExtensions } from "./lib/extensions";
loadBuiltinExtensions();

// Load debug tools (attaches to window.__hiveDebug)
import './lib/storage/debug';

const initApp = async () => {
    createRoot(document.getElementById("root")!).render(<App />);
};

initApp();
