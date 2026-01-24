import {
  Hand,
  Save,
  MousePointer,
  Camera,
  Grid3X3,
  Maximize2,
  Settings,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";

const StatusBar = () => {
  const {
    zoom,
    setZoom,
    gridVisible,
    toggleGrid,
    activeTool,
    setActiveTool,
    save,
    fitToScreen,
    objects,
    selectedIds,
    isSaved
  } = useCADStore();

  const handlePan = () => {
    setActiveTool('pan');
    toast("Pan mode: drag to move view");
  };

  const handleSave = () => {
    save();
    toast.success("Project saved");
  };

  const handleSelect = () => {
    setActiveTool('select');
    toast("Select mode");
  };

  const handleCamera = () => {
    setActiveTool('orbit');
    toast("Orbit mode: drag to rotate view");
  };

  const handleToggleGrid = () => {
    toggleGrid();
    toast(gridVisible ? "Grid hidden" : "Grid visible");
  };

  const handleFitToScreen = () => {
    // fitToScreen(); - Replaced by Fullscreen logic
    useCADStore.getState().toggleFullscreen();
    // toast("View fit to screen"); - Toast will be handled if needed, or self-evident
  };

  const handleZoomIn = () => {
    setZoom(zoom + 25);
  };

  const handleZoomOut = () => {
    setZoom(zoom - 25);
  };

  const handleSettings = () => {
    toast("Status bar settings");
  };

  return (
    <div className="h-6 bg-background border-t border-border flex items-center justify-between px-2 text-2xs">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <button
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${activeTool === 'pan'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          onClick={handlePan}
          title="Pan tool (P)"
        >
          <Hand className="w-3 h-3" />
          <span>Pan</span>
        </button>
        <button
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${isSaved
            ? 'text-muted-foreground/50 cursor-default'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          onClick={handleSave}
          disabled={isSaved}
          title="Save (Ctrl+S)"
        >
          <Save className="w-3 h-3" />
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>

        <div className="w-px h-3 bg-border" />

        <span className="text-muted-foreground">
          Objects: {objects.length} | Selected: {selectedIds.size}
        </span>
      </div>

      {/* Center section - view controls */}
      <div className="flex items-center gap-1">
        <button
          className={`p-1 rounded transition-colors ${activeTool === 'select'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          onClick={handleSelect}
          title="Select tool (V)"
        >
          <MousePointer className="w-3.5 h-3.5" />
        </button>
        <button
          className={`p-1 rounded transition-colors ${activeTool === 'orbit'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          onClick={handleCamera}
          title="Orbit tool (O)"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
        <button
          className={`p-1 rounded transition-colors ${gridVisible
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          onClick={handleToggleGrid}
          title="Toggle grid (G)"
        >
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleFitToScreen}
          title="Fullscreen (F)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <button
          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleZoomOut}
          title="Zoom out"
        >
          <ZoomOut className="w-3 h-3" />
        </button>
        <span className="text-muted-foreground min-w-[60px] text-center">
          Zoom: {zoom}%
        </span>
        <button
          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleZoomIn}
          title="Zoom in"
        >
          <ZoomIn className="w-3 h-3" />
        </button>
        <button
          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleSettings}
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
