import React, { useState } from "react";
import {
  Hand,
  Rotate3d,
  ZoomIn,
  Eye,
  Maximize2,
  Scissors,
  Ruler,
  ChevronUp,
  Grid3X3,
  Palette,
  Video,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Cloud,
  Box,
  Monitor
} from "lucide-react";
import { useCADStore, useCADStoreApi } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { FloatingZoomControls } from "./FloatingZoomControls";
import { GridToggle } from "./GridToggle";


const StatusBar = () => {
  const {
    zoom,
    setZoom,
    gridVisible,
    toggleGrid,
    activeTool,
    setActiveTool,
    objects,
    selectedIds,
    syncStatus,
    hasUnpushedChanges,
    isSaving,
    projectionMode,
    setProjectionMode,
    backgroundMode,
    setBackgroundMode,
    sectionViewEnabled,
    toggleSectionView,
    showMeasurements,
    toggleMeasurements,
    toggleFullscreen
  } = useCADStore();

  const api = useCADStoreApi();

  // Measurement details calculation
  const getSelectedObjectInfo = () => {
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      const obj = objects.find(o => o.id === id || id.startsWith(o.id + ':'));
      if (obj) {
        const x = obj.position[0].toFixed(2);
        const y = obj.position[1].toFixed(2);
        const z = obj.position[2].toFixed(2);
        // todo:everything Replace dummy mass with actual mass/volume computation from geometry metadata.
        // Dummy mass calculation based on bounding box or random for demo
        const mass = (Math.random() * 100 + 10).toFixed(1);
        return `X: ${x} Y: ${y} Z: ${z} | Mass: ${mass}g`;
      }
    }
    return "No object selected";
  };

  return (
    <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center z-50 pointer-events-none px-6">
      {/* Center section - Main controls */}
      <div className="flex items-center bg-background/80 backdrop-blur-md rounded-full px-2 py-1 border border-border/50 gap-1 shadow-2xl pointer-events-auto">
        {/* Pan */}
        <button
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            activeTool === 'pan' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTool(activeTool === 'pan' ? 'select' : 'pan')}
          title="Pan (P)"
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Orbit */}
        <button
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            activeTool === 'orbit' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTool(activeTool === 'orbit' ? 'select' : 'orbit')}
          title="Orbit (O)"
        >
          <Rotate3d className="w-4 h-4" />
        </button>

        {/* Zoom */}
        <div className="mx-1">
          <FloatingZoomControls />
        </div>

        <div className="w-px h-6 bg-border/30 mx-1" />

        {/* Viewing Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 flex items-center gap-0.5">
              <Eye className="w-4 h-4" />
              <ChevronUp className="w-3 h-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="mb-2 min-w-[200px]">
            <GridToggle />
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="w-4 h-4 mr-2" />
                Change background
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="ml-2">
                  <DropdownMenuItem onClick={() => setBackgroundMode('default')}>Default</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBackgroundMode('studio')}>Studio</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('nature')}>Nature</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('city')}>City</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('sunset')}>Sunset</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('warehouse')}>Warehouse</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBackgroundMode('dark')}>Solid Dark</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('light')}>Solid Light</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBackgroundMode('blue')}>Solid Blue</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Video className="w-4 h-4 mr-2" />
                Kamera
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="ml-2">
                  <DropdownMenuItem onClick={() => setProjectionMode('orthographic')} className={cn(projectionMode === 'orthographic' && "bg-accent")}>
                    Orthogonal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setProjectionMode('perspective')} className={cn(projectionMode === 'perspective' && "bg-accent")}>
                    Perspective
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setProjectionMode('perspective-with-ortho-faces')} className={cn(projectionMode === 'perspective-with-ortho-faces' && "bg-accent")}>
                    Perspective with orthogonal Surfaces
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Full Screen */}
        <button
          className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
          onClick={() => toggleFullscreen()}
          title="Fullscreen (F)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Section View */}
        <button
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            sectionViewEnabled ? "bg-amber-500/20 text-amber-500 shadow-sm" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
          )}
          onClick={() => {
            toggleSectionView();
            toast(sectionViewEnabled ? "Section view disabled" : "Section view enabled (Preview)");
          }}
          title="Section View"
        >
          <Scissors className="w-4 h-4" />
        </button>

        {/* Show Measurements */}
        <button
          className={cn(
            "p-2 rounded-full transition-all duration-200",
            showMeasurements ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
          )}
          onClick={() => toggleMeasurements()}
          title="Show Measurement Details"
        >
          <Ruler className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Measurement Details (to the right of the center controls) */}
      {showMeasurements && (
        <div className="ml-4 flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-md rounded-full border border-border/50 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-500 pointer-events-auto">
          <Ruler className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground whitespace-nowrap">
            {getSelectedObjectInfo()}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatusBar;
