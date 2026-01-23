import { useState } from "react";
import MenuBar from "./MenuBar";
import RibbonToolbar from "./RibbonToolbar";
import BrowserPanel from "./BrowserPanel";
import Viewport from "./Viewport";
import ViewCube from "./ViewCube";
import SketchPalette from "./SketchPalette";
import Timeline from "./Timeline";
import StatusBar from "./StatusBar";
import CommentsPanel from "./CommentsPanel";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";

const CADLayout = () => {
  const [activeTab, setActiveTab] = useState<ToolTab>("SOLID");
  const [isSketchMode, setIsSketchMode] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [fileName] = useState("Untitled*");
  const [isSaved] = useState(false);

  const handleFinishSketch = () => {
    setIsSketchMode(false);
  };

  const handleViewChange = (view: string) => {
    console.log("View changed to:", view);
    // Would update camera position based on view
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top menu bar */}
      <MenuBar fileName={fileName} isSaved={isSaved} />

      {/* Ribbon toolbar */}
      <RibbonToolbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSketchMode={isSketchMode}
        onFinishSketch={handleFinishSketch}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left browser panel */}
        <BrowserPanel />

        {/* Center viewport */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 relative">
            <Viewport isSketchMode={isSketchMode} />
            
            {/* View cube overlay */}
            <ViewCube onViewChange={handleViewChange} />
          </div>

          {/* Comments panel */}
          <CommentsPanel 
            isExpanded={commentsExpanded}
            onToggle={() => setCommentsExpanded(!commentsExpanded)}
          />
        </div>

        {/* Right sketch palette (visible in sketch mode) */}
        <SketchPalette isVisible={isSketchMode} />
      </div>

      {/* Timeline */}
      <Timeline items={[]} />

      {/* Status bar */}
      <StatusBar zoom={100} gridVisible={true} />
    </div>
  );
};

export default CADLayout;
