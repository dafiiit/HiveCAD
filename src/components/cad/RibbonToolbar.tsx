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
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  Anchor,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Equal,
  GitCommit,
  ArrowUpLeft,
  PackagePlus
} from "lucide-react";
import { useCADStore, useCADStoreApi, ToolType } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { ExtensionStoreDialog } from "../extensions/ExtensionStoreDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  hasDropdown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(({ icon, label, isActive, hasDropdown, onClick, disabled, ...props }, ref) => (
  <button
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    {...props}
  >
    {icon}
    <span className="text-2xs whitespace-nowrap flex items-center gap-0.5">
      {label}
      {hasDropdown && <ChevronDown className="w-2 h-2" />}
    </span>
  </button>
));

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
  const {
    addObject,
    activeTool,
    setActiveTool,
    enterSketchMode,
    duplicateSelected,
    deleteObject,
    selectedIds,
    startOperation,
    objects,
    applyConstraintToSelection
  } = useCADStore();

  const [isExtensionStoreOpen, setIsExtensionStoreOpen] = React.useState(false);

  const tabs: ToolTab[] = ["SOLID", "SURFACE", "MESH", "SHEET", "PLASTIC", "MANAGE", "UTILITIES"];

  const handleCreatePrimitive = (type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'plane') => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleOperation = (type: string) => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleToolSelect = (tool: ToolType) => {
    setActiveTool(tool);
    toast(`Tool: ${tool}`);
  };

  const handleStartSketch = () => {
    enterSketchMode();
    toast.success("Sketch mode activated");
  };

  const handleDuplicate = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to duplicate");
      return;
    }
    duplicateSelected();
    toast.success(`Duplicated ${selectedIds.size} object(s)`);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to delete");
      return;
    }
    const ids = [...selectedIds];
    ids.forEach(id => deleteObject(id));
    toast.success(`Deleted ${ids.length} object(s)`);
  };

  const handleJoin = () => {
    useCADStoreApi().getState().executeOperation('join');
  };

  const handleCut = () => {
    useCADStoreApi().getState().executeOperation('cut');
  };

  const handleIntersect = () => {
    useCADStoreApi().getState().executeOperation('intersect');
  };

  const handleMeasure = () => {
    toast("Click two points to measure distance");
    setActiveTool('measure');
  };

  const handleExport = () => {
    const data = JSON.stringify(objects, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cad-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Project exported");
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        toast.success(`Importing ${file.name}...`);
      }
    };
    input.click();
  };

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

            {/* Line Tool (Direct) */}
            <ToolButton
              icon={<Minus className="w-5 h-5" />}
              label="Line"
              isActive={activeTool === 'line'}
              onClick={() => handleToolSelect('line')}
            />

            {/* Arc Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<ArrowUpRight className="w-5 h-5" />}
                  label="Arc"
                  isActive={['threePointsArc', 'tangentArc', 'sagittaArc', 'ellipse'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('threePointsArc')}>3-Point Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('tangentArc')}>Tangent Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('sagittaArc')}>Sagitta Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('ellipse')}>Ellipse</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Shape (Rectangle/Circle) Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<RectangleHorizontal className="w-5 h-5" />}
                  label="Shape"
                  isActive={['rectangle', 'circle', 'polygon', 'roundedRectangle', 'text'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('rectangle')}>Rectangle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('circle')}>Circle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('roundedRectangle')}>Rounded Rectangle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('polygon')}>Polygon</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('text')}>Text</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Spline Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<Spline className="w-5 h-5" />}
                  label="Spline"
                  isActive={['spline', 'bezier', 'smoothSpline'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('smoothSpline')}>Smooth Spline</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('bezier')}>Bezier Curve</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </ToolGroup>

          <ToolGroup label="CONSTRUCT">
            {/* Plane Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<Square className="w-5 h-5" />}
                  label="Plane"
                  isActive={['plane', 'makePlane', 'pivot', 'translatePlane'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleCreatePrimitive('plane')}>Make Plane</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOperation('pivot')}>Pivot Plane</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOperation('translatePlane')}>Translate Plane</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ToolGroup>

          <ToolGroup label="MODIFY">
            <ToolButton
              icon={<Scissors className="w-5 h-5" />}
              label="Trim"
              isActive={activeTool === 'trim'}
              onClick={() => handleToolSelect('trim')}
            />
            <ToolButton
              icon={<Move className="w-5 h-5" />}
              label="Move"
              isActive={activeTool === 'move'}
              onClick={() => handleToolSelect('move')}
            />
            <ToolButton
              icon={<Copy className="w-5 h-5" />}
              label="Copy"
              isActive={activeTool === 'copy'}
              onClick={() => handleToolSelect('copy')}
            />
            <ToolButton
              icon={<Scale className="w-5 h-5" />}
              label="Scale"
              isActive={activeTool === 'scale'}
              onClick={() => handleToolSelect('scale')}
            />
            <ToolButton
              icon={<RotateCw className="w-5 h-5" />}
              label="Rotate"
              isActive={activeTool === 'rotate'}
              onClick={() => handleToolSelect('rotate')}
            />
          </ToolGroup>

          <ToolGroup label="CONSTRAINTS">
            <ToolButton
              icon={<Ruler className="w-5 h-5" />}
              label="Dimension"
              isActive={activeTool === 'dimension'}
              onClick={() => handleToolSelect('dimension')}
            />
            {/* Logic Constraints */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<Crosshair className="w-5 h-5" />}
                  label="Constraints"
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Geometric Constraints</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => applyConstraintToSelection('coincident')}>
                  <GitCommit className="w-4 h-4 mr-2" /> Coincident (Point-Point)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('horizontal')}>
                  <AlignHorizontalSpaceAround className="w-4 h-4 mr-2" /> Horizontal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('vertical')}>
                  <AlignVerticalSpaceAround className="w-4 h-4 mr-2" /> Vertical
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('parallel')}>
                  <MoreHorizontal className="w-4 h-4 mr-2" /> Parallel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('perpendicular')}>
                  <ArrowUpLeft className="w-4 h-4 mr-2" /> Perpendicular
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('tangent')}>
                  <CircleDot className="w-4 h-4 mr-2" /> Tangent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('equal')}>
                  <Equal className="w-4 h-4 mr-2" /> Equal Length/Radius
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => applyConstraintToSelection('midpoint')}>
                  <MoreHorizontal className="w-4 h-4 mr-2" /> Midpoint
                </DropdownMenuItem>
                {/*
                 <DropdownMenuItem onClick={() => applyConstraintToSelection('concentric')}>
                   <Circle className="w-4 h-4 mr-2" /> Concentric
                 </DropdownMenuItem>
                 */}
              </DropdownMenuContent>
            </DropdownMenu>


          </ToolGroup>

          <ToolGroup label="INSERT">
            <ToolButton icon={<Download className="w-5 h-5" />} label="Insert" hasDropdown onClick={handleImport} />
            <ToolButton icon={<Grid3X3 className="w-5 h-5" />} label="Pattern" hasDropdown onClick={() => toast("Pattern tool")} />
          </ToolGroup>

          <ToolGroup label="SELECT">
            <ToolButton
              icon={<MousePointer2 className="w-5 h-5" />}
              label="Select"
              hasDropdown
              isActive={activeTool === 'select'}
              onClick={() => handleToolSelect('select')}
            />
          </ToolGroup>

          <div className="ml-auto flex items-center gap-2 pr-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsExtensionStoreOpen(true)}
                    className="flex items-center justify-center p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                  >
                    <PackagePlus className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Extension Store</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <button
              onClick={onFinishSketch}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs font-medium transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Finish Sketch
            </button>
          </div>
        </div>
        <ExtensionStoreDialog
          open={isExtensionStoreOpen}
          onOpenChange={setIsExtensionStoreOpen}
        />
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
          <ToolButton
            icon={<Pencil className="w-5 h-5" />}
            label="Sketch"
            isActive={isSketchMode}
            onClick={handleStartSketch}
          />
          <ToolButton
            icon={<ArrowUpRight className="w-5 h-5" />}
            label="Extrude"
            onClick={() => handleOperation('extrusion')}
          />
          <ToolButton
            icon={<RotateCw className="w-5 h-5" />}
            label="Revolve"
            onClick={() => handleOperation('revolve')}
          />
          <div className="w-px h-8 bg-border mx-1" />

          {/* 3D Primitives Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolButton
                icon={<Box className="w-5 h-5" />}
                label="Box"
                hasDropdown
                onClick={() => handleCreatePrimitive('box')}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('box')}>
                <Box className="w-4 h-4 mr-2" />
                Box
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('cylinder')}>
                <Cylinder className="w-4 h-4 mr-2" />
                Cylinder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('sphere')}>
                <Circle className="w-4 h-4 mr-2" />
                Sphere
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('torus')}>
                <Hexagon className="w-4 h-4 mr-2" />
                Torus
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('coil')}>
                <Triangle className="w-4 h-4 mr-2" />
                Coil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ToolGroup>

        <ToolGroup label="MODIFY">
          <ToolButton
            icon={<Move className="w-5 h-5" />}
            label="Move"
            isActive={activeTool === 'move'}
            onClick={() => handleToolSelect('move')}
          />
          <ToolButton
            icon={<RotateCw className="w-5 h-5" />}
            label="Rotate"
            isActive={activeTool === 'rotate'}
            onClick={() => handleToolSelect('rotate')}
          />
          <ToolButton
            icon={<Scale className="w-5 h-5" />}
            label="Scale"
            isActive={activeTool === 'scale'}
            onClick={() => handleToolSelect('scale')}
          />
          <ToolButton
            icon={<Copy className="w-5 h-5" />}
            label="Copy"
            onClick={handleDuplicate}
          />
          <ToolButton
            icon={<Trash2 className="w-5 h-5" />}
            label="Delete"
            onClick={handleDelete}
          />
        </ToolGroup>

        <ToolGroup label="COMBINE">
          <ToolButton
            icon={<Combine className="w-5 h-5" />}
            label="Join"
            onClick={handleJoin}
          />
          <ToolButton
            icon={<SplitSquareVertical className="w-5 h-5" />}
            label="Cut"
            onClick={handleCut}
          />
          <ToolButton
            icon={<Layers className="w-5 h-5" />}
            label="Intersect"
            onClick={handleIntersect}
          />
        </ToolGroup>

        <ToolGroup label="CONFIGURE">
          <ToolButton
            icon={<Settings2 className="w-5 h-5" />}
            label="Parameters"
            hasDropdown
            onClick={() => toast("Parameters panel")}
          />
          <ToolButton
            icon={<Grid3X3 className="w-5 h-5" />}
            label="Pattern"
            hasDropdown
            onClick={() => toast("Pattern tool")}
          />
        </ToolGroup>

        <ToolGroup label="CONSTRUCT">
          {/* Plane Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolButton
                icon={<Square className="w-5 h-5" />}
                label="Plane"
                hasDropdown
                isActive={['plane', 'makePlane', 'pivot', 'translatePlane'].includes(activeTool)}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleCreatePrimitive('plane')}>Make Plane</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOperation('pivot')}>Pivot Plane</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOperation('translatePlane')}>Translate Plane</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolButton
            icon={<Minus className="w-5 h-5" />}
            label="Axis"
            isActive={activeTool === 'axis'}
            onClick={() => handleToolSelect('axis')}
          />
          <ToolButton
            icon={<CircleDot className="w-5 h-5" />}
            label="Point"
            isActive={activeTool === 'point'}
            onClick={() => handleToolSelect('point')}
          />
        </ToolGroup>

        <ToolGroup label="INSPECT">
          <ToolButton
            icon={<Ruler className="w-5 h-5" />}
            label="Measure"
            isActive={activeTool === 'measure'}
            onClick={handleMeasure}
          />
          <ToolButton
            icon={<Eye className="w-5 h-5" />}
            label="Analyze"
            hasDropdown
            onClick={() => toast("Analyze tools")}
          />
        </ToolGroup>

        <ToolGroup label="INSERT">
          <ToolButton
            icon={<Download className="w-5 h-5" />}
            label="Insert"
            hasDropdown
            onClick={handleImport}
          />
          <ToolButton
            icon={<Upload className="w-5 h-5" />}
            label="Export"
            onClick={handleExport}
          />
        </ToolGroup>

        <ToolGroup label="SELECT">
          <ToolButton
            icon={<MousePointer2 className="w-5 h-5" />}
            label="Select"
            hasDropdown
            isActive={activeTool === 'select'}
            onClick={() => handleToolSelect('select')}
          />
        </ToolGroup>

        <div className="ml-auto flex items-center pr-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsExtensionStoreOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-md hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary border border-transparent hover:border-border/50 group"
                >
                  <PackagePlus className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium uppercase tracking-tight">Extensions</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Browse Extension Library</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <ExtensionStoreDialog
        open={isExtensionStoreOpen}
        onOpenChange={setIsExtensionStoreOpen}
      />
    </div>
  );
};

export default RibbonToolbar;
