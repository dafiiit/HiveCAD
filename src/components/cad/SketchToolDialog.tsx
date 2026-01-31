import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
import { useCADStore, ToolType } from "@/hooks/useCADStore";
import { toolRegistry } from "@/lib/tools";

interface SketchToolDialogProps {
    isVisible: boolean;
    position?: { x: number; y: number };
    onClose: () => void;
    onConfirm: (params: Record<string, any>) => void;
}

const SketchToolDialog = ({ isVisible, position, onClose, onConfirm }: SketchToolDialogProps) => {
    const { activeTool } = useCADStore();
    const [values, setValues] = useState<Record<string, any>>({});

    // Get params from tool registry
    const params = toolRegistry.getUIProperties(activeTool);

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
