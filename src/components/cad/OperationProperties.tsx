import React, { useEffect, useState, useCallback } from "react";
import { useCADStore, useCADStoreApi } from "@/hooks/useCADStore";
import { X, Check, Info, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toolRegistry } from "@/lib/tools/registry";
import { ToolUIProperty } from "@/lib/tools/types";

const OperationProperties = () => {
    const {
        activeOperation,
        updateOperationParams,
        applyOperation,
        cancelOperation,
        objects,
        selectedIds,
        clearSelection
    } = useCADStore();

    const storeApi = useCADStoreApi();
    const [activeSelectionField, setActiveSelectionField] = useState<string | null>(null);

    // Get current tool definition
    const tool = activeOperation ? toolRegistry.get(activeOperation.type) : undefined;

    // Wrap updateOperationParams to handle tool-specific logic.
    // We use storeApi.getState() to avoid dependency on activeOperation and objects,
    // which would cause this function to be recreated (and useEffects to re-run) on every frame.
    const handleUpdateParams = useCallback((newParams: Record<string, any>) => {
        const state = storeApi.getState();
        const currentOp = state.activeOperation;
        if (!currentOp || !tool) return;

        let updatedParams = { ...currentOp.params, ...newParams };

        if (tool.onPropertyChange) {
            for (const [key, value] of Object.entries(newParams)) {
                const results = tool.onPropertyChange(updatedParams, key, value, state.objects);
                if (results) {
                    updatedParams = { ...updatedParams, ...results };
                }
            }
        }

        updateOperationParams(updatedParams);
    }, [tool, storeApi, updateOperationParams]);

    // Reset active selection field when operation changes
    useEffect(() => {
        setActiveSelectionField(null);
    }, [activeOperation?.type]);

    // Handle selection from viewport
    useEffect(() => {
        if (activeSelectionField && selectedIds.size > 0) {
            const latestId = Array.from(selectedIds).pop();

            if (latestId) {
                handleUpdateParams({ [activeSelectionField]: latestId });
                setActiveSelectionField(null);
            }
        }
    }, [selectedIds, activeSelectionField, handleUpdateParams]);

    if (!activeOperation || !tool) return null;

    const { type, params } = activeOperation;

    const formatLabel = (key: string) => {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase());
    };

    const renderSelectionInput = (prop: ToolUIProperty, value: any) => {
        const isSelected = !!value;
        const isActive = activeSelectionField === prop.key;

        let displayText = "0 ausgewählt";
        if (isSelected) {
            displayText = "1 ausgewählt";
        } else if (isActive) {
            displayText = "Objekt wählen...";
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
                        if (!isActive) clearSelection();
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
                        onClick={() => handleUpdateParams({ [prop.key]: null })}
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
                    onValueChange={(val) => handleUpdateParams({ [prop.key]: val })}
                >
                    <SelectTrigger className="h-8">
                        <SelectValue placeholder="Wählen..." />
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
                        onChange={(e) => handleUpdateParams({ [prop.key]: parseFloat(e.target.value) || 0 })}
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
                        onChange={(e) => handleUpdateParams({ [prop.key]: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                </div>
            );
        }

        return (
            <Input
                type="text"
                value={value || ''}
                onChange={(e) => handleUpdateParams({ [prop.key]: e.target.value })}
                className="h-8"
            />
        );
    };

    return (
        <div className="absolute right-4 bottom-24 w-72 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-lg flex flex-col overflow-hidden z-50">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="font-semibold text-sm uppercase tracking-wide">
                    {tool.metadata.label || tool.metadata.id}
                </span>
            </div>

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
                >
                    OK
                </Button>
            </div>
        </div>
    );
};

export default OperationProperties;
