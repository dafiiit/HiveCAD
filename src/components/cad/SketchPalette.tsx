import { useState } from "react";
import { 
  ChevronDown, 
  ChevronRight, 
  Minus, 
  Pencil, 
  ArrowUpRight 
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [optionsExpanded, setOptionsExpanded] = useState(true);
  const [options, setOptions] = useState({
    lineType: true,
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
  };

  return (
    <div className="cad-sketch-palette flex flex-col">
      <div className="cad-panel-header">
        <span>Sketch Palette</span>
        <button className="text-muted-foreground hover:text-foreground">
          <Minus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
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
                  <button className="p-1 hover:bg-secondary rounded">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-secondary rounded">
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
        <button className="w-full py-1.5 px-3 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors">
          Finish Sketch
        </button>
      </div>
    </div>
  );
};

export default SketchPalette;
