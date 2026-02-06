import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Load extensions before app renders
import { loadBuiltinExtensions } from "./lib/extensions";
loadBuiltinExtensions();

// Initialize StorageManager
import { StorageManager } from "./lib/storage/StorageManager";

const initApp = async () => {
    await StorageManager.getInstance().initialize();

    createRoot(document.getElementById("root")!).render(<App />);
};

initApp();
