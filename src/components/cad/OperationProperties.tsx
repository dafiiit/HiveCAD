

import React, { useEffect, useState } from "react";
import { useCADStore } from "@/hooks/useCADStore";
import { X, Check, Info, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toolRegistry } from "@/lib/tools/registry";
import { ToolUIProperty } from "@/lib/tools/types";

const OperationProperties = () => {
    const { activeOperation, updateOperationParams, applyOperation, cancelOperation, objects, selectedIds, selectObject, clearSelection } = useCADStore();
    const [activeSelectionField, setActiveSelectionField] = useState<string | null>(null);

    // Get current tool definition
    const tool = activeOperation ? toolRegistry.get(activeOperation.type) : undefined;

    // Reset active selection field when operation changes
    useEffect(() => {
        setActiveSelectionField(null);
    }, [activeOperation?.type]);

    // Handle selection from viewport
    useEffect(() => {
        if (activeSelectionField && selectedIds.size > 0) {
            // Get the most recently selected item (simplistic approach for single item fields)
            // Ideally we check allowedTypes here against the object type
            const latestId = Array.from(selectedIds).pop();

            if (latestId) {
                updateOperationParams({ [activeSelectionField]: latestId });
                // We keep the selection field active to allow changing selection? 
                // Or we behave like "click to select, done". Let's try auto-finish selection for now.
                // But often user clicks multiple things if allowed.
                // For now, assuming single selection per field as specificed in Revolve tool.
                setActiveSelectionField(null);
            }
        }
    }, [selectedIds, activeSelectionField, updateOperationParams]);

    if (!activeOperation || !tool) return null;

    const { type, params } = activeOperation;

    // Helper to format key names (fallback if no label)
    const formatLabel = (key: string) => {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase());
    };

    const renderSelectionInput = (prop: ToolUIProperty, value: any) => {
        const isSelected = !!value;
        const isActive = activeSelectionField === prop.key;

        // Find object name if selected
        let displayText = "0 ausgewählt";
        if (isSelected) {
            const obj = objects.find(o => o.id === value);
            displayText = "1 ausgewählt"; // Could show name: obj?.name || ...
        } else if (isActive) {
            displayText = "Select object...";
        }

        return (
            <div className="flex items-center gap-2">
                <button
                    className={cn(
                        "flex-1 h-8 px-3 rounded text-xs flex items-center justify-between transition-colors border",
                        isActive
                            ? "bg-primary/20 border-primary text-primary"
                            : isSelected
                                ? "bg-secondary/40 border-border text-foreground"
                                : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                    )}
                    onClick={() => {
                        setActiveSelectionField(isActive ? null : prop.key);
                        if (!isActive) clearSelection(); // Clear previous selection when starting new pick
                    }}
                >
                    <div className="flex items-center gap-2">
                        <MousePointer2 className="w-3.5 h-3.5" />
                        <span>{displayText}</span>
                    </div>
                </button>

                {isSelected && (
                    <button
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => updateOperationParams({ [prop.key]: null })}
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    };

    const renderInput = (prop: ToolUIProperty) => {
        const value = params[prop.key] !== undefined ? params[prop.key] : prop.default;

        if (prop.type === 'selection') {
            return renderSelectionInput(prop, value);
        }

        if (prop.type === 'select') {
            return (
                <Select
                    value={value?.toString()}
                    onValueChange={(val) => updateOperationParams({ [prop.key]: val })}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        {prop.options?.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }

        if (prop.type === 'number') {
            return (
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        value={value}
                        onChange={(e) => updateOperationParams({ [prop.key]: parseFloat(e.target.value) || 0 })}
                        className="h-8"
                        step={prop.step || 0.1}
                        min={prop.min}
                        max={prop.max}
                    />
                    {prop.unit && (
                        <span className="text-xs text-muted-foreground w-6">
                            {prop.unit}
                        </span>
                    )}
                </div>
            );
        }

        if (prop.type === 'boolean') {
            return (
                <div className="flex items-center h-8">
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => updateOperationParams({ [prop.key]: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                </div>
            );
        }

        return (
            <Input
                type="text"
                value={value || ''}
                onChange={(e) => updateOperationParams({ [prop.key]: e.target.value })}
                className="h-8"
            />
        );
    };

    return (
        <div className="absolute right-4 bottom-24 w-72 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-lg flex flex-col overflow-hidden z-50">
            {/* Header */}
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold text-sm uppercase tracking-wide">
                    {tool.metadata.label || tool.metadata.id}
                </span>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {tool.uiProperties.map((prop) => (
                    <div key={prop.key} className={cn("space-y-1.5", prop.type === 'boolean' && "flex items-center justify-between space-y-0")}>
                        <Label className="text-xs text-muted-foreground font-normal">
                            {prop.label || formatLabel(prop.key)}
                        </Label>
                        {renderInput(prop)}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-border bg-muted/10 flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={cancelOperation}
                >
                    Abbrechen
                </Button>
                <Button
                    size="sm"
                    className="flex-1"
                    onClick={applyOperation}
                // Basic validation could go here
                >
                    OK
                </Button>
            </div>
        </div>
    );
};

export default OperationProperties;

