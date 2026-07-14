/**
 * Shared primitive components and utility functions for the ribbon toolbar.
 *
 * Keeping these here (instead of inline in RibbonToolbar.tsx) makes them
 * individually testable and reduces the noise in the main toolbar file.
 */
import React from 'react';
import * as Icons from 'lucide-react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { toolRegistry } from '@/lib/tools';
import { IconResolver } from '../../ui/IconResolver';
import { useCADStore } from '@/hooks/useCADStore';
import {
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Registry-Driven Helpers ─────────────────────────────────────────────────

/**
 * Tools with placeholder/stub implementations that are not yet functional.
 * Listed explicitly so the UI can visually mark them as unimplemented.
 */
const NOT_IMPLEMENTED_TOOLS = [
    'move', 'rotate', 'scale',
    'pattern',
    'plane', 'axis', 'point',
    'measure', 'analyze',
    'parameters',
    'sketchPoint',
    'circle', 'ellipse', 'text', 'polygon', 'rectangle', 'roundedRectangle',
    'bezier', 'cubicBezier', 'smoothSpline', 'quadraticBezier',
];

const NAVIGATION_TOOLS = ['select', 'pan', 'orbit', 'sketch'];

/**
 * Returns whether a tool has a real (non-stub) implementation.
 * Navigation tools and constraint/modify category tools are always considered implemented.
 */
export const isToolImplemented = (id: string): boolean => {
    const tool = toolRegistry.get(id);
    if (!tool) return false;
    if (NAVIGATION_TOOLS.includes(id)) return true;
    if (NOT_IMPLEMENTED_TOOLS.includes(id)) return false;
    if (tool.metadata.category === 'constrain') return true;
    if (tool.metadata.category === 'modify') return true;
    return !!(tool.execute || tool.create || tool.addToSketch || tool.createShape || tool.processPoints);
};

/** Resolves the icon node for a tool ID using the tool registry. */
export const getToolIcon = (id: string, implemented = true): React.ReactNode => {
    const ext = toolRegistry.get(id);
    const iconName = ext?.metadata?.icon;
    if (iconName) {
        const IconComponent = (Icons as any)[iconName];
        if (IconComponent) {
            return <IconComponent className={`w-5 h-5 ${!implemented ? 'opacity-50' : ''}`} />;
        }
    }
    return <span className={`text-[10px] font-bold ${!implemented ? 'opacity-30' : 'opacity-50'}`}>{id.substring(0, 2).toUpperCase()}</span>;
};

/** Resolves the display label for a tool ID using the tool registry. */
export const getToolLabel = (id: string): string => {
    const ext = toolRegistry.get(id);
    return ext?.metadata?.label || id;
};

// ─── ToolIcon ────────────────────────────────────────────────────────────────

interface ToolIconProps { id: string; className?: string; }

export const ToolIcon = ({ id, className }: ToolIconProps) => {
    const { folders } = useCADStore();
    if (id.startsWith('folder:')) {
        const folderId = id.replace('folder:', '');
        const folder = folders[folderId];
        return (
            <div className={`flex items-center justify-center ${className}`}>
                <IconResolver name={folder?.icon || 'Package'} />
            </div>
        );
    }
    return (
        <div className={`flex items-center justify-center ${className}`}>
            {getToolIcon(id)}
        </div>
    );
};

// ─── ToolButton ──────────────────────────────────────────────────────────────

export interface ToolButtonProps {
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    hasDropdown?: boolean;
    onClick?: (e?: React.MouseEvent) => void;
    disabled?: boolean;
    isImplemented?: boolean;
}

export const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(
    ({ icon, label, isActive, hasDropdown, onClick, disabled, isImplemented = true, ...props }, ref) => (
        <button
            type="button"
            ref={ref}
            onClick={onClick}
            disabled={disabled}
            aria-pressed={isActive}
            className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${!isImplemented ? 'border-2 border-red-500/50' : ''}`}
            {...props}
        >
            <div className={`cad-tool-button-icon ${!isImplemented ? 'text-red-500' : ''}`} aria-hidden="true">
                {icon}
            </div>
            <div className="flex items-center gap-0.5 mt-auto">
                <span className={`cad-tool-button-label truncate max-w-[48px] leading-[1.1] text-center ${!isImplemented ? 'text-red-500' : ''}`}>{label}</span>
                {hasDropdown && <ChevronDown className={`w-2 h-2 opacity-50 shrink-0 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`} />}
            </div>
        </button>
    )
);
ToolButton.displayName = 'ToolButton';

// ─── ToolGroup ───────────────────────────────────────────────────────────────

interface ToolGroupProps { label: React.ReactNode; children: React.ReactNode; }

export const ToolGroup = ({ label, children }: ToolGroupProps) => (
    <div className="cad-tool-group">
        <div className="flex flex-col">
            <div className="flex items-end gap-0.5">
                {children}
            </div>
            <span className="cad-tool-group-label">{label}</span>
        </div>
    </div>
);

// ─── SortableTool ─────────────────────────────────────────────────────────────

interface SortableItemProps { id: string; children: React.ReactNode; disabled?: boolean; }

export const SortableTool = ({ id, children, disabled }: SortableItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 1,
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/tool">
            {children}
        </div>
    );
};

// ─── SortableSection ──────────────────────────────────────────────────────────

export const SortableSection = ({ id, children, disabled }: SortableItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 1,
        position: 'relative' as const,
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/section">
            {children}
        </div>
    );
};
