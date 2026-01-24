import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Settings,
  Ruler,
  Box,
  Eye,
  EyeOff,
  Layers,
  Crosshair,
  Pencil,
  FolderClosed,
  FolderOpen,
  Minus,
  Trash2
} from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";

interface TreeItemProps {
  icon: React.ReactNode;
  label: string;
  level?: number;
  isExpanded?: boolean;
  isVisible?: boolean;
  isSelected?: boolean;
  hasChildren?: boolean;
  onToggleExpand?: () => void;
  onToggleVisibility?: () => void;
  onClick?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode;
}

const TreeItem = ({
  icon,
  label,
  level = 0,
  isExpanded,
  isVisible = true,
  isSelected = false,
  hasChildren,
  onToggleExpand,
  onToggleVisibility,
  onClick,
  onDelete,
  children
}: TreeItemProps) => {
  return (
    <div>
      <div
        className={`cad-tree-item group ${isSelected ? 'bg-primary/20 text-primary' : ''}`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={onClick}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
            className="p-0.5 hover:bg-secondary rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {onToggleVisibility && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
            className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isVisible ? (
              <Eye className="w-3 h-3 text-muted-foreground" />
            ) : (
              <EyeOff className="w-3 h-3 text-muted-foreground/50" />
            )}
          </button>
        )}

        <span className="text-icon-default">{icon}</span>
        <span className={`flex-1 truncate ${!isVisible ? 'opacity-50' : ''}`}>{label}</span>

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {isExpanded && children}
    </div>
  );
};

const BrowserPanel = () => {
  const {
    objects,
    selectedIds,
    selectObject,
    updateObject,
    deleteObject,
    fileName,
    isSaved,
    enterSketchMode,
    isSketchMode,
    sketchStep,
    sketchPlane,
    setSketchPlane
  } = useCADStore();

  const planeLabels: Record<string, string> = {
    'XY': 'Top',
    'XZ': 'Front',
    'YZ': 'Right'
  };

  const handlePlaneClick = (plane: 'XY' | 'XZ' | 'YZ') => {
    if (isSketchMode && sketchStep === 'select-plane') {
      setSketchPlane(plane);
      toast.success(`Sketch plane set to ${planeLabels[plane]} (${plane})`);
    } else if (isSketchMode) {
      toast(`Sketch plane is already ${planeLabels[plane]}`);
    } else {
      toast(`${planeLabels[plane]} Plane selected`);
    }
  };

  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(["document", "doc-settings", "origin", "sketches", "bodies"])
  );
  const [visibleItems, setVisibleItems] = useState<Set<string>>(
    new Set(["origin", "sketches", "bodies"])
  );
  const [collapsed, setCollapsed] = useState(false);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const toggleVisibility = (id: string) => {
    const newVisible = new Set(visibleItems);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisibleItems(newVisible);

    // Also toggle object visibility if it's a CAD object
    const obj = objects.find(o => o.id === id);
    if (obj) {
      updateObject(id, { visible: !obj.visible });
      toast(`${obj.name}: ${obj.visible ? 'hidden' : 'visible'}`);
    }
  };

  const handleObjectClick = (id: string) => {
    selectObject(id);
    const obj = objects.find(o => o.id === id);
    if (obj) {
      toast(`Selected: ${obj.name}`);
    }
  };

  const handleObjectDelete = (id: string) => {
    const obj = objects.find(o => o.id === id);
    if (obj) {
      deleteObject(id);
      toast(`Deleted: ${obj.name}`);
    }
  };

  const handleStartSketch = () => {
    enterSketchMode();
    toast.success("Sketch mode activated");
  };

  const handleCollapse = () => {
    setCollapsed(!collapsed);
  };

  if (collapsed) {
    return (
      <div className="w-8 bg-panel border-r border-border flex flex-col items-center py-2">
        <button
          onClick={handleCollapse}
          className="p-1.5 hover:bg-secondary rounded"
          title="Expand Browser"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="cad-panel w-56 flex flex-col h-full">
      <div className="cad-panel-header">
        <span>Browser</span>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={handleCollapse}
          title="Collapse panel"
        >
          <Minus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {/* Document */}
        <TreeItem
          icon={<File className="w-3.5 h-3.5" />}
          label={`${fileName}${!isSaved ? '*' : ''}`}
          isExpanded={expandedItems.has("document")}
          hasChildren
          onToggleExpand={() => toggleExpand("document")}
        >
          {/* Document Settings */}
          <TreeItem
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Document Settings"
            level={1}
            isExpanded={expandedItems.has("doc-settings")}
            hasChildren
            onToggleExpand={() => toggleExpand("doc-settings")}
          >
            <TreeItem
              icon={<Ruler className="w-3.5 h-3.5" />}
              label="Units: mm, g"
              level={2}
              onClick={() => toast("Units configuration")}
            />
            <TreeItem
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Hybrid Construction"
              level={2}
              onClick={() => toast("Construction settings")}
            />
          </TreeItem>

          {/* Named Views */}
          <TreeItem
            icon={expandedItems.has("views") ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderClosed className="w-3.5 h-3.5" />}
            label="Named Views"
            level={1}
            hasChildren
            isExpanded={expandedItems.has("views")}
            onToggleExpand={() => toggleExpand("views")}
          />

          {/* Origin */}
          <TreeItem
            icon={<Crosshair className="w-3.5 h-3.5" />}
            label="Origin"
            level={1}
            isExpanded={expandedItems.has("origin")}
            isVisible={visibleItems.has("origin")}
            hasChildren
            onToggleExpand={() => toggleExpand("origin")}
            onToggleVisibility={() => toggleVisibility("origin")}
          >
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Top (XY)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'XY'}
              onClick={() => handlePlaneClick('XY')}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Front (XZ)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'XZ'}
              onClick={() => handlePlaneClick('XZ')}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Right (YZ)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'YZ'}
              onClick={() => handlePlaneClick('YZ')}
            />
          </TreeItem>

          {/* Sketches */}
          <TreeItem
            icon={expandedItems.has("sketches") ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderClosed className="w-3.5 h-3.5" />}
            label="Sketches"
            level={1}
            isExpanded={expandedItems.has("sketches")}
            isVisible={visibleItems.has("sketches")}
            hasChildren
            onToggleExpand={() => toggleExpand("sketches")}
            onToggleVisibility={() => toggleVisibility("sketches")}
          >
            <TreeItem
              icon={<Pencil className="w-3.5 h-3.5" />}
              label="New Sketch..."
              level={2}
              onClick={handleStartSketch}
            />
          </TreeItem>

          {/* Bodies - dynamically populated */}
          <TreeItem
            icon={expandedItems.has("bodies") ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderClosed className="w-3.5 h-3.5" />}
            label={`Bodies (${objects.length})`}
            level={1}
            hasChildren={objects.length > 0}
            isExpanded={expandedItems.has("bodies")}
            isVisible={visibleItems.has("bodies")}
            onToggleExpand={() => toggleExpand("bodies")}
            onToggleVisibility={() => toggleVisibility("bodies")}
          >
            {objects.map(obj => (
              <TreeItem
                key={obj.id}
                icon={<Box className="w-3.5 h-3.5" />}
                label={obj.name}
                level={2}
                isVisible={obj.visible}
                isSelected={selectedIds.has(obj.id)}
                onClick={() => handleObjectClick(obj.id)}
                onToggleVisibility={() => toggleVisibility(obj.id)}
                onDelete={() => handleObjectDelete(obj.id)}
              />
            ))}
          </TreeItem>
        </TreeItem>
      </div>
    </div>
  );
};

export default BrowserPanel;
