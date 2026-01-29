import React, { useEffect, useState } from "react";
import {
    CommandSeparator,
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
    Box,
    Minus,
    ArrowUpRight,
    RotateCw,
    Pencil,
    Scissors,
    Move,
    Copy,
    Scale,
    Trash2,
    Combine,
    SplitSquareVertical,
    Layers,
    Settings2,
    Grid3X3,
    Square,
    Ruler,
    Search,
    Eye,
    Download,
    Upload,
    MousePointer2,
    Package,
    Cpu,
    Zap,
    Wind,
    Settings,
    Grid
} from "lucide-react";
import { useCADStore, ToolType } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { MOCK_EXTENSIONS } from "@/lib/mock-extensions";

interface CommandPaletteProps {
    onOpenExtensionStore?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onOpenExtensionStore }) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { setActiveTool, startOperation, duplicateSelected, deleteObject, selectedIds } = useCADStore();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = (command: () => void) => {
        command();
        setOpen(false);
    };

    const handleToolSelect = (tool: ToolType) => {
        runCommand(() => {
            setActiveTool(tool);
            toast(`Tool: ${tool}`);
        });
    };

    const handleOperation = (type: string) => {
        runCommand(() => {
            startOperation(type);
            toast.info(`Configure ${type} parameters`);
        });
    };

    const menuItems = [
        {
            group: "Create",
            items: [
                { label: "Sketch", icon: <Pencil className="mr-2 h-4 w-4" />, action: () => handleToolSelect('select') }, // Assuming sketch mode trigger is tied to some state
                { label: "Line", icon: <Minus className="mr-2 h-4 w-4" />, action: () => handleToolSelect('line') },
                { label: "Extrude", icon: <ArrowUpRight className="mr-2 h-4 w-4" />, action: () => handleOperation('extrusion') },
                { label: "Revolve", icon: <RotateCw className="mr-2 h-4 w-4" />, action: () => handleOperation('revolve') },
                { label: "Box", icon: <Box className="mr-2 h-4 w-4" />, action: () => handleOperation('box') },
            ],
        },
        {
            group: "Modify",
            items: [
                { label: "Move", icon: <Move className="mr-2 h-4 w-4" />, action: () => handleToolSelect('move') },
                { label: "Rotate", icon: <RotateCw className="mr-2 h-4 w-4" />, action: () => handleToolSelect('rotate') },
                { label: "Scale", icon: <Scale className="mr-2 h-4 w-4" />, action: () => handleToolSelect('scale') },
                {
                    label: "Copy", icon: <Copy className="mr-2 h-4 w-4" />, action: () => {
                        if (selectedIds.size === 0) {
                            toast.error("Select objects to duplicate");
                            return;
                        }
                        duplicateSelected();
                        toast.success(`Duplicated ${selectedIds.size} object(s)`);
                    }
                },
                {
                    label: "Delete", icon: <Trash2 className="mr-2 h-4 w-4" />, action: () => {
                        if (selectedIds.size === 0) {
                            toast.error("Select objects to delete");
                            return;
                        }
                        [...selectedIds].forEach(id => deleteObject(id));
                        toast.success(`Deleted ${selectedIds.size} object(s)`);
                    }
                },
            ],
        },
        {
            group: "Combine",
            items: [
                { label: "Join", icon: <Combine className="mr-2 h-4 w-4" />, action: () => handleOperation('join') },
                { label: "Cut", icon: <SplitSquareVertical className="mr-2 h-4 w-4" />, action: () => handleOperation('cut') },
                { label: "Intersect", icon: <Layers className="mr-2 h-4 w-4" />, action: () => handleOperation('intersect') },
            ]
        },
        {
            group: "Extensions",
            items: MOCK_EXTENSIONS.map(ext => ({
                label: ext.name,
                icon: ext.icon === "Settings" ? <Settings className="mr-2 h-4 w-4" /> :
                    ext.icon === "Grid" ? <Grid className="mr-2 h-4 w-4" /> :
                        ext.icon === "Zap" ? <Zap className="mr-2 h-4 w-4" /> :
                            ext.icon === "Wind" ? <Wind className="mr-2 h-4 w-4" /> :
                                ext.icon === "Layers" ? <Layers className="mr-2 h-4 w-4" /> :
                                    ext.icon === "Cpu" ? <Cpu className="mr-2 h-4 w-4" /> :
                                        <Package className="mr-2 h-4 w-4" />,
                action: () => {
                    toast.success(`Loading extension: ${ext.name}`);
                    // Extensions logic placeholder
                }
            }))
        }
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-2xl bg-transparent border-none shadow-none p-0 overflow-visible [&>button]:hidden">
                <div className="bg-background/40 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/10 ring-1 ring-white/20">
                    <Command className={cn(
                        "bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
                        searchQuery.length === 0 ? "[&_[cmdk-input-wrapper]]:border-none" : "[&_[cmdk-input-wrapper]]:border-white/10"
                    )}>
                        <CommandInput
                            placeholder="Search tools, commands, extensions..."
                            className="h-16 text-xl border-none focus:ring-0 bg-transparent"
                            onValueChange={(v) => setSearchQuery(v)}
                        />
                        <div className={cn("overflow-hidden transition-all duration-300", searchQuery.length > 0 ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                            <CommandList className="max-h-[500px] p-3">
                                <CommandEmpty className="py-16 border-t border-white/5">
                                    <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
                                        <Search className="w-10 h-10 opacity-20" />
                                        <p className="text-lg">No results found for "{searchQuery}"</p>
                                    </div>
                                </CommandEmpty>
                                {menuItems.map((group) => (
                                    <React.Fragment key={group.group}>
                                        <CommandGroup heading={group.group} className="px-2">
                                            {group.items.map((item) => (
                                                <CommandItem
                                                    key={item.label}
                                                    onSelect={() => runCommand(item.action)}
                                                    className="cursor-pointer rounded-2xl py-4 px-5 aria-selected:bg-white/10 aria-selected:text-primary transition-all mb-1.5 group"
                                                >
                                                    <div className="p-2.5 rounded-xl bg-white/5 mr-4 group-aria-selected:bg-primary/20 transition-colors shadow-sm">
                                                        {React.cloneElement(item.icon as React.ReactElement, { className: "w-5 h-5" })}
                                                    </div>
                                                    <span className="font-semibold text-base">{item.label}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                        <CommandSeparator className="bg-white/5 my-3" />
                                    </React.Fragment>
                                ))}
                            </CommandList>
                        </div>
                    </Command>
                </div>
            </DialogContent>
        </Dialog>
    );
};
