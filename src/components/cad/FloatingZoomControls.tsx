import React from "react";
import {
    Minus,
    Plus,
    Home
} from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { cn } from "@/lib/utils";

export const FloatingZoomControls = () => {
    const { zoom, setZoom, setView } = useCADStore();

    const handleZoomIn = () => setZoom(Math.min(zoom + 10, 500));
    const handleZoomOut = () => setZoom(Math.max(zoom - 10, 1));

    const handleHome = () => {
        setView('home');
        setZoom(100);
    };

    return (
        <div className="flex items-center">
            {/* Zoom Out Button */}
            <button
                onClick={handleZoomOut}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
                title="Zoom Out"
            >
                <Minus className="w-4 h-4" />
            </button>

            {/* Home Button (Reset View & Zoom) */}
            <button
                onClick={handleHome}
                className={cn(
                    "p-2 mx-0.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200",
                )}
                title="Reset View (Home)"
            >
                <Home className="w-4 h-4" />
            </button>

            {/* Zoom In Button */}
            <button
                onClick={handleZoomIn}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
                title="Zoom In"
            >
                <Plus className="w-4 h-4" />
            </button>
        </div>
    );
};
