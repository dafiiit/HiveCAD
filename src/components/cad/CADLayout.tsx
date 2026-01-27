import { useEffect } from "react";
import MenuBar from "./MenuBar";
import RibbonToolbar from "./RibbonToolbar";

import Viewport from "./Viewport";
import SketchPalette from "./SketchPalette";

import StatusBar from "./StatusBar";
import OperationProperties from "./OperationProperties";
import UnifiedSidebar from "./UnifiedSidebar";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { Maximize2, Minimize2 } from "lucide-react";


const CADLayout = () => {
  const {
    activeTab,
    setActiveTab,
    isSketchMode,
    exitSketchMode,
    finishSketch,
    fileName,
    isSaved,
    undo,
    redo,
    save,
    duplicateSelected,
    deleteObject,
    selectedIds,
    isFullscreen,
    toggleFullscreen,
  } = useCADStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            save();
            toast.success("Project saved");
            break;
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'd':
            e.preventDefault();
            duplicateSelected();
            break;
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          [...selectedIds].forEach(id => deleteObject(id));
          toast(`Deleted ${selectedIds.size} object(s)`);
        }
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          toggleFullscreen();
          toast("Exited fullscreen");
        } else if (isSketchMode) {
          exitSketchMode();
          toast("Exited sketch mode");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, save, duplicateSelected, deleteObject, selectedIds, isSketchMode, exitSketchMode, isFullscreen, toggleFullscreen]);

  if (isFullscreen) {
    return (
      <div className="w-screen h-screen bg-background relative overflow-hidden">
        <Viewport isSketchMode={isSketchMode} />

        {/* Fullscreen Overlays */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background/80 backdrop-blur-sm border border-border rounded-lg p-1 shadow-sm flex items-center justify-center">
          <button
            onClick={toggleFullscreen}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Minimal controls could go here if requested, for now just the Viewport which includes ViewCube */}

        {/* We might want to show operation properties if an operation is active? Keeping it simple for now as requested. */}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top menu bar */}
      <MenuBar fileName={fileName} isSaved={isSaved} />

      {/* Ribbon toolbar */}
      <RibbonToolbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSketchMode={isSketchMode}
        onFinishSketch={finishSketch}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Unified Sidebar (Browser & Code) */}
        <div className="absolute left-0 top-0 bottom-0 z-20 h-full">
          <UnifiedSidebar />
        </div>

        {/* Center viewport */}
        <div className="flex-1 flex flex-col relative min-w-0">
          <div className="flex-1 relative min-w-0">
            <Viewport isSketchMode={isSketchMode} />

            {/* Right sketch palette (overlay in sketch mode) */}
            <SketchPalette isVisible={isSketchMode} />
          </div>
        </div>

        {/* Operation Properties (Floating) */}
        <OperationProperties />
      </div>



      {/* Status bar */}
      <StatusBar />
    </div>
  );
};

export default CADLayout;
