import {
  SkipBack,
  StepBack,
  Play,
  StepForward,
  SkipForward,
  Pencil,
  Settings
} from "lucide-react";

interface TimelineItem {
  id: string;
  type: "sketch" | "extrude" | "fillet" | "pattern";
  name: string;
}

interface TimelineProps {
  items?: TimelineItem[];
}

const Timeline = ({ items = [] }: TimelineProps) => {
  return (
    <div className="cad-timeline">
      {/* Playback controls */}
      <div className="flex items-center gap-0.5 mr-4">
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <StepBack className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <Play className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <StepForward className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* History marker */}
      <div className="flex items-center gap-1 mr-4">
        <Pencil className="w-3 h-3 text-muted-foreground" />
      </div>

      {/* Timeline items */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {items.length === 0 ? (
          <div className="text-2xs text-muted-foreground">
            No history yet - start designing!
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-1 px-2 py-0.5 bg-secondary/50 rounded text-2xs hover:bg-secondary cursor-pointer"
            >
              <span className="text-muted-foreground">{index + 1}</span>
              <span>{item.name}</span>
            </div>
          ))
        )}
      </div>

      {/* Settings */}
      <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors ml-2">
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default Timeline;
