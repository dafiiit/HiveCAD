/**
 * ToolFolderButton — a toolbar button that represents a folder of tools.
 *
 * In normal mode it shows the primary (first) tool's icon as a clickable
 * button, with a dropdown to reveal all tools in the folder.
 * In edit mode it becomes a single clickable tile that opens the folder editor.
 */
import React from 'react';
import * as Icons from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolButton, getToolIcon, getToolLabel, isToolImplemented } from './ToolDefs';
import type { ToolType } from '@/hooks/useCADStore';

export interface ToolFolderButtonProps {
    folderId: string;
    label: string;
    toolIds: string[];
    isEditing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onSelectTool: (toolId: string) => void;
    idToOnClickMap: Record<string, () => void>;
    activeTool: string | null;
    activeConstraintType: string | null;
}

export const ToolFolderButton = ({
    folderId,
    label,
    toolIds,
    isEditing,
    onEdit,
    onSelectTool,
    idToOnClickMap,
    activeTool,
    activeConstraintType,
}: ToolFolderButtonProps) => {
    const isActive = toolIds.includes(activeTool || '') || toolIds.includes(activeConstraintType || '');
    const hasImplementedTools = toolIds.some(tid => isToolImplemented(tid));
    const mainToolId = toolIds[0];
    const mainToolImplemented = mainToolId ? isToolImplemented(mainToolId) : false;

    const handleMainToolSelect = () => {
        if (!mainToolId) return;
        if (idToOnClickMap[mainToolId]) {
            idToOnClickMap[mainToolId]();
            return;
        }
        onSelectTool(mainToolId);
    };

    // ── Edit mode ────────────────────────────────────────────────────────────
    if (isEditing) {
        return (
            <div className="relative group/folder flex h-full">
                <ToolButton
                    icon={mainToolId ? getToolIcon(mainToolId, mainToolImplemented) : <Icons.Package className="w-5 h-5" />}
                    label={label}
                    isActive={isActive}
                    hasDropdown
                    isImplemented={hasImplementedTools}
                    onClick={(e) => { e?.stopPropagation(); onEdit(); }}
                />
            </div>
        );
    }

    // ── Normal mode — split button + dropdown ─────────────────────────────────
    return (
        <div className="relative group/folder flex h-full">
            <DropdownMenu>
                <div className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${!hasImplementedTools ? 'border-2 border-red-500/50' : ''}`}>
                    {/* Primary action: click to activate the leading tool */}
                    <button
                        type="button"
                        onClick={handleMainToolSelect}
                        disabled={!mainToolId}
                        className="w-full flex-1 flex items-center justify-center rounded-md hover:bg-secondary/60 transition-colors disabled:opacity-50"
                        title={mainToolId ? `Select ${getToolLabel(mainToolId)}` : 'No tools in folder'}
                    >
                        <div className={`cad-tool-button-icon ${!mainToolImplemented && mainToolId ? 'text-red-500' : ''}`}>
                            {mainToolId
                                ? getToolIcon(mainToolId, mainToolImplemented)
                                : <Icons.Package className="w-5 h-5 opacity-40" />
                            }
                        </div>
                    </button>

                    {/* Dropdown trigger: label row */}
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="w-full mt-auto flex items-center justify-center gap-0.5 pt-1 border-t border-border/30 rounded-b-md hover:bg-secondary/60 transition-colors"
                            title={`Open ${label} folder tools`}
                        >
                            <span className="cad-tool-button-label truncate max-w-[48px] leading-[1.1] text-center">{label}</span>
                            <ChevronDown className={`w-2 h-2 opacity-50 shrink-0 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`} />
                        </button>
                    </DropdownMenuTrigger>
                </div>

                <DropdownMenuContent align="start" className="w-[200px] p-2 rounded-2xl backdrop-blur-xl bg-background/90 shadow-2xl border-border/40">
                    <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">
                        {label}
                    </DropdownMenuLabel>
                    <div className="grid grid-cols-1 gap-1">
                        {toolIds.length > 0 ? (
                            toolIds.map((toolId) => {
                                const implemented = isToolImplemented(toolId);
                                const toolIsActive = activeTool === toolId || activeConstraintType === toolId;
                                return (
                                    <DropdownMenuItem
                                        key={toolId}
                                        onClick={() => {
                                            if (idToOnClickMap[toolId]) {
                                                idToOnClickMap[toolId]();
                                            } else {
                                                onSelectTool(toolId);
                                            }
                                        }}
                                        className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all duration-200 group/item ${toolIsActive ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'} ${!implemented ? 'border border-red-500/30' : ''}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center transition-colors ${toolIsActive ? 'border-primary/30 text-primary' : !implemented ? 'border-red-500/50 text-red-500' : 'text-muted-foreground group-hover/item:text-primary group-hover/item:border-primary/30'}`}>
                                            {getToolIcon(toolId, implemented)}
                                        </div>
                                        <span className={`text-xs font-semibold ${!implemented ? 'text-red-500' : ''}`}>{getToolLabel(toolId)}</span>
                                    </DropdownMenuItem>
                                );
                            })
                        ) : (
                            <div className="py-8 text-center text-muted-foreground text-[10px] italic">Empty Folder</div>
                        )}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
