import React from "react";
import * as Icons from "lucide-react";
import {
  Box,
  Circle,
  Square,
  Triangle,
  Cylinder,
  Hexagon,
  Move,
  RotateCw,
  Scale,
  Copy,
  Scissors,
  Combine,
  SplitSquareVertical,
  Grid3X3,
  Layers,
  Eye,
  Settings2,
  Download,
  Upload,
  Pencil,
  Minus,
  CircleDot,
  Spline,
  RectangleHorizontal,
  Pentagon,
  ArrowUpRight,
  Ruler,
  Crosshair,
  ChevronDown,
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  Anchor,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Equal,
  GitCommit,
  ArrowUpLeft,
  PackagePlus,
  MessageSquareWarning,
  Plus,
  Settings,
  X,
  GripVertical,
  Edit2,
  Check,
  MoreVertical
} from "lucide-react";
import { useCADStore, useCADStoreApi, ToolType } from "@/hooks/useCADStore";
import { toolRegistry } from "@/lib/tools";
import { toast } from "sonner";
import { ExtensionStoreDialog } from "../extensions/ExtensionStoreDialog";
import { DeveloperFeedbackDialog } from "../ui/DeveloperFeedbackDialog";
import { AddToolDialog } from "./AddToolDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconPicker } from "../ui/IconPicker";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  hasDropdown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(({ icon, label, isActive, hasDropdown, onClick, disabled, ...props }, ref) => (
  <button
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    {...props}
  >
    <div className="cad-tool-button-icon">
      {icon}
    </div>
    <div className="flex items-center gap-0.5 mt-auto">
      <span className="cad-tool-button-label truncate max-w-[48px] leading-[1.1] text-center">{label}</span>
      {hasDropdown && <ChevronDown className="w-2 h-2 opacity-50 shrink-0" />}
    </div>
  </button>
));
ToolButton.displayName = 'ToolButton';

const IconResolver = ({ name, className }: { name: string, className?: string }) => {
  const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
  return <IconComponent className={className} />;
};

const idToIconMap: Record<string, React.ReactNode> = {
  sketch: <Pencil className="w-5 h-5" />,
  extrusion: <ArrowUpRight className="w-5 h-5" />,
  revolve: <RotateCw className="w-5 h-5" />,
  box: <Box className="w-5 h-5" />,
  cylinder: <Cylinder className="w-5 h-5" />,
  sphere: <Circle className="w-5 h-5" />,
  torus: <Hexagon className="w-5 h-5" />,
  coil: <Triangle className="w-5 h-5" />,
  move: <Move className="w-5 h-5" />,
  rotate: <RotateCw className="w-5 h-5" />,
  scale: <Scale className="w-5 h-5" />,
  duplicate: <Copy className="w-5 h-5" />,
  delete: <Trash2 className="w-5 h-5" />,
  join: <Combine className="w-5 h-5" />,
  cut: <SplitSquareVertical className="w-5 h-5" />,
  intersect: <Layers className="w-5 h-5" />,
  parameters: <Settings2 className="w-5 h-5" />,
  pattern: <Grid3X3 className="w-5 h-5" />,
  plane: <Square className="w-5 h-5" />,
  axis: <Minus className="w-5 h-5" />,
  point: <CircleDot className="w-5 h-5" />,
  measure: <Ruler className="w-5 h-5" />,
  analyze: <Eye className="w-5 h-5" />,
  import: <Download className="w-5 h-5" />,
  export: <Upload className="w-5 h-5" />,
};

const idToLabelMap: Record<string, string> = {
  sketch: 'Sketch',
  extrusion: 'Extrude',
  revolve: 'Revolve',
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  torus: 'Torus',
  coil: 'Coil',
  move: 'Move',
  rotate: 'Rotate',
  scale: 'Scale',
  duplicate: 'Copy',
  delete: 'Delete',
  join: 'Join',
  cut: 'Cut',
  intersect: 'Intersect',
  parameters: 'Parameters',
  pattern: 'Pattern',
  plane: 'Plane',
  axis: 'Axis',
  point: 'Point',
  measure: 'Measure',
  analyze: 'Analyze',
  import: 'Insert',
  export: 'Export',
};

