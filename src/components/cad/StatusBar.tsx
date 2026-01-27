import {
  Hand,
  Save,
  MousePointer,
  Camera,
  Grid3X3,
  Maximize2,
  Settings,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  AlertCircle,
  Cloud,
  CheckCircle
} from "lucide-react";
import { useCADStore, useCADStoreApi } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils"; // Assuming cn utility is available here

const StatusBar = () => {
  const {
    zoom,
    setZoom,
    gridVisible,
    toggleGrid,
    activeTool,
    setActiveTool,
    syncToCloud,
    fitToScreen, // Still in store, but logic changed
    objects,
    selectedIds,
    isSaved, // Not directly used in new JSX, but might be in syncToCloud
    syncStatus, // New state from store
    hasUnpushedChanges, // New state from store
    isSaving // New state from store
  } = useCADStore();

  const handlePan = () => {
    if (activeTool === 'pan') {
      setActiveTool('select');
      toast("Select mode");
    } else {
      setActiveTool('pan');
      toast("Pan mode: drag to move view");
    }
  };

  const handleSave = () => {
    syncToCloud();
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
    useCADStoreApi().getState().toggleFullscreen();
    // toast("View fit to screen");
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

  // Sync status helpers
  const getSyncStatusIcon = () => {
    // Offline check if desired, but user object usually implies auth
    // if (!user) return <CloudOff ... />;

    switch (syncStatus) {
      case 'saving_local':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
      case 'pushing_cloud':
        return <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      case 'idle':
      default:
        if (hasUnpushedChanges) {
          return <Cloud className="w-3.5 h-3.5 text-amber-400" />; // Pending push
        }
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />; // All synced
    }
  };

  const getSyncStatusText = () => {
    // if (!user) return 'Offline';

    switch (syncStatus) {
      case 'saving_local': return 'Saving locally...';
      case 'pushing_cloud': return 'Syncing...';
      case 'error': return 'Sync failed';
      case 'idle':
      default:
        if (hasUnpushedChanges) return 'Unsynced changes';
        return 'All saved';
    }
  };

  return (
    <div className="h-6 bg-background border-t border-border flex items-center justify-between px-2 text-2xs z-50 relative">
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

        {/* Sync Status / Save Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2" title={getSyncStatusText()}>
            {getSyncStatusIcon()}
            <span className={cn(
              "hidden sm:inline transition-colors",
              syncStatus === 'error' ? "text-red-500" :
                hasUnpushedChanges ? "text-amber-400" : "text-muted-foreground"
            )}>
              {getSyncStatusText()}
            </span>
          </div>

          <button
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${hasUnpushedChanges
              ? 'hover:bg-primary/20 text-primary hover:text-primary'
              : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            onClick={handleSave}
            disabled={isSaving || (!hasUnpushedChanges && syncStatus === 'idle')}
            title="Save (Ctrl+S)"
          >
            <Save className="w-3 h-3" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

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
