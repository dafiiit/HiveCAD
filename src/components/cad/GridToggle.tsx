import React from "react";
import { Grid3X3 } from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const GridToggle = () => {
    const { gridVisible, toggleGrid } = useCADStore();

    return (
        <div className="flex items-center justify-between w-full px-2 py-1.5 gap-2">
            <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="grid-toggle" className="text-sm font-medium cursor-pointer">
                    Show Grid
                </Label>
            </div>
            <Switch
                id="grid-toggle"
                checked={gridVisible}
                onCheckedChange={toggleGrid}
            />
        </div>
    );
};
