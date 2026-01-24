import React, { useEffect, useState } from "react";
import { useCADStore } from "@/hooks/useCADStore";
import { X, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const OperationProperties = () => {
    const { activeOperation, updateOperationParams, applyOperation, cancelOperation, objects, selectedIds, selectObject, clearSelection } = useCADStore();

    // Get available sketches for shape selector
    const availableSketches = objects.filter(obj => obj.type === 'sketch');

    // Check if this is an extrusion-related operation
    const isExtrusion = activeOperation?.type === 'extrusion' || activeOperation?.type === 'extrude' || activeOperation?.type === 'revolve';

    // Get selected shape from params or from current selection
    const selectedShapeId = activeOperation?.params?.selectedShape ||
        (selectedIds.size === 1 ? [...selectedIds][0] : '');

    // Auto-select shape if there's a current selection when opening
    useEffect(() => {
        if (isExtrusion && selectedIds.size === 1 && !activeOperation?.params?.selectedShape) {
            const selectedId = [...selectedIds][0];
            const obj = objects.find(o => o.id === selectedId);
            if (obj?.type === 'sketch') {
                updateOperationParams({ selectedShape: selectedId });
            }
        }
    }, [isExtrusion, selectedIds, activeOperation, objects, updateOperationParams]);

    if (!activeOperation) return null;

    const { type, params } = activeOperation;

    const handleShapeSelect = (shapeId: string) => {
        updateOperationParams({ selectedShape: shapeId });
        // Also update the selection in the store for visual feedback
        clearSelection();
        selectObject(shapeId);
    };

    // Render input based on value type
    const renderInput = (key: string, value: any) => {
        // Skip selectedShape - we render it separately
        if (key === 'selectedShape') return null;

        // Specific handling for known enums
        if (key === 'profile' && (type === 'extrusion' || type === 'extrude')) {
            return (
                <Select
                    value={value}
                    onValueChange={(val) => updateOperationParams({ [key]: val })}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="linear">Linear</SelectItem>
                        <SelectItem value="s-curve">S-Curve</SelectItem>
                    </SelectContent>
                </Select>
            );
        }

        if (typeof value === 'number') {
            return (
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        value={value}
                        onChange={(e) => updateOperationParams({ [key]: parseFloat(e.target.value) || 0 })}
                        className="h-8"
                        step={0.1}
                    />
                    <span className="text-xs text-muted-foreground w-6">
                        {key.includes('Angle') || key.includes('rotation') ? 'deg' : 'mm'}
                    </span>
                </div>
            );
        }

        if (typeof value === 'boolean') {
            return (
                <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => updateOperationParams({ [key]: e.target.checked })}
                    className="toggle"
                />
            );
        }

        return (
            <Input
                type="text"
                value={value}
                onChange={(e) => updateOperationParams({ [key]: e.target.value })}
                className="h-8"
            />
        );
    };

    // Helper to format key names (e.g., twistAngle -> Twist Angle)
    const formatLabel = (key: string) => {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase());
    };

    return (
        <div className="absolute right-4 bottom-24 w-72 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-lg flex flex-col overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold text-sm uppercase tracking-wide">
                    {type === 'extrusion' ? 'Extrude' : type.toUpperCase()}
                </span>
                <div className="flex items-center gap-1">
                    {/* Optional context actions could go here */}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Shape Selector - shown for extrusion/revolve operations */}
                {isExtrusion && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground font-normal">
                            Shape to {type === 'revolve' ? 'Revolve' : 'Extrude'}
                        </Label>
                        <Select
                            value={selectedShapeId}
                            onValueChange={handleShapeSelect}
                        >
                            <SelectTrigger className="h-8">
                                <SelectValue placeholder="Select a sketch..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableSketches.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                        No sketches available. Create a sketch first.
                                    </div>
                                ) : (
                                    availableSketches.map(sketch => (
                                        <SelectItem key={sketch.id} value={sketch.id}>
                                            {sketch.name || `Sketch ${sketch.id.slice(0, 6)}`}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {Object.entries(params)
                    .filter(([key]) => key !== 'selectedShape')
                    .map(([key, value]) => (
                        <div key={key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground font-normal">
                                {formatLabel(key)}
                            </Label>
                            {renderInput(key, value)}
                        </div>
                    ))}

                {/* Info/Help text placeholder */}
                <div className="pt-2 flex items-start gap-2 text-xs text-muted-foreground bg-secondary/20 p-2 rounded">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{isExtrusion && !selectedShapeId
                        ? 'Select a sketch from the dropdown or click one in the 3D view.'
                        : 'Adjust parameters to preview the operation in real-time.'}
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border bg-muted/10 flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={cancelOperation}
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    className="flex-1"
                    onClick={applyOperation}
                    disabled={isExtrusion && !selectedShapeId}
                >
                    OK
                </Button>
            </div>
        </div>
    );
};

export default OperationProperties;

