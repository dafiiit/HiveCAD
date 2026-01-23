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
  Minus
} from "lucide-react";

interface TreeItemProps {
  icon: React.ReactNode;
  label: string;
  level?: number;
  isExpanded?: boolean;
  isVisible?: boolean;
  hasChildren?: boolean;
  onToggleExpand?: () => void;
  onToggleVisibility?: () => void;
  children?: React.ReactNode;
}

const TreeItem = ({
  icon,
  label,
  level = 0,
  isExpanded,
  isVisible = true,
  hasChildren,
  onToggleExpand,
  onToggleVisibility,
  children
}: TreeItemProps) => {
  return (
    <div>
      <div 
        className="cad-tree-item group"
        style={{ paddingLeft: `${8 + level * 16}px` }}
      >
        {hasChildren ? (
          <button onClick={onToggleExpand} className="p-0.5 hover:bg-secondary rounded">
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
            onClick={onToggleVisibility}
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
      </div>
      {isExpanded && children}
    </div>
  );
};

const BrowserPanel = () => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(["document", "doc-settings", "origin", "sketches"])
  );
  const [visibleItems, setVisibleItems] = useState<Set<string>>(
    new Set(["origin", "sketches", "sketch1"])
  );

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
  };

  return (
    <div className="cad-panel w-56 flex flex-col h-full">
      <div className="cad-panel-header">
        <span>Browser</span>
        <button className="text-muted-foreground hover:text-foreground">
          <Minus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {/* Document */}
        <TreeItem
          icon={<File className="w-3.5 h-3.5" />}
          label="(Unsaved)"
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
            />
            <TreeItem
              icon={<Layers className="w-3.5 h-3.5" />}
              label="Hybrid Construction"
              level={2}
            />
          </TreeItem>

          {/* Named Views */}
          <TreeItem
            icon={<FolderClosed className="w-3.5 h-3.5" />}
            label="Named Views"
            level={1}
            hasChildren
            isExpanded={false}
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
              label="XY Plane"
              level={2}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="XZ Plane"
              level={2}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="YZ Plane"
              level={2}
            />
          </TreeItem>

          {/* Sketches */}
          <TreeItem
            icon={<FolderOpen className="w-3.5 h-3.5" />}
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
              label="Sketch1"
              level={2}
              isVisible={visibleItems.has("sketch1")}
              onToggleVisibility={() => toggleVisibility("sketch1")}
            />
          </TreeItem>

          {/* Bodies */}
          <TreeItem
            icon={<FolderClosed className="w-3.5 h-3.5" />}
            label="Bodies"
            level={1}
            hasChildren
            isExpanded={false}
            onToggleExpand={() => toggleExpand("bodies")}
          />
        </TreeItem>
      </div>
    </div>
  );
};

export default BrowserPanel;