const ToolIcon = ({ id, className }: { id: string, className?: string }) => {
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
  const icon = idToIconMap[id];
  if (icon) return <div className={`flex items-center justify-center ${className}`}>{icon}</div>;

  const metadata = toolRegistry.get(id)?.metadata;
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {metadata?.icon ? (
        <IconResolver name={metadata.icon} />
      ) : (
        <span className="text-[10px] font-bold opacity-50">{metadata?.label.substring(0, 2).toUpperCase() || id.substring(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
};

interface FolderEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  initialLabel: string;
  initialIcon: string;
  onSave: (label: string, icon: string) => void;
  onDelete: () => void;
  toolIds: string[];
  onRemoveTool: (index: number) => void;
  onAddTool: (toolId: string) => void;
  onReorderTools: (toolIds: string[]) => void;
  idToIconMap: Record<string, React.ReactNode>;
  idToLabelMap: Record<string, string>;
}

const SortableFolderTool = ({ id, toolId, label, icon, onRemove }: {
  id: string,
  toolId: string,
  label: string,
  icon: React.ReactNode,
  onRemove: () => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-2 rounded-xl bg-background/40 hover:bg-background/60 border border-border/10 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
          <GripVertical size={14} />
        </div>
        <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
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

const FolderEditDialog = ({
  open,
  onOpenChange,
  folderId,
  initialLabel,
  initialIcon,
  onSave,
  onDelete,
  toolIds,
  onRemoveTool,
  onAddTool,
  onReorderTools,
  idToIconMap,
  idToLabelMap
}: FolderEditDialogProps) => {
  const [label, setLabel] = React.useState(initialLabel);
  const [icon, setIcon] = React.useState(initialIcon);
  const [addToolDialogOpen, setAddToolDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setIcon(initialIcon);
    }
  }, [open, initialLabel, initialIcon]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = toolIds.findIndex(id => id === active.id);
      const newIndex = toolIds.findIndex(id => id === over.id);
      onReorderTools(arrayMove(toolIds, oldIndex, newIndex));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Folder Name"
                      className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="w-14">
                    <IconPicker value={icon} onChange={setIcon} />
                  </div>
                </div>
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
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={toolIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="grid gap-1">
                            {toolIds.map((toolId, idx) => (
                              <SortableFolderTool
                                key={`${toolId}-${idx}`}
                                id={toolId}
                                toolId={toolId}
                                label={toolRegistry.get(toolId)?.metadata.label || (idToLabelMap[toolId] || toolId)}
                                icon={idToIconMap[toolId] || <Icons.Package size={16} />}
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
              <Button onClick={() => { onSave(label, icon); onOpenChange(false); }} className="rounded-xl h-10 px-8 font-bold text-xs uppercase tracking-tight shadow-lg shadow-primary/20">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddToolDialog
        open={addToolDialogOpen}
        onOpenChange={setAddToolDialogOpen}
        onSelectTool={(tid) => {
          onAddTool(tid);
          setAddToolDialogOpen(false);
        }}
      />
    </>
  );
};

interface ToolFolderButtonProps {
  folderId: string;
  label: string;
  iconName: string;
  toolIds: string[];
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelectTool: (toolId: string) => void;
  idToIconMap: Record<string, React.ReactNode>;
  idToLabelMap: Record<string, string>;
  idToOnClickMap: Record<string, () => void>;
  activeTool: string | null;
}

const ToolFolderButton = ({
  folderId,
  label,
  iconName,
  toolIds,
  isEditing,
  onEdit,
  onDelete,
  onSelectTool,
  idToIconMap,
  idToLabelMap,
  idToOnClickMap,
  activeTool
}: ToolFolderButtonProps) => {
  const isActive = toolIds.includes(activeTool || '');

  return (
    <div className="relative group/folder flex h-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolButton
            icon={<IconResolver name={iconName} className="w-5 h-5" />}
            label={label}
            isActive={isActive}
            hasDropdown
            onClick={isEditing ? (e) => { e.stopPropagation(); onEdit(); } : undefined}
          />
        </DropdownMenuTrigger>
        {!isEditing && (
          <DropdownMenuContent align="start" className="w-[200px] p-2 rounded-2xl backdrop-blur-xl bg-background/90 shadow-2xl border-border/40">
            <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">
              {label}
            </DropdownMenuLabel>
            <div className="grid grid-cols-1 gap-1">
              {toolIds.length > 0 ? (
                toolIds.map((toolId) => (
                  <DropdownMenuItem
                    key={toolId}
                    onClick={() => {
                      if (idToOnClickMap[toolId]) {
                        idToOnClickMap[toolId]();
                      } else {
                        onSelectTool(toolId);
                      }
                    }}
                    className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all duration-200 group/item ${activeTool === toolId ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center transition-colors ${activeTool === toolId ? 'border-primary/30 text-primary' : 'text-muted-foreground group-hover/item:text-primary group-hover/item:border-primary/30'}`}>
                      {idToIconMap[toolId] || <ToolIcon id={toolId} className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-semibold">{toolRegistry.get(toolId)?.metadata.label || (idToLabelMap[toolId] || toolId)}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground text-[10px] italic">
                  Empty Folder
                </div>
              )}
            </div>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  );
};

interface ToolGroupProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

const ToolGroup = ({ label, children }: ToolGroupProps) => (
  <div className="cad-tool-group">
    <div className="flex flex-col">
      <div className="flex items-end gap-0.5">
        {children}
      </div>
      <span className="cad-tool-group-label">{label}</span>
    </div>
  </div>
);

const SortableTool = ({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

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

const SortableSection = ({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/section flex items-stretch">
      <div {...attributes} {...listeners} className={`flex items-center px-0.5 cursor-grab active:cursor-grabbing hover:bg-muted/50 rounded transition-colors ${disabled ? 'hidden' : ''}`}>
        <GripVertical className="w-3 h-3 text-muted-foreground/50" />
      </div>
      {children}
    </div>
  );
};

interface RibbonToolbarProps {
  activeTab: ToolTab;
  setActiveTab: (tab: ToolTab) => void;
  isSketchMode: boolean;
  onFinishSketch: () => void;
}

const RibbonToolbar = ({ activeTab, setActiveTab, isSketchMode, onFinishSketch }: RibbonToolbarProps) => {
  const {
    addObject,
    activeTool,
    setActiveTool,
    enterSketchMode,
    duplicateSelected,
    deleteObject,
    selectedIds,
    startOperation,
    objects,
    applyConstraintToSelection,
    exportSTL,
    exportSTEP,
    exportJSON,
    importFile,
    // New toolbar state
    customToolbars,
    activeToolbarId,
    setActiveToolbar,
    addCustomToolbar,
    deleteCustomToolbar,
    renameCustomToolbar,
    isEditingToolbar,
    setEditingToolbar,
    addSection,
    deleteSection,
    renameSection,
    reorderSections,
    addToolToSection,
    removeToolFromSection,
    reorderToolsInSection,
    moveToolBetweenSections,
    // Folder state
    folders,
    addFolder,
    deleteFolder,
    renameFolder,
    updateFolderIcon,
    addToolToFolder,
    removeToolFromFolder,
    reorderToolsInFolder
  } = useCADStore();

  const [isExtensionStoreOpen, setIsExtensionStoreOpen] = React.useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);
  const [editingToolbarName, setEditingToolbarName] = React.useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = React.useState<string | null>(null);
  const [addToolDialogOpen, setAddToolDialogOpen] = React.useState(false);
  const [activeTargetSection, setActiveTargetSection] = React.useState<string | null>(null);
  const [isFolderEditDialogOpen, setIsFolderEditDialogOpen] = React.useState(false);
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null);
  const [editingFolderSectionId, setEditingFolderSectionId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeToolbarId) return;

    const currentToolbar = customToolbars.find(t => t.id === activeToolbarId);
    if (!currentToolbar) return;

    // Check if dragging a section
    if (String(active.id).startsWith('section-')) {
      const oldIndex = currentToolbar.sections.findIndex(s => `section-${s.id}` === active.id);
      const newIndex = currentToolbar.sections.findIndex(s => `section-${s.id}` === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newSections = arrayMove(currentToolbar.sections, oldIndex, newIndex);
        reorderSections(activeToolbarId, newSections.map(s => s.id));
      }
    }
    // Check if dragging a tool
    else if (String(active.id).startsWith('tool-')) {
      const idPart = String(active.id).replace('tool-', '');
      const lastColonIndex = idPart.lastIndexOf(':');
      const activeToolId = idPart.substring(0, lastColonIndex);
      const sourceSectionId = idPart.substring(lastColonIndex + 1);

      const overIdPart = String(over.id).replace('tool-', '');
      const overLastColonIndex = overIdPart.lastIndexOf(':');
      if (overLastColonIndex === -1) return; // Not a tool
      const overToolId = overIdPart.substring(0, overLastColonIndex);
      const targetSectionId = overIdPart.substring(overLastColonIndex + 1);

      if (sourceSectionId === targetSectionId) {
        // Reorder within same section
        const section = currentToolbar.sections.find(s => s.id === sourceSectionId);
        if (section) {
          const oldIndex = section.toolIds.indexOf(activeToolId);
          const newIndex = section.toolIds.indexOf(overToolId);
          if (oldIndex !== -1 && newIndex !== -1) {
            const newToolIds = arrayMove(section.toolIds, oldIndex, newIndex);
            reorderToolsInSection(activeToolbarId, sourceSectionId, newToolIds);
          }
        }
      } else {
        // Move between sections
        const targetSection = currentToolbar.sections.find(s => s.id === targetSectionId);
        if (targetSection) {
          const newIndex = targetSection.toolIds.indexOf(overToolId);
          moveToolBetweenSections(activeToolbarId, sourceSectionId, targetSectionId, activeToolId, newIndex === -1 ? targetSection.toolIds.length : newIndex);
        }
      }
    }
  };


  const handleCreatePrimitive = (type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'plane') => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleOperation = (type: string) => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleToolSelect = (tool: ToolType) => {
    setActiveTool(tool);
    toast(`Tool: ${tool}`);
  };

  const handleStartSketch = () => {
    enterSketchMode();
    toast.success("Sketch mode activated");
  };

  const handleDuplicate = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to duplicate");
      return;
    }
    duplicateSelected();
    toast.success(`Duplicated ${selectedIds.size} object(s)`);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to delete");
      return;
    }
    const ids = [...selectedIds];
    const deleteObj = useCADStoreApi().getState().deleteObject;
    ids.forEach(id => deleteObj(id));
    toast.success(`Deleted ${ids.length} object(s)`);
  };

  const handleJoin = () => {
    useCADStoreApi().getState().executeOperation('join');
  };

  const handleCut = () => {
    useCADStoreApi().getState().executeOperation('cut');
  };

  const handleIntersect = () => {
    useCADStoreApi().getState().executeOperation('intersect');
  };

  const handleMeasure = () => {
    toast("Click two points to measure distance");
    setActiveTool('measure');
  };

  const handleImport = () => {
    importFile();
  };


  const idToOnClickMap: Record<string, () => void> = {
    sketch: handleStartSketch,
    extrusion: () => handleOperation('extrusion'),
    revolve: () => handleOperation('revolve'),
    box: () => handleCreatePrimitive('box'),
    cylinder: () => handleCreatePrimitive('cylinder'),
    sphere: () => handleCreatePrimitive('sphere'),
    torus: () => handleCreatePrimitive('torus'),
    coil: () => handleCreatePrimitive('coil'),
    duplicate: handleDuplicate,
    delete: handleDelete,
    join: handleJoin,
    cut: handleCut,
    intersect: handleIntersect,
    measure: handleMeasure,
    import: handleImport,
    export: exportJSON,
  };

  if (isSketchMode) {
    return (
      <div className="cad-toolbar">
        {/* Tab bar */}
        <div className="flex items-center border-b border-toolbar-border px-2">
          <button
            onClick={() => setActiveToolbar('SOLID')}
            className={`cad-toolbar-tab ${activeToolbarId === 'SOLID' ? 'cad-toolbar-tab-active' : ''}`}
          >
            SOLID
          </button>
          {customToolbars.filter(t => t.id !== 'SOLID').map((toolbar) => (
            <button
              key={toolbar.id}
              onClick={() => setActiveToolbar(toolbar.id)}
              className={`cad-toolbar-tab ${activeToolbarId === toolbar.id ? 'cad-toolbar-tab-active' : ''}`}
            >
              {toolbar.name}
            </button>
          ))}
          <button className="cad-toolbar-tab cad-toolbar-tab-active bg-primary/20 text-primary">
            SKETCH
          </button>
        </div>

        {/* Sketch Tools */}
        <div className="flex items-center py-1 px-1">
          <ToolGroup label="CREATE">
            <ToolButton
              icon={<Minus className="w-5 h-5" />}
              label="Line"
              isActive={activeTool === 'line'}
              onClick={() => handleToolSelect('line')}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<ArrowUpRight className="w-5 h-5" />}
                  label="Arc"
                  isActive={['threePointsArc', 'tangentArc', 'sagittaArc', 'ellipse'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('threePointsArc')}>3-Point Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('tangentArc')}>Tangent Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('sagittaArc')}>Sagitta Arc</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('ellipse')}>Ellipse</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<RectangleHorizontal className="w-5 h-5" />}
                  label="Shape"
                  isActive={['rectangle', 'circle', 'polygon', 'roundedRectangle', 'text'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('rectangle')}>Rectangle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('circle')}>Circle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('roundedRectangle')}>Rounded Rectangle</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('polygon')}>Polygon</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('text')}>Text</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolButton
                  icon={<Spline className="w-5 h-5" />}
                  label="Spline"
                  isActive={['spline', 'bezier', 'smoothSpline'].includes(activeTool)}
                  hasDropdown
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleToolSelect('smoothSpline')}>Smooth Spline</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('bezier')}>Bezier Curve</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToolSelect('spline')}>Point Spline</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ToolButton
              icon={<Crosshair className="w-5 h-5" />}
              label="Point"
              isActive={activeTool === 'sketchPoint'}
              onClick={() => handleToolSelect('sketchPoint')}
            />
          </ToolGroup>

          <ToolGroup label="MODIFY">
            <ToolButton
              icon={<Scissors className="w-5 h-5" />}
              label="Trim"
              isActive={activeTool === 'trim'}
              onClick={() => handleToolSelect('trim')}
            />
            <ToolButton
              icon={<Move className="w-5 h-5" />}
              label="Offset"
              isActive={activeTool === 'offset'}
              onClick={() => handleToolSelect('offset')}
            />
            <ToolButton
              icon={<Scale className="w-5 h-5" />}
              label="Mirror"
              onClick={() => toast("Select objects and then a mirror line")}
            />
          </ToolGroup>

          <ToolGroup label="CONSTRAIN">
            <ToolButton
              icon={<Equal className="w-5 h-5" />}
              label="Equal"
              onClick={() => applyConstraintToSelection('equal')}
            />
            <ToolButton
              icon={<GitCommit className="w-5 h-5" />}
              label="Point"
              onClick={() => applyConstraintToSelection('coincident')}
            />
            <ToolButton
              icon={<ArrowUpLeft className="w-5 h-5" />}
              label="Tanget"
              onClick={() => applyConstraintToSelection('tangent')}
            />
            <ToolButton
              icon={<MoreHorizontal className="w-5 h-5" />}
              label="More"
              hasDropdown
            />
          </ToolGroup>

          <div className="ml-auto flex items-center pr-4">
            <button
              onClick={onFinishSketch}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md shadow-lg hover:bg-primary/90 transition-all font-bold scale-105"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>FINISH SKETCH</span>
            </button>
          </div>
        </div>

        <ExtensionStoreDialog
          open={isExtensionStoreOpen}
          onOpenChange={setIsExtensionStoreOpen}
        />
        <DeveloperFeedbackDialog
          open={isFeedbackOpen}
          onOpenChange={setIsFeedbackOpen}
        />
      </div>
    );
  }

  const activeToolbar = customToolbars.find(t => t.id === activeToolbarId);

  return (
    <div className="cad-toolbar">
      {/* Tab bar */}
      <div className="flex items-center border-b border-toolbar-border px-2">
        {customToolbars.map((toolbar) => (
          <div key={toolbar.id} className="group relative flex items-center">
            {editingToolbarName === toolbar.id ? (
              <Input
                className="h-7 w-24 text-xs py-0 px-1 mx-1"
                value={toolbar.name}
                onChange={(e) => renameCustomToolbar(toolbar.id, e.target.value)}
                onBlur={() => setEditingToolbarName(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingToolbarName(null)}
                autoFocus
              />
            ) : (
              <button
                onClick={() => isEditingToolbar ? setEditingToolbarName(toolbar.id) : setActiveToolbar(toolbar.id)}
                className={`cad-toolbar-tab ${activeToolbarId === toolbar.id ? 'cad-toolbar-tab-active' : ''}`}
              >
                {toolbar.name}
              </button>
            )}
            {isEditingToolbar && activeToolbarId === toolbar.id && toolbar.id !== 'SOLID' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCustomToolbar(toolbar.id);
                }}
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <X className="w-2 h-2" />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={() => {
            const id = addCustomToolbar();
            setActiveToolbar(id);
            setEditingToolbar(true);
          }}
          className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground ml-1"
          title="Add New Toolbox"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setEditingToolbar(!isEditingToolbar)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${isEditingToolbar
              ? 'bg-primary text-primary-foreground shadow-lg scale-105 font-bold'
              : 'hover:bg-muted text-muted-foreground'
              }`}
            title={isEditingToolbar ? "Finish Editing" : "Edit Toolbox"}
          >
            {isEditingToolbar ? (
              <>
                <Check className="w-4 h-4" />
                <span className="text-xs">FINISH TOOLBOX EDITING</span>
              </>
            ) : (
              <Edit2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tool ribbon */}
      <div className="flex items-center py-1 px-1 overflow-x-auto min-h-[72px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeToolbar?.sections.map(s => `section-${s.id}`) || []}
            strategy={horizontalListSortingStrategy}
          >
            {activeToolbar?.sections.map((section) => (
              <SortableSection key={section.id} id={`section-${section.id}`} disabled={!isEditingToolbar}>
                <ToolGroup
                  label={
                    isEditingToolbar ? (
                      editingSectionName === section.id ? (
                        <Input
                          className="h-4 w-20 text-[8px] py-0 px-1 uppercase font-bold text-center bg-transparent border-none"
                          value={section.label}
                          onChange={(e) => renameSection(activeToolbarId!, section.id, e.target.value)}
                          onBlur={() => setEditingSectionName(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingSectionName(null)}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setEditingSectionName(section.id)}
                        >
                          {section.label}
                        </span>
                      )
                    ) : (
                      section.label
                    )
                  }
                >
                  <SortableContext
                    items={section.toolIds.map(toolId => `tool-${toolId}:${section.id}`)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {section.toolIds.map((toolId, idx) => {
                      if (toolId.startsWith('folder:')) {
                        const folderId = toolId.replace('folder:', '');
                        const folder = folders[folderId];
                        if (!folder) return null;
                        return (
                          <SortableTool key={`${toolId}-${idx}`} id={`tool-${toolId}:${section.id}`} disabled={!isEditingToolbar}>
                            <ToolFolderButton
                              folderId={folderId}
                              label={folder.label}
                              iconName={folder.icon}
                              toolIds={folder.toolIds}
                              isEditing={isEditingToolbar}
                              onEdit={() => {
                                setEditingFolderId(folderId);
                                setEditingFolderSectionId(section.id);
                                setIsFolderEditDialogOpen(true);
                              }}
                              onDelete={() => deleteFolder(activeToolbarId!, section.id, folderId)}
                              onSelectTool={(tid) => handleToolSelect(tid as ToolType)}
                              idToIconMap={idToIconMap}
                              idToLabelMap={idToLabelMap}
                              idToOnClickMap={idToOnClickMap}
                              activeTool={activeTool}
                            />
                          </SortableTool>
                        );
                      }

                      return (
                        <SortableTool key={`${toolId}-${idx}`} id={`tool-${toolId}:${section.id}`} disabled={!isEditingToolbar}>
                          <ToolButton
                            icon={idToIconMap[toolId] || <ToolIcon id={toolId} className="w-5 h-5" />}
                            label={toolRegistry.get(toolId)?.metadata.label || (idToLabelMap[toolId] || toolId)}
                            isActive={activeTool === toolId}
                            onClick={() => {
                              if (idToOnClickMap[toolId]) {
                                idToOnClickMap[toolId]();
                              } else {
                                handleToolSelect(toolId as ToolType);
                              }
                            }}
                          />
                          {isEditingToolbar && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeToolFromSection(activeToolbarId!, section.id, idx);
                              }}
                              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/tool:opacity-100 transition-opacity z-10"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          )}
                        </SortableTool>
                      );
                    })}
                  </SortableContext>

                  {isEditingToolbar && (
                    <div className="flex gap-1 ml-1 self-center">
                      <button
                        onClick={() => {
                          setActiveTargetSection(section.id);
                          setAddToolDialogOpen(true);
                        }}
                        className="w-8 h-8 rounded-lg border-2 border-dashed border-muted hover:border-primary transition-colors flex items-center justify-center"
                        title="Add Tool"
                      >
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => addFolder(activeToolbarId!, section.id)}
                        className="w-8 h-8 rounded-lg border-2 border-dashed border-muted hover:border-primary transition-colors flex items-center justify-center"
                        title="Add Folder"
                      >
                        <Icons.FolderPlus className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </ToolGroup>
                {isEditingToolbar && (
                  <button
                    onClick={() => deleteSection(activeToolbarId!, section.id)}
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity hover:bg-destructive hover:text-white z-20"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </SortableSection>
            ))}
          </SortableContext>
        </DndContext>

        {isEditingToolbar && activeToolbarId && (
          <button
            onClick={() => addSection(activeToolbarId)}
            className="flex flex-col items-center justify-center h-12 px-4 border-2 border-dashed border-muted rounded-md hover:border-primary hover:bg-muted/30 transition-all text-muted-foreground hover:text-primary gap-1 ml-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Section</span>
          </button>
        )}

        <div className="ml-auto flex items-center pr-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsFeedbackOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-md hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary border border-transparent hover:border-border/50 group"
                >
                  <MessageSquareWarning className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium uppercase tracking-tight">Feedback</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Report bug or suggest feature</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsExtensionStoreOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-md hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary border border-transparent hover:border-border/50 group"
                >
                  <PackagePlus className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium uppercase tracking-tight">Extensions</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Browse Extension Library</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <ExtensionStoreDialog
        open={isExtensionStoreOpen}
        onOpenChange={setIsExtensionStoreOpen}
      />
      <DeveloperFeedbackDialog
        open={isFeedbackOpen}
        onOpenChange={setIsFeedbackOpen}
      />
      <AddToolDialog
        open={addToolDialogOpen}
        onOpenChange={setAddToolDialogOpen}
        onSelectTool={(toolId) => {
          if (activeToolbarId && activeTargetSection) {
            addToolToSection(activeToolbarId, activeTargetSection, toolId);
          }
        }}
      />
      {editingFolderId && folders[editingFolderId] && (
        <FolderEditDialog
          open={isFolderEditDialogOpen}
          onOpenChange={setIsFolderEditDialogOpen}
          folderId={editingFolderId}
          initialLabel={folders[editingFolderId].label}
          initialIcon={folders[editingFolderId].icon}
          toolIds={folders[editingFolderId].toolIds}
          onSave={(label, icon) => {
            renameFolder(editingFolderId, label);
            updateFolderIcon(editingFolderId, icon);
          }}
          onDelete={() => {
            if (activeToolbarId && editingFolderSectionId) {
              deleteFolder(activeToolbarId, editingFolderSectionId, editingFolderId);
            }
          }}
          onAddTool={(tid) => addToolToFolder(editingFolderId, tid)}
          onRemoveTool={(index) => removeToolFromFolder(editingFolderId, index)}
          onReorderTools={(tids) => reorderToolsInFolder(editingFolderId, tids)}
          idToIconMap={idToIconMap}
          idToLabelMap={idToLabelMap}
        />
      )}
    </div>
  );
};

export default RibbonToolbar;
