import {
  Hand,
  Save,
  MousePointer,
  Camera,
  Grid3X3,
  Maximize2,
  Settings
} from "lucide-react";

interface StatusBarProps {
  zoom?: number;
  gridVisible?: boolean;
}

const StatusBar = ({ zoom = 100, gridVisible = true }: StatusBarProps) => {
  return (
    <div className="h-6 bg-background border-t border-border flex items-center justify-between px-2 text-2xs">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
          <Hand className="w-3 h-3" />
          <span>Pan</span>
        </button>
        <button className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground">
          <Save className="w-3 h-3" />
          <span>Save</span>
        </button>
      </div>

      {/* Center section - view controls */}
      <div className="flex items-center gap-1">
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <MousePointer className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <Camera className="w-3.5 h-3.5" />
        </button>
        <button className={`p-1 hover:bg-secondary rounded transition-colors ${gridVisible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Zoom: {zoom}%</span>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default StatusBar;
