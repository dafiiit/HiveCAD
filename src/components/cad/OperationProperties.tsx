import React, { useEffect, useState } from "react";
import { useCADStore } from "@/hooks/useCADStore";
import { X, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const OperationProperties = () => {
    const { activeOperation, updateOperationParams, applyOperation, cancelOperation } = useCADStore();

    if (!activeOperation) return null;

    const { type, params } = activeOperation;

    // Render input based on value type
    const renderInput = (key: string, value: any) => {
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
        <div className="absolute right-4 bottom-4 w-72 bg-popover/95 backdrop-blur border border-border rounded-lg shadow-lg flex flex-col overflow-hidden z-50">
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
                {Object.entries(params).map(([key, value]) => (
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
                    <p>Adjust parameters to preview the operation in real-time.</p>
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
                >
                    OK
                </Button>
            </div>
        </div>
    );
};

export default OperationProperties;
