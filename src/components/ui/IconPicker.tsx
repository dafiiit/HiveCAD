import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { LucideProps, Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconPickerProps {
    value: string;
    onChange: (value: string) => void;
}

// Get all icon names from lucide-react
const ICON_NAMES = Object.keys(Icons).filter((key) => {
    // Basic filter to get only components (starts with uppercase, is a function)
    const icon = (Icons as any)[key];
    return (
        /^[A-Z]/.test(key) &&
        (typeof icon === "function" || typeof icon === "object") &&
        key !== "createLucideIcon" // Exclude helper
    );
});

export const IconPicker: React.FC<IconPickerProps> = ({ value, onChange }) => {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);

    const filteredIcons = useMemo(() => {
        if (!search) return ICON_NAMES.slice(0, 200); // Show first 200 by default
        return ICON_NAMES.filter((name) =>
            name.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 200); // Limit to 200 for performance
    }, [search]);

    const IconComponent = (Icons as any)[value] || Icons.HelpCircle;

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) setSearch("");
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 rounded-xl border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors px-3 font-normal"
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
                            <IconComponent size={16} />
                        </div>
                        <span className="truncate">{value || "Select icon..."}</span>
                    </div>
                    <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 rounded-2xl border-border/40 shadow-2xl backdrop-blur-xl bg-background/95" align="start">
                <div className="p-3 border-b border-border/20">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search icons..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9 rounded-xl border-border/50 bg-muted/20 focus-visible:ring-primary/20"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[320px]">
                    <div className="p-2 grid grid-cols-5 gap-2">
                        {filteredIcons.map((iconName) => {
                            const Icon = (Icons as any)[iconName];
                            const isSelected = value === iconName;
                            return (
                                <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => {
                                        onChange(iconName);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "relative flex items-center justify-center p-0 w-12 h-12 rounded-xl transition-all duration-200 group overflow-hidden",
                                        isSelected
                                            ? "bg-primary shadow-lg shadow-primary/25 scale-105 z-10"
                                            : "hover:bg-primary/10 bg-muted/20"
                                    )}
                                    title={iconName}
                                >
                                    <Icon
                                        size={22}
                                        className={cn(
                                            "transition-all duration-300 group-hover:scale-110",
                                            isSelected ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                                        )}
                                    />
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 bg-primary-foreground rounded-full p-0.5">
                                            <Check size={8} className="text-primary" />
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 h-1 bg-primary/20 scale-x-0 group-hover:scale-x-100 transition-transform origin-center" />
                                </button>
                            );
                        })}
                    </div>
                    {filteredIcons.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground/50">
                                <Icons.SearchX size={24} />
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">
                                No icons found for <span className="text-foreground">"{search}"</span>
                            </p>
                        </div>
                    )}
                </ScrollArea>
                <div className="p-2 border-t border-border/20 bg-muted/5">
                    <p className="text-[10px] text-center text-muted-foreground italic">
                        Showing {filteredIcons.length} of {ICON_NAMES.length} icons
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
};
