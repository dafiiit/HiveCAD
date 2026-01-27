import React from 'react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Pipette } from 'lucide-react';

interface UnifiedColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    className?: string;
    presetColors?: string[];
}

const DEFAULT_PRESETS = [
    '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#d946ef'
];

export function UnifiedColorPicker({
    color,
    onChange,
    className,
    presetColors = DEFAULT_PRESETS
}: UnifiedColorPickerProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "w-7 h-7 rounded-full border-2 border-border shadow-sm hover:scale-110 transition-transform cursor-pointer shrink-0",
                        className
                    )}
                    style={{ backgroundColor: color }}
                    title="Choose color"
                />
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-3">
                    <HexColorPicker color={color} onChange={onChange} />

                    <div className="flex flex-wrap gap-1 w-[200px]">
                        {presetColors.map((preset) => (
                            <button
                                key={preset}
                                className="w-6 h-6 rounded-md border border-zinc-200 hover:scale-110 transition-transform"
                                style={{ backgroundColor: preset }}
                                onClick={() => onChange(preset)}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <div
                            className="w-8 h-8 rounded-md border border-zinc-200 shrink-0"
                            style={{ backgroundColor: color }}
                        />
                        <Input
                            value={color}
                            onChange={(e) => onChange(e.target.value)}
                            className="h-8 rounded-md"
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
