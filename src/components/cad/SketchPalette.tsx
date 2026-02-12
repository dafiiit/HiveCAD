import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Minus,
  Pencil,
  ArrowUpRight,
  PencilRuler,
  Link,
  Grid3X3
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";

interface SketchPaletteProps {
  isVisible: boolean;
}

interface OptionRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}

const OptionRow = ({ label, checked, onChange, icon }: OptionRowProps) => (
  <div className="cad-checkbox-row">
    <span className="flex items-center gap-2">
      {icon}
      {label}
    </span>
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      className="w-3.5 h-3.5 border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
    />
  </div>
);

const SketchPalette = ({ isVisible }: SketchPaletteProps) => {
  const {
    exitSketchMode,
    finishSketch,
    activeTool,
    setActiveTool,
    toggleGrid,
    gridVisible,
    sketchPlane,
    setSketchPlane,
    sketchStep,
    sketchOptions,
    setSketchOption,
    chainMode,
    setChainMode,
    gridSnapSize,
    setGridSnapSize,
    activeSketchPrimitives,
  } = useCADStore();

  const [optionsExpanded, setOptionsExpanded] = useState(true);
  const [planeDropdownOpen, setPlaneDropdownOpen] = useState(false);
  const [options, setOptions] = useState({
    // lookAt moved to global store
    sketchGrid: true,
    snap: false,
    slice: true,
    profileLong: true,
    points: true,
    dimensions: true,
    constraints: true,
    projectedGeometry: true,
    constructionGeometry: true,
    sketch3D: false,
  });

  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isVisible) return null;

  const updateOption = (key: string) => (checked: boolean) => {
    if (key === 'lookAt') {
      setSketchOption('lookAt', checked);
      toast(`lookAt: ${checked ? 'enabled' : 'disabled'}`);
      return;
    }

    setOptions(prev => ({ ...prev, [key]: checked }));

    // Handle specific options
    if (key === 'sketchGrid') {
      if (checked !== gridVisible) {
        toggleGrid();
      }
    }

    toast(`${key}: ${checked ? 'enabled' : 'disabled'}`);
  };

  const handleLineType = (type: 'normal' | 'construction') => {
    setActiveTool(type === 'normal' ? 'line' : 'constructionLine');
    toast(`Line type: ${type}`);
  };

  const handleFinishSketch = () => {
    finishSketch();
    toast.success("Sketch completed");
  };

  const planeLabels: Record<string, string> = {
    'XY': 'Top',
    'XZ': 'Front',
    'YZ': 'Right'
  };

  const handlePlaneSelect = (plane: 'XY' | 'XZ' | 'YZ') => {
    setSketchPlane(plane);
    setPlaneDropdownOpen(false);
    toast.success(`Sketch plane set to ${planeLabels[plane]} (${plane})`);
  };

  const planeColors: Record<string, string> = {
    'XY': 'hsl(221 83% 56%)',
    'XZ': 'hsl(0 72% 56%)',
    'YZ': 'hsl(146 63% 42%)'
  };

  // Styles for the container
  const containerClass = `absolute right-4 bottom-4 h-2/3 z-20 shadow-xl rounded-2xl overflow-hidden border border-border/70 flex flex-col bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/65 transition-all duration-300 ease-in-out ${isCollapsed ? "w-12 h-auto" : "w-64"
    }`;

  if (isCollapsed) {
    return (
      <div className={containerClass}>
        <div className="flex flex-col items-center py-2 space-y-2">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 hover:bg-secondary/70 rounded-lg transition-colors"
            title="Expand Palette"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="w-full h-[1px] bg-border my-1" />

          <div
            className="p-2 text-muted-foreground select-none cursor-default"
            title="Sketch Palette"
          >
            <PencilRuler className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="cad-panel-header shrink-0">
        <span>Sketch Palette</span>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setIsCollapsed(true)}
          title="Collapse palette"
        >
          <Minus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Sketch Plane Selection */}
        <div className="px-3 py-2 border-b border-border">
          <div className="text-2xs text-muted-foreground mb-1">Sketch Plane</div>
          <div className="relative">
            <button
              onClick={() => setPlaneDropdownOpen(!planeDropdownOpen)}
              className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded border transition-colors ${sketchStep === 'select-plane'
                ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500'
                : 'border-border bg-secondary/50 hover:bg-secondary'
                }`}
            >
              <span className="flex items-center gap-2 overflow-hidden">
                {sketchPlane ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: planeColors[sketchPlane] }}
                    />
                    <span className="font-medium truncate">{planeLabels[sketchPlane]} ({sketchPlane})</span>
                  </>
                ) : (
                  <span className="text-muted-foreground italic truncate">Select a plane...</span>
                )}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform shrink-0 ${planeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {planeDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg z-50">
                {(['XY', 'XZ', 'YZ'] as const).map(plane => (
                  <button
                    key={plane}
                    onClick={() => handlePlaneSelect(plane)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-secondary transition-colors ${sketchPlane === plane ? 'bg-primary/20 text-primary' : ''
                      }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: planeColors[plane] }}
                    />
                    <span>{planeLabels[plane]} ({plane})</span>
                    {sketchPlane === plane && <span className="ml-auto text-primary">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {sketchStep === 'select-plane' && (
            <p className="text-2xs text-yellow-500/80 mt-1">
              Click a plane above or in the 3D view
            </p>
          )}
        </div>

        {/* Active Tool Display */}
        <div className="px-3 py-2 border-b border-border">
          <div className="text-2xs text-muted-foreground mb-1">Active Tool</div>
          <div className="text-xs font-medium text-primary capitalize">{activeTool}</div>
        </div>

        {/* Options Section */}
        <div>
          <button
            onClick={() => setOptionsExpanded(!optionsExpanded)}
            className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-medium hover:bg-secondary/30"
          >
            {optionsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Options
          </button>

          {optionsExpanded && (
            <div className="pb-2">
              <div className="px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Line Type</span>
                <div className="flex gap-1 ml-auto">
                  <button
                    className={`p-1 rounded-md transition-all duration-150 ${activeTool === 'line' ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary/70'}`}
                    onClick={() => handleLineType('normal')}
                    title="Normal line"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className={`p-1 rounded-md transition-all duration-150 ${activeTool === 'constructionLine' ? 'bg-primary/20 text-primary shadow-sm' : 'hover:bg-secondary/70'}`}
                    onClick={() => handleLineType('construction')}
                    title="Construction line"
                  >
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <OptionRow
                label="Look At"
                checked={sketchOptions.lookAt}
                onChange={updateOption("lookAt")}
              />
              <OptionRow
                label="Chain Mode"
                checked={chainMode}
                onChange={(checked) => setChainMode(checked)}
                icon={<Link className="w-3 h-3" />}
              />
              <OptionRow
                label="Sketch Grid"
                checked={options.sketchGrid}
                onChange={updateOption("sketchGrid")}
                icon={<Grid3X3 className="w-3 h-3" />}
              />

              {/* Grid Snap Size */}
              <div className="px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Grid Size</span>
                <select
                  value={gridSnapSize}
                  onChange={(e) => setGridSnapSize(Number(e.target.value))}
                  className="ml-auto bg-secondary/70 border border-border rounded-md text-xs px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <option value={0}>Off</option>
                  <option value={0.5}>0.5mm</option>
                  <option value={1}>1mm</option>
                  <option value={2}>2mm</option>
                  <option value={5}>5mm</option>
                  <option value={10}>10mm</option>
                </select>
              </div>

              <OptionRow
                label="Snap"
                checked={options.snap}
                onChange={updateOption("snap")}
              />
              <OptionRow
                label="Slice"
                checked={options.slice}
                onChange={updateOption("slice")}
              />
              <OptionRow
                label="Profile (Long)"
                checked={options.profileLong}
                onChange={updateOption("profileLong")}
              />
              <OptionRow
                label="Points"
                checked={options.points}
                onChange={updateOption("points")}
              />
              <OptionRow
                label="Dimensions"
                checked={options.dimensions}
                onChange={updateOption("dimensions")}
              />
              <OptionRow
                label="Constraints"
                checked={options.constraints}
                onChange={updateOption("constraints")}
              />
              <OptionRow
                label="Projected Geometry"
                checked={options.projectedGeometry}
                onChange={updateOption("projectedGeometry")}
              />
              <OptionRow
                label="Construction Geometry"
                checked={options.constructionGeometry}
                onChange={updateOption("constructionGeometry")}
              />
              <OptionRow
                label="3D Sketch"
                checked={options.sketch3D}
                onChange={updateOption("sketch3D")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="shrink-0 border-t border-border px-3 py-2 space-y-2">
        {/* Entity count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{activeSketchPrimitives.length} entit{activeSketchPrimitives.length === 1 ? 'y' : 'ies'}</span>
          <span className="text-[11px] text-muted-foreground/80">Use top-left Undo/Redo</span>
        </div>

        {/* Finish / Cancel */}
        <div className="flex gap-2">
          <button
            onClick={handleFinishSketch}
            disabled={activeSketchPrimitives.length === 0}
            className="flex-1 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Finish Sketch
          </button>
          <button
            onClick={exitSketchMode}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary/70 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SketchPalette;
