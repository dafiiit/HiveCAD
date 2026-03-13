/**
 * FolderEditDialog — modal for editing a toolbar folder's label and tools.
 *
 * Extracted from RibbonToolbar.tsx so the main toolbar file doesn't mix
 * dialog logic with layout/drag-and-drop concerns.
 */
import React from 'react';
import * as Icons from 'lucide-react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AddToolDialog } from '../AddToolDialog';
import { getToolLabel, getToolIcon, isToolImplemented } from './ToolDefs';

// ─── SortableFolderTool ───────────────────────────────────────────────────────

interface SortableFolderToolProps {
    id: string;
    toolId: string;
    label: string;
    icon: React.ReactNode;
    isPrimary: boolean;
    onRemove: () => void;
}

const SortableFolderTool = ({ id, toolId, label, icon, isPrimary, onRemove }: SortableFolderToolProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0,
        opacity: isDragging ? 0.5 : 1,
    };
    const implemented = isToolImplemented(toolId);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center justify-between p-2 rounded-xl bg-background/40 hover:bg-background/60 border transition-colors group ${implemented ? 'border-border/10' : 'border-red-500/30'} ${isPrimary ? 'border-b-2 border-b-dashed border-b-primary/40' : ''}`}
        >
            <div className="flex items-center gap-3">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                    <GripVertical size={14} />
                </div>
                <div className={`w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center ${implemented ? 'text-muted-foreground' : 'text-red-500'}`}>
                    {icon}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${!implemented ? 'text-red-500' : ''}`}>{label}</span>
                    {isPrimary && (
                        <span className="text-[9px] uppercase tracking-wider font-bold text-primary/80">Main</span>
                    )}
                </div>
            </div>
            <button
                onClick={onRemove}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
};

// ─── FolderEditDialog ─────────────────────────────────────────────────────────

export interface FolderEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folderId: string;
    initialLabel: string;
    onSave: (label: string) => void;
    onDelete: () => void;
    toolIds: string[];
    onRemoveTool: (index: number) => void;
    onAddTool: (toolId: string) => void;
    onReorderTools: (toolIds: string[]) => void;
}

export const FolderEditDialog = ({
    open,
    onOpenChange,
    initialLabel,
    onSave,
    onDelete,
    toolIds,
    onRemoveTool,
    onAddTool,
    onReorderTools,
}: FolderEditDialogProps) => {
    const [label, setLabel] = React.useState(initialLabel);
    const [addToolDialogOpen, setAddToolDialogOpen] = React.useState(false);

    React.useEffect(() => {
        if (open) setLabel(initialLabel);
    }, [open, initialLabel]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = toolIds.findIndex(id => id === active.id);
            const newIndex = toolIds.findIndex(id => id === over.id);
            onReorderTools(arrayMove(toolIds, oldIndex, newIndex));
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent aria-describedby={undefined} className="sm:max-w-[450px] rounded-[2rem] bg-background/95 backdrop-blur-md border-border/40 p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">Edit Folder</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="grid gap-4 p-4 rounded-3xl bg-muted/20 border border-border/20">
                            <div className="grid gap-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Folder Identity</label>
                                <Input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Folder Name"
                                    className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tools in Folder</label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAddToolDialogOpen(true)}
                                    className="h-7 rounded-lg text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-bold uppercase">Add Tool</span>
                                </Button>
                            </div>

                            <div className="rounded-3xl border border-border/20 bg-muted/10 overflow-hidden">
                                <ScrollArea className="h-[250px]">
                                    {toolIds.length > 0 ? (
                                        <div className="p-2">
                                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                                <SortableContext items={toolIds} strategy={verticalListSortingStrategy}>
                                                    <div className="grid gap-1">
                                                        {toolIds.map((toolId, idx) => (
                                                            <SortableFolderTool
                                                                key={`${toolId}-${idx}`}
                                                                id={toolId}
                                                                toolId={toolId}
                                                                label={getToolLabel(toolId)}
                                                                icon={getToolIcon(toolId, isToolImplemented(toolId))}
                                                                isPrimary={idx === 0}
                                                                onRemove={() => onRemoveTool(idx)}
                                                            />
                                                        ))}
                                                    </div>
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-muted/20 flex items-center justify-center">
                                                <Icons.Package size={20} className="opacity-20" />
                                            </div>
                                            <p className="text-xs font-medium italic opacity-50">No tools in this folder</p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/20">
                        <Button
                            variant="ghost"
                            onClick={() => { onDelete(); onOpenChange(false); }}
                            className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 px-4 h-10"
                        >
                            <Trash2 size={16} />
                            <span className="font-bold text-xs uppercase tracking-tight">Delete Folder</span>
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 px-6 font-semibold text-xs uppercase tracking-tight">Cancel</Button>
                            <Button onClick={() => { onSave(label); onOpenChange(false); }} className="rounded-xl h-10 px-8 font-bold text-xs uppercase tracking-tight shadow-lg shadow-primary/20">Save Changes</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AddToolDialog
                open={addToolDialogOpen}
                onOpenChange={setAddToolDialogOpen}
                onSelectTool={(tid) => { onAddTool(tid); setAddToolDialogOpen(false); }}
            />
        </>
    );
};
