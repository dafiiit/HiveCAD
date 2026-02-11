import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { toolRegistry } from "@/lib/tools";
import { ToolMetadata, Tool } from "@/lib/tools/types";
import { IconResolver } from "@/components/ui/IconResolver";
import { StorageManager } from "@/lib/storage/StorageManager";
import { ExtensionEntry } from "@/lib/storage/types";

interface AddToolDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectTool: (toolId: string) => void;
}

export const AddToolDialog = ({ open, onOpenChange, onSelectTool }: AddToolDialogProps) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [extensions, setExtensions] = React.useState<ExtensionEntry[]>([]);

    React.useEffect(() => {
        if (open) {
            const fetchExtensions = async () => {
                try {
                    const meta = StorageManager.getInstance().supabaseMeta;
                    if (meta) {
                        const results = await meta.searchExtensions("");
                        setExtensions(results);
                    }
                } catch (error) {
                    console.error("Failed to fetch extensions for dialog:", error);
                }
            };
            fetchExtensions();
        }
    }, [open]);

    const tools = React.useMemo(() => {
        const registeredTools = toolRegistry.getAllMetadata().filter(tool =>
            tool.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tool.id.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const extensionTools = extensions.filter(ext =>
            ext.manifest?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ext.manifest?.description?.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(ext => ({
            id: ext.id,
            label: ext.manifest?.name || ext.id,
            description: ext.manifest?.description || '',
            category: 'EXTENSIONS' as any,
            icon: ext.manifest?.icon || ''
        }));

        return [...registeredTools, ...extensionTools];
    }, [searchQuery, extensions]);

    const categories = React.useMemo(() => {
        const cats = Array.from(new Set(tools.map(t => t.category)));
        // Ensure EXTENSIONS is always at the bottom if it exists
        const sortedCats = cats.filter(c => c !== ('EXTENSIONS' as any)).sort();
        if (cats.includes('EXTENSIONS' as any)) {
            sortedCats.push('EXTENSIONS' as any);
        }
        return sortedCats;
    }, [tools]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined} className="sm:max-w-[500px] h-[600px] flex flex-col p-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-md rounded-[2rem]">
                <DialogHeader className="p-6 pb-4 border-b border-border/20 bg-transparent">
                    <DialogTitle className="text-xl font-bold">Add Tool</DialogTitle>
                    <div className="relative mt-4">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                        <Input
                            placeholder="Search tools, extensions..."
                            className="pl-11 h-11 bg-background/60 backdrop-blur-xl border-border/50 focus-visible:ring-primary/30 rounded-full text-sm shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {categories.map(category => (
                        <div key={category} className="mb-8">
                            <h3 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-4 px-1">
                                {category}
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {tools.filter(t => t.category === category).map(tool => (
                                    <button
                                        key={tool.id}
                                        onClick={() => {
                                            // If it's an extension, register it in the registry so other components (like toolbar) can find its metadata
                                            if (category === 'EXTENSIONS') {
                                                const extension = extensions.find(ext => ext.id === tool.id);
                                                if (extension && extension.manifest) {
                                                    toolRegistry.register({
                                                        metadata: {
                                                            id: extension.id,
                                                            label: extension.manifest.name,
                                                            icon: extension.manifest.icon,
                                                            category: 'operation', // Default for extensions
                                                            description: extension.manifest.description
                                                        },
                                                        uiProperties: [] // Extensions will define these in their index.ts later
                                                    } as Tool);
                                                }
                                            }
                                            onSelectTool(tool.id);
                                            onOpenChange(false);
                                        }}
                                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all text-left group border border-transparent hover:border-border/50 shadow-sm hover:shadow-md bg-muted/20"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-background border border-border/50 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all shadow-inner">
                                            {tool.icon ? (
                                                <IconResolver name={tool.icon} className="w-5 h-5" />
                                            ) : (
                                                <span className="text-xs font-bold">{tool.label.substring(0, 2).toUpperCase()}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{tool.label}</div>
                                            <div className="text-[10px] text-muted-foreground truncate leading-relaxed">{tool.description}</div>
                                        </div>
                                        <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-all transform group-hover:scale-110" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}

                    {tools.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Search className="h-8 w-8 mb-2 opacity-20" />
                            <p>No tools found</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
