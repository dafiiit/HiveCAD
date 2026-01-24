import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Minus,
  Pencil,
  ArrowUpRight
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
  const { exitSketchMode, finishSketch, activeTool, setActiveTool, toggleGrid, gridVisible, sketchPlane, setSketchPlane, sketchStep } = useCADStore();

  const [optionsExpanded, setOptionsExpanded] = useState(true);
  const [planeDropdownOpen, setPlaneDropdownOpen] = useState(false);
  const [options, setOptions] = useState({
    lookAt: true,
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

  if (!isVisible) return null;

  const updateOption = (key: keyof typeof options) => (checked: boolean) => {
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
    setActiveTool(type === 'normal' ? 'line' : 'line');
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
    'XY': '#5577ee',
    'XZ': '#e05555',
    'YZ': '#55e055'
  };

  return (
    <div className="cad-sketch-palette flex flex-col">
      <div className="cad-panel-header">
        <span>Sketch Palette</span>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={handleFinishSketch}
          title="Close palette"
        >
          <Minus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
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
              <span className="flex items-center gap-2">
                {sketchPlane ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: planeColors[sketchPlane] }}
                    />
                    <span className="font-medium">{planeLabels[sketchPlane]} ({sketchPlane})</span>
                  </>
                ) : (
                  <span className="text-muted-foreground italic">Select a plane...</span>
                )}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${planeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {planeDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-panel border border-border rounded shadow-lg z-50">
                {(['XY', 'XZ', 'YZ'] as const).map(plane => (
                  <button
                    key={plane}
                    onClick={() => handlePlaneSelect(plane)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-secondary transition-colors ${sketchPlane === plane ? 'bg-primary/20 text-primary' : ''
                      }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
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
                    className={`p-1 rounded transition-colors ${activeTool === 'line' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                    onClick={() => handleLineType('normal')}
                    title="Normal line"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className="p-1 hover:bg-secondary rounded"
                    onClick={() => handleLineType('construction')}
                    title="Construction line"
                  >
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <OptionRow
                label="Look At"
                checked={options.lookAt}
                onChange={updateOption("lookAt")}
              />
              <OptionRow
                label="Sketch Grid"
                checked={options.sketchGrid}
                onChange={updateOption("sketchGrid")}
              />
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

      <div className="p-2 border-t border-border">
        <button
          onClick={handleFinishSketch}
          className="w-full py-1.5 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors font-medium"
        >
          Finish Sketch
        </button>
      </div>
    </div>
  );
};

export default SketchPalette;
