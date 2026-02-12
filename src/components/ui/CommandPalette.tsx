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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { StorageManager } from "@/lib/storage/StorageManager";
import { ExtensionEntry } from "@/lib/storage/types";
import { toolRegistry } from "@/lib/tools";
import * as LucideIcons from "lucide-react";

interface CommandPaletteProps {
    onOpenExtensionStore?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onOpenExtensionStore }) => {
    const {
        searchOpen,
        toggleSearch,
        setSearchOpen,
        setActiveTool,
        startOperation,
        duplicateSelected,
        deleteObject,
        selectedIds,
        enterSketchMode
    } = useCADStore();
    const [searchQuery, setSearchQuery] = useState("");
    const [extensions, setExtensions] = useState<ExtensionEntry[]>([]);

    useEffect(() => {
        if (searchOpen) {
            const fetchExtensions = async () => {
                try {
                    const meta = StorageManager.getInstance().supabaseMeta;
                    if (meta) {
                        const results = await meta.searchExtensions("");
                        setExtensions(results.slice(0, 5)); // Just top 5 for palette
                    }
                } catch (error) {
                    console.error("Failed to fetch extensions for palette:", error);
                }
            };
            fetchExtensions();
        }
    }, [searchOpen]);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                toggleSearch();
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [toggleSearch]);

    const runCommand = (command: () => void) => {
        command();
        setSearchOpen(false);
    };

    const handleToolSelect = (tool: ToolType) => {
        runCommand(() => {
            setActiveTool(tool);
            toast(`Tool: ${tool}`);
        });
    };

    const handleStartSketch = () => {
        runCommand(() => {
            enterSketchMode();
            toast.success("Sketch mode activated");
        });
    };

    const handleOperation = (type: string) => {
        runCommand(() => {
            startOperation(type);
            toast.info(`Configure ${type} parameters`);
        });
    };

    const handleExtensionSelect = async (extension: ExtensionEntry) => {
        setSearchOpen(false);

        if (!extension.manifest) {
            toast.error("Extension manifest missing");
            if (onOpenExtensionStore) {
                onOpenExtensionStore();
            }
            return;
        }

        const tool = toolRegistry.get(extension.id);
        const hasExecutable =
            !!tool?.create ||
            !!tool?.execute ||
            !!tool?.addToSketch ||
            !!tool?.processPoints ||
            !!tool?.createShape ||
            !!tool?.createInitialPrimitive;

        if (!tool || !hasExecutable) {
            try {
                const meta = StorageManager.getInstance().supabaseMeta;
                if (meta) {
                    await meta.incrementDownloads(extension.id);
                }
            } catch (error) {
                console.warn("Failed to track extension download:", error);
            }

            if (onOpenExtensionStore) {
                onOpenExtensionStore();
                toast.info(`Open Extensions to install ${extension.manifest.name}`);
            } else {
                toast.info(`Open Extensions to install ${extension.manifest.name}`);
            }
            return;
        }

        const label = tool.metadata.label || extension.manifest.name;
        const isSketchTool =
            tool.metadata.category === 'sketch' ||
            !!tool.addToSketch ||
            !!tool.processPoints ||
            !!tool.createShape ||
            !!tool.createInitialPrimitive;

        if (isSketchTool || tool.metadata.category === 'modify' || tool.metadata.category === 'navigation') {
            setActiveTool(tool.metadata.id as ToolType);
            toast(`Tool: ${label}`);
            return;
        }

        startOperation(tool.metadata.id);
        toast.info(`Configure ${label} parameters`);
    };

    const menuItems = [
        {
            group: "Create",
            items: [
                { label: "Sketch", icon: <Pencil className="mr-2 h-4 w-4" />, action: handleStartSketch },
                { label: "Line", icon: <Minus className="mr-2 h-4 w-4" />, action: () => handleToolSelect('line') },
                { label: "Extrude", icon: <ArrowUpRight className="mr-2 h-4 w-4" />, action: () => handleOperation('extrusion') },
                { label: "Revolve", icon: <RotateCw className="mr-2 h-4 w-4" />, action: () => handleOperation('revolve') },
                { label: "Box", icon: <Box className="mr-2 h-4 w-4" />, action: () => handleOperation('box') },
            ],
        },
        {
            group: "Modify",
            items: [
                { label: "Select", icon: <MousePointer2 className="mr-2 h-4 w-4" />, action: () => handleToolSelect('select') },
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
            items: extensions.map(ext => {
                const iconName = ext.manifest?.icon || 'Package';
                const LucideIcon = (LucideIcons[iconName as keyof typeof LucideIcons] as React.FC<any>) || LucideIcons.Package;
                return {
                    label: ext.manifest?.name || ext.id,
                    icon: <LucideIcon className="mr-2 h-4 w-4" />,
                    isExtension: true,
                    action: () => {
                        handleExtensionSelect(ext);
                    }
                };
            })
        }
    ];

    return (
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogContent
                aria-describedby={undefined}
                className="w-fit max-w-[90vw] bg-transparent border-none shadow-none p-0 overflow-visible [&>button]:hidden"
                onPointerDownOutside={() => setSearchOpen(false)}
            >
                <DialogTitle className="sr-only">Command Palette</DialogTitle>
                <div className="w-[90vw] max-w-2xl bg-card/95 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl border border-border/70 ring-1 ring-border/40">
                    <Command className={cn(
                        "bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
                        searchQuery.length === 0 ? "[&_[cmdk-input-wrapper]]:border-none" : "[&_[cmdk-input-wrapper]]:border-border/50"
                    )}>
                        <CommandInput
                            placeholder="Search tools, commands, extensions..."
                            className="h-16 text-xl border-none focus:ring-0 bg-transparent"
                            onValueChange={(v) => setSearchQuery(v)}
                        />
                        <div className={cn("overflow-hidden transition-all duration-300", searchQuery.length > 0 ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                            <CommandList className="max-h-[500px] p-3">
                                <CommandEmpty className="py-16 border-t border-border/30">
                                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                        <Search className="w-10 h-10 opacity-30" />
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
                                                    className="cursor-pointer rounded-2xl py-4 px-5 aria-selected:bg-secondary aria-selected:text-foreground transition-all mb-1.5 group"
                                                >
                                                    <div className="p-2.5 rounded-xl bg-secondary/70 mr-4 group-aria-selected:bg-primary/15 transition-colors shadow-sm">
                                                        {React.cloneElement(item.icon as React.ReactElement, { className: "w-5 h-5" })}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-base">{item.label}</span>
                                                        {(item as any).isExtension && <span className="text-[10px] text-primary/60 uppercase font-bold tracking-wider">Extension</span>}
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                        <CommandSeparator className="bg-border/40 my-3" />
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
