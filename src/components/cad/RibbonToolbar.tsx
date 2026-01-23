import React from "react";
import {
  Box,
  Circle,
  Square,
  Triangle,
  Cylinder,
  Hexagon,
  Move,
  RotateCw,
  Scale,
  Copy,
  Scissors,
  Combine,
  SplitSquareVertical,
  Grid3X3,
  Layers,
  Eye,
  Settings2,
  Download,
  Upload,
  MousePointer2,
  Pencil,
  Minus,
  CircleDot,
  Spline,
  RectangleHorizontal,
  Pentagon,
  ArrowUpRight,
  Ruler,
  Crosshair,
  ChevronDown,
  CheckCircle2
} from "lucide-react";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  hasDropdown?: boolean;
  onClick?: () => void;
}

const ToolButton = ({ icon, label, isActive, hasDropdown, onClick }: ToolButtonProps) => (
  <button
    onClick={onClick}
    className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''}`}
  >
    {icon}
    <span className="text-2xs whitespace-nowrap flex items-center gap-0.5">
      {label}
      {hasDropdown && <ChevronDown className="w-2 h-2" />}
    </span>
  </button>
);

interface ToolGroupProps {
  label: string;
  children: React.ReactNode;
}

const ToolGroup = ({ label, children }: ToolGroupProps) => (
  <div className="cad-tool-group">
    <div className="flex flex-col">
      <div className="flex items-end gap-0.5">
        {children}
      </div>
      <span className="cad-tool-group-label">{label}</span>
    </div>
  </div>
);

interface RibbonToolbarProps {
  activeTab: ToolTab;
  setActiveTab: (tab: ToolTab) => void;
  isSketchMode: boolean;
  onFinishSketch: () => void;
}

const RibbonToolbar = ({ activeTab, setActiveTab, isSketchMode, onFinishSketch }: RibbonToolbarProps) => {
  const tabs: ToolTab[] = ["SOLID", "SURFACE", "MESH", "SHEET", "PLASTIC", "MANAGE", "UTILITIES"];
  
  if (isSketchMode) {
    return (
      <div className="cad-toolbar">
        {/* Tab bar */}
        <div className="flex items-center border-b border-toolbar-border px-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`cad-toolbar-tab ${activeTab === tab ? 'cad-toolbar-tab-active' : ''}`}
            >
              {tab}
            </button>
          ))}
          <button className="cad-toolbar-tab cad-toolbar-tab-active bg-primary/20 text-primary">
            SKETCH
          </button>
        </div>

        {/* Sketch Tools */}
        <div className="flex items-center py-1 px-1">
          <ToolGroup label="CREATE">
            <ToolButton icon={<Minus className="w-5 h-5" />} label="Line" />
            <ToolButton icon={<ArrowUpRight className="w-5 h-5" />} label="Arc" />
            <ToolButton icon={<Circle className="w-5 h-5" />} label="Circle" />
            <ToolButton icon={<RectangleHorizontal className="w-5 h-5" />} label="Rect" />
            <ToolButton icon={<Pentagon className="w-5 h-5" />} label="Polygon" />
            <ToolButton icon={<Spline className="w-5 h-5" />} label="Spline" />
          </ToolGroup>

          <ToolGroup label="MODIFY">
            <ToolButton icon={<Scissors className="w-5 h-5" />} label="Trim" />
            <ToolButton icon={<Move className="w-5 h-5" />} label="Move" />
            <ToolButton icon={<Copy className="w-5 h-5" />} label="Copy" />
            <ToolButton icon={<Scale className="w-5 h-5" />} label="Scale" />
            <ToolButton icon={<RotateCw className="w-5 h-5" />} label="Rotate" />
          </ToolGroup>

          <ToolGroup label="CONSTRAINTS">
            <ToolButton icon={<Ruler className="w-5 h-5" />} label="Dimension" />
            <ToolButton icon={<Crosshair className="w-5 h-5" />} label="Constrain" hasDropdown />
          </ToolGroup>

          <ToolGroup label="INSERT">
            <ToolButton icon={<Download className="w-5 h-5" />} label="Insert" hasDropdown />
            <ToolButton icon={<Grid3X3 className="w-5 h-5" />} label="Pattern" hasDropdown />
          </ToolGroup>

          <ToolGroup label="SELECT">
            <ToolButton icon={<MousePointer2 className="w-5 h-5" />} label="Select" hasDropdown />
          </ToolGroup>

          <div className="ml-auto flex items-center gap-2 pr-2">
            <button 
              onClick={onFinishSketch}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs font-medium transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Finish Sketch
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cad-toolbar">
      {/* Tab bar */}
      <div className="flex items-center border-b border-toolbar-border px-2">
        <button className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-t border border-primary/30 border-b-0 mr-1">
          DESIGN
        </button>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`cad-toolbar-tab ${activeTab === tab ? 'cad-toolbar-tab-active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tool ribbon */}
      <div className="flex items-center py-1 px-1 overflow-x-auto">
        <ToolGroup label="CREATE">
          <ToolButton icon={<Box className="w-5 h-5" />} label="Box" hasDropdown />
          <ToolButton icon={<Cylinder className="w-5 h-5" />} label="Cylinder" />
          <ToolButton icon={<Circle className="w-5 h-5" />} label="Sphere" />
          <ToolButton icon={<Hexagon className="w-5 h-5" />} label="Torus" />
          <ToolButton icon={<Triangle className="w-5 h-5" />} label="Coil" />
          <ToolButton icon={<Pencil className="w-5 h-5" />} label="Sketch" isActive={false} />
        </ToolGroup>

        <ToolGroup label="MODIFY">
          <ToolButton icon={<Move className="w-5 h-5" />} label="Move" />
          <ToolButton icon={<RotateCw className="w-5 h-5" />} label="Rotate" />
          <ToolButton icon={<Scale className="w-5 h-5" />} label="Scale" />
          <ToolButton icon={<Copy className="w-5 h-5" />} label="Copy" />
        </ToolGroup>

        <ToolGroup label="COMBINE">
          <ToolButton icon={<Combine className="w-5 h-5" />} label="Join" />
          <ToolButton icon={<SplitSquareVertical className="w-5 h-5" />} label="Cut" />
          <ToolButton icon={<Layers className="w-5 h-5" />} label="Intersect" />
        </ToolGroup>

        <ToolGroup label="CONFIGURE">
          <ToolButton icon={<Settings2 className="w-5 h-5" />} label="Parameters" hasDropdown />
          <ToolButton icon={<Grid3X3 className="w-5 h-5" />} label="Pattern" hasDropdown />
        </ToolGroup>

        <ToolGroup label="CONSTRUCT">
          <ToolButton icon={<Square className="w-5 h-5" />} label="Plane" hasDropdown />
          <ToolButton icon={<Minus className="w-5 h-5" />} label="Axis" />
          <ToolButton icon={<CircleDot className="w-5 h-5" />} label="Point" />
        </ToolGroup>

        <ToolGroup label="INSPECT">
          <ToolButton icon={<Ruler className="w-5 h-5" />} label="Measure" />
          <ToolButton icon={<Eye className="w-5 h-5" />} label="Analyze" hasDropdown />
        </ToolGroup>

        <ToolGroup label="INSERT">
          <ToolButton icon={<Download className="w-5 h-5" />} label="Insert" hasDropdown />
          <ToolButton icon={<Upload className="w-5 h-5" />} label="Export" />
        </ToolGroup>

        <ToolGroup label="SELECT">
          <ToolButton icon={<MousePointer2 className="w-5 h-5" />} label="Select" hasDropdown />
        </ToolGroup>
      </div>
    </div>
  );
};

export default RibbonToolbar;
