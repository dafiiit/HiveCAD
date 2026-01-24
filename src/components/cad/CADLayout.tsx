import { useEffect } from "react";
import MenuBar from "./MenuBar";
import RibbonToolbar from "./RibbonToolbar";
import BrowserPanel from "./BrowserPanel";
import Viewport from "./Viewport";
import SketchPalette from "./SketchPalette";
import Timeline from "./Timeline";
import StatusBar from "./StatusBar";
import CommentsPanel from "./CommentsPanel";
import OperationProperties from "./OperationProperties";
import CodeEditorPanel from "./CodeEditorPanel";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";

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
    selectedIds
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
      } else if (e.key === 'Escape' && isSketchMode) {
        exitSketchMode();
        toast("Exited sketch mode");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, save, duplicateSelected, deleteObject, selectedIds, isSketchMode, exitSketchMode]);

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
      <div className="flex-1 flex overflow-hidden">
        {/* Left browser panel */}
        <BrowserPanel />

        {/* Code Editor Panel */}
        <CodeEditorPanel />

        {/* Center viewport */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 relative">
            <Viewport isSketchMode={isSketchMode} />
          </div>

          {/* Comments panel */}
          <CommentsPanel />
        </div>

        {/* Right sketch palette (visible in sketch mode) */}
        <SketchPalette isVisible={isSketchMode} />

        {/* Operation Properties (Floating) */}
        <OperationProperties />
      </div>

      {/* Timeline */}
      <Timeline />

      {/* Status bar */}
      <StatusBar />
    </div>
  );
};

export default CADLayout;
