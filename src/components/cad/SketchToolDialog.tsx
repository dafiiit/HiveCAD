import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { useCADStore, ToolType } from "@/hooks/useCADStore";

interface SketchToolDialogProps {
    isVisible: boolean;
    position?: { x: number; y: number };
    onClose: () => void;
    onConfirm: (params: Record<string, any>) => void;
}

// Define parameter configs for each tool type
const TOOL_PARAMS: Record<string, { label: string; key: string; type: 'number' | 'text' | 'boolean'; default: any }[]> = {
    // Line tools
    line: [
        { label: "X", key: "x", type: "number", default: 0 },
        { label: "Y", key: "y", type: "number", default: 0 },
    ],
    vline: [
        { label: "Distance Y", key: "dy", type: "number", default: 10 },
    ],
    hline: [
        { label: "Distance X", key: "dx", type: "number", default: 10 },
    ],
    polarline: [
        { label: "Distance", key: "distance", type: "number", default: 10 },
        { label: "Angle (°)", key: "angle", type: "number", default: 45 },
    ],
    tangentline: [
        { label: "Distance", key: "distance", type: "number", default: 10 },
    ],
    movePointer: [
        { label: "X", key: "x", type: "number", default: 0 },
        { label: "Y", key: "y", type: "number", default: 0 },
    ],

    // Arc tools
    threePointsArc: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 0 },
        { label: "Via X", key: "viaX", type: "number", default: 5 },
        { label: "Via Y", key: "viaY", type: "number", default: 5 },
    ],
    tangentArc: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 0 },
    ],
    sagittaArc: [
        { label: "Δx", key: "dx", type: "number", default: 10 },
        { label: "Δy", key: "dy", type: "number", default: 0 },
        { label: "Sagitta", key: "sagitta", type: "number", default: 3 },
    ],
    ellipse: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 5 },
        { label: "X Radius", key: "xRadius", type: "number", default: 8 },
        { label: "Y Radius", key: "yRadius", type: "number", default: 4 },
        { label: "Rotation (°)", key: "rotation", type: "number", default: 0 },
        { label: "Long Way", key: "longWay", type: "boolean", default: false },
        { label: "Counter CW", key: "counterClockwise", type: "boolean", default: false },
    ],

    // Spline tools
    smoothSpline: [
        { label: "Δx", key: "dx", type: "number", default: 10 },
        { label: "Δy", key: "dy", type: "number", default: 5 },
        { label: "Start Tangent (°)", key: "startTangent", type: "number", default: 0 },
        { label: "End Tangent (°)", key: "endTangent", type: "number", default: 0 },
    ],
    bezier: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 0 },
        { label: "Control X", key: "ctrlX", type: "number", default: 5 },
        { label: "Control Y", key: "ctrlY", type: "number", default: 8 },
    ],
    quadraticBezier: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 0 },
        { label: "Control X", key: "ctrlX", type: "number", default: 5 },
        { label: "Control Y", key: "ctrlY", type: "number", default: 5 },
    ],
    cubicBezier: [
        { label: "End X", key: "endX", type: "number", default: 10 },
        { label: "End Y", key: "endY", type: "number", default: 0 },
        { label: "Ctrl Start X", key: "ctrlStartX", type: "number", default: 3 },
        { label: "Ctrl Start Y", key: "ctrlStartY", type: "number", default: 5 },
        { label: "Ctrl End X", key: "ctrlEndX", type: "number", default: 7 },
        { label: "Ctrl End Y", key: "ctrlEndY", type: "number", default: 5 },
    ],

    // Shape tools
    rectangle: [
        { label: "Width", key: "width", type: "number", default: 20 },
        { label: "Height", key: "height", type: "number", default: 10 },
    ],
    roundedRectangle: [
        { label: "Width", key: "width", type: "number", default: 20 },
        { label: "Height", key: "height", type: "number", default: 10 },
        { label: "Corner Radius", key: "radius", type: "number", default: 3 },
    ],
    circle: [
        { label: "Radius", key: "radius", type: "number", default: 10 },
    ],
    polygon: [
        { label: "Radius", key: "radius", type: "number", default: 10 },
        { label: "Sides", key: "sides", type: "number", default: 6 },
        { label: "Sagitta", key: "sagitta", type: "number", default: 0 },
    ],
    text: [
        { label: "Text", key: "text", type: "text", default: "Hello" },
        { label: "Font Size", key: "fontSize", type: "number", default: 16 },
    ],

    // Corner modification
    customCorner: [
        { label: "Radius", key: "radius", type: "number", default: 3 },
    ],
};

const SketchToolDialog = ({ isVisible, position, onClose, onConfirm }: SketchToolDialogProps) => {
    const { activeTool } = useCADStore();
    const [values, setValues] = useState<Record<string, any>>({});

    // Get params for current tool
    const params = TOOL_PARAMS[activeTool] || [];

    // Reset values when tool changes
    useEffect(() => {
        const initial: Record<string, any> = {};
        params.forEach(p => {
            initial[p.key] = p.default;
        });
        setValues(initial);
    }, [activeTool]);

    if (!isVisible || params.length === 0) return null;

    const handleChange = (key: string, value: any, type: string) => {
        if (type === 'number') {
            setValues(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
        } else if (type === 'boolean') {
            setValues(prev => ({ ...prev, [key]: value }));
        } else {
            setValues(prev => ({ ...prev, [key]: value }));
        }
    };

    const handleConfirm = () => {
        onConfirm(values);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const style: React.CSSProperties = position
        ? { position: 'absolute', left: position.x, top: position.y }
        : {};

    return (
        <div
            className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl p-3 min-w-[200px] z-50"
            style={style}
            onKeyDown={handleKeyDown}
        >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700">
                <span className="text-sm font-medium text-slate-200 capitalize">
                    {activeTool.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-2">
                {params.map((param, index) => (
                    <div key={param.key} className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 w-24 truncate" title={param.label}>
                            {param.label}
                        </label>
                        {param.type === 'boolean' ? (
                            <input
                                type="checkbox"
                                checked={values[param.key] || false}
                                onChange={(e) => handleChange(param.key, e.target.checked, param.type)}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary focus:ring-primary"
                            />
                        ) : (
                            <input
                                type={param.type === 'number' ? 'number' : 'text'}
                                value={values[param.key] ?? param.default}
                                onChange={(e) => handleChange(param.key, e.target.value, param.type)}
                                autoFocus={index === 0}
                                className="flex-1 bg-slate-800 text-white text-xs px-2 py-1.5 rounded border border-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                                step={param.type === 'number' ? 'any' : undefined}
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="flex gap-2 mt-4 pt-2 border-t border-slate-700">
                <button
                    onClick={onClose}
                    className="flex-1 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                >
                    Cancel
                </button>
                <button
                    onClick={handleConfirm}
                    className="flex-1 px-3 py-1.5 text-xs text-white bg-primary hover:bg-primary/90 rounded transition-colors flex items-center justify-center gap-1"
                >
                    <Check className="w-3 h-3" />
                    Apply
                </button>
            </div>
        </div>
    );
};

export default SketchToolDialog;

// Export for use in hooks
export { TOOL_PARAMS };
