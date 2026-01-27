import {
  SkipBack,
  StepBack,
  Play,
  Pause,
  StepForward,
  SkipForward,
  Pencil,
  Settings
} from "lucide-react";
import { useCADStore, useCADStoreApi, HistoryItem } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { useState } from "react";

interface TimelineProps {
  items?: HistoryItem[];
}

const Timeline = ({ items: propItems }: TimelineProps) => {
  const {
    history,
    historyIndex,
    skipToStart,
    skipToEnd,
    stepBack,
    stepForward,
    goToHistoryIndex
  } = useCADStore();

  const [isPlaying, setIsPlaying] = useState(false);

  const displayItems = propItems || history;

  const handleSkipToStart = () => {
    if (historyIndex < 0) {
      toast("Already at the beginning");
      return;
    }
    skipToStart();
    toast("Jumped to start");
  };

  const handleSkipToEnd = () => {
    if (historyIndex >= history.length - 1) {
      toast("Already at the end");
      return;
    }
    skipToEnd();
    toast("Jumped to end");
  };

  const handleStepBack = () => {
    if (historyIndex < 0) {
      toast("No previous step");
      return;
    }
    stepBack();
  };

  const handleStepForward = () => {
    if (historyIndex >= history.length - 1) {
      toast("No next step");
      return;
    }
    stepForward();
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      toast("Playback paused");
    } else {
      if (historyIndex >= history.length - 1) {
        toast("Already at the end");
        return;
      }
      setIsPlaying(true);
      toast("Playing history...");

      // Auto-step through history
      const playInterval = setInterval(() => {
        const state = useCADStoreApi().getState();
        if (state.historyIndex >= state.history.length - 1) {
          setIsPlaying(false);
          clearInterval(playInterval);
          toast("Playback complete");
        } else {
          state.stepForward();
        }
      }, 1000);
    }
  };

  const handleItemClick = (index: number) => {
    goToHistoryIndex(index);
    toast(`Jumped to: ${history[index]?.name || 'step ' + (index + 1)}`);
  };

  const handleSettings = () => {
    toast("Timeline settings");
  };

  return (
    <div className="cad-timeline">
      {/* Playback controls */}
      <div className="flex items-center gap-0.5 mr-4">
        <button
          className={`p-1 hover:bg-secondary rounded transition-colors ${historyIndex >= 0 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30'}`}
          onClick={handleSkipToStart}
          disabled={historyIndex < 0}
          title="Skip to start"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          className={`p-1 hover:bg-secondary rounded transition-colors ${historyIndex >= 0 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30'}`}
          onClick={handleStepBack}
          disabled={historyIndex < 0}
          title="Step back"
        >
          <StepBack className="w-3.5 h-3.5" />
        </button>
        <button
          className={`p-1 hover:bg-secondary rounded transition-colors ${history.length > 0 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30'}`}
          onClick={handlePlayPause}
          disabled={history.length === 0}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          className={`p-1 hover:bg-secondary rounded transition-colors ${historyIndex < history.length - 1 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30'}`}
          onClick={handleStepForward}
          disabled={historyIndex >= history.length - 1}
          title="Step forward"
        >
          <StepForward className="w-3.5 h-3.5" />
        </button>
        <button
          className={`p-1 hover:bg-secondary rounded transition-colors ${historyIndex < history.length - 1 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/30'}`}
          onClick={handleSkipToEnd}
          disabled={historyIndex >= history.length - 1}
          title="Skip to end"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* History marker */}
      <div className="flex items-center gap-1 mr-4">
        <Pencil className="w-3 h-3 text-muted-foreground" />
        <span className="text-2xs text-muted-foreground">
          {historyIndex + 1}/{history.length}
        </span>
      </div>

      {/* Timeline items */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {displayItems.length === 0 ? null : (
          displayItems.map((item, index) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(index)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-2xs cursor-pointer transition-colors ${index === historyIndex
                ? 'bg-primary text-primary-foreground'
                : index <= historyIndex
                  ? 'bg-secondary text-foreground hover:bg-secondary/80'
                  : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                }`}
            >
              <span className="opacity-60">{index + 1}</span>
              <span>{item.name}</span>
            </div>
          ))
        )}
      </div>

      {/* Settings */}
      <button
        className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors ml-2"
        onClick={handleSettings}
        title="Timeline settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default Timeline;
