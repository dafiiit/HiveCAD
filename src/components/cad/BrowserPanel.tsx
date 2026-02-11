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
  Trash2,
  Edit3
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
    setSketchPlane,
    originVisible,
    setOriginVisibility,
    axesVisible,
    setAxesVisibility,
    sketchesVisible,
    setSketchesVisibility,
    bodiesVisible,
    setBodiesVisibility,
    planeVisibility,
    setPlaneVisibility,
    sketches,
    editSketch,
    deleteSketch: deleteSketchPersistent,
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
    if (id === 'origin') {
      setOriginVisibility(!originVisible);
      return;
    }
    if (id === 'axes') {
      setAxesVisibility(!axesVisible);
      return;
    }
    if (id === 'sketches') {
      setSketchesVisibility(!sketchesVisible);
      return;
    }
    if (id === 'bodies') {
      setBodiesVisibility(!bodiesVisible);
      return;
    }

    if (id === 'XY' || id === 'XZ' || id === 'YZ') {
      const isVisible = planeVisibility[id];
      setPlaneVisibility(id, !isVisible);
      if (!isVisible && isSketchMode && sketchStep === 'select-plane') {
        setSketchPlane(id);
      }
      return;
    }

    // Toggle individual object visibility
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

  return (
    <div className="flex flex-col h-full w-full">

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


          <TreeItem
            icon={<Crosshair className="w-3.5 h-3.5" />}
            label="Origin"
            level={1}
            isExpanded={expandedItems.has("origin")}
            isVisible={originVisible}
            hasChildren
            onToggleExpand={() => toggleExpand("origin")}
            onToggleVisibility={() => toggleVisibility("origin")}
          >
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Top (XY)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'XY'}
              isVisible={planeVisibility['XY']}
              onClick={() => handlePlaneClick('XY')}
              onToggleVisibility={() => toggleVisibility('XY')}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Front (XZ)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'XZ'}
              isVisible={planeVisibility['XZ']}
              onClick={() => handlePlaneClick('XZ')}
              onToggleVisibility={() => toggleVisibility('XZ')}
            />
            <TreeItem
              icon={<Box className="w-3.5 h-3.5" />}
              label="Right (YZ)"
              level={2}
              isSelected={isSketchMode && sketchPlane === 'YZ'}
              isVisible={planeVisibility['YZ']}
              onClick={() => handlePlaneClick('YZ')}
              onToggleVisibility={() => toggleVisibility('YZ')}
            />
            {/* Origin Axes - Flattened */}
            {objects.filter(o => o.type === 'datumAxis').map(obj => (
              <TreeItem
                key={obj.id}
                icon={<Ruler className="w-3.5 h-3.5" />}
                label={obj.name}
                level={2}
                isVisible={obj.visible}
                isSelected={selectedIds.has(obj.id)}
                onClick={() => !isSketchMode && handleObjectClick(obj.id)}
                onToggleVisibility={() => toggleVisibility(obj.id)}
              />
            ))}
          </TreeItem>

          <TreeItem
            icon={expandedItems.has("sketches") ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderClosed className="w-3.5 h-3.5" />}
            label={`Sketches (${Math.max(objects.filter(o => o.type === 'sketch').length, sketches.size)})`}
            level={1}
            isExpanded={expandedItems.has("sketches")}
            isVisible={sketchesVisible}
            hasChildren
            onToggleExpand={() => toggleExpand("sketches")}
            onToggleVisibility={() => toggleVisibility("sketches")}
          >
            {/* Persistent sketches (editable) */}
            {Array.from(sketches.values()).map(sketch => {
              const matchingObj = objects.find(o => o.type === 'sketch' && o.id === sketch.featureId);
              return (
                <div key={sketch.id} className="group relative">
                  <TreeItem
                    icon={<Pencil className="w-3.5 h-3.5" />}
                    label={sketch.name}
                    level={2}
                    isVisible={matchingObj ? matchingObj.visible : true}
                    isSelected={matchingObj ? selectedIds.has(matchingObj.id) : false}
                    onClick={() => {
                      if (matchingObj) handleObjectClick(matchingObj.id);
                      else toast(`${sketch.name} — ${sketch.entities.length} entities`);
                    }}
                    onToggleVisibility={matchingObj ? () => toggleVisibility(matchingObj.id) : undefined}
                    onDelete={() => {
                      deleteSketchPersistent(sketch.id);
                      if (matchingObj) deleteObject(matchingObj.id);
                      toast(`Deleted: ${sketch.name}`);
                    }}
                  />
                  {/* Edit button overlay */}
                  {!isSketchMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editSketch(sketch.id);
                        toast.success(`Editing: ${sketch.name}`);
                      }}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
                      title="Edit sketch"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {/* Orphan sketch objects (no persistent data) */}
            {objects.filter(o => o.type === 'sketch' && !Array.from(sketches.values()).some(s => s.featureId === o.id)).map(obj => (
              <TreeItem
                key={obj.id}
                icon={<Pencil className="w-3.5 h-3.5" />}
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

          {/* Bodies - dynamically populated */}
          <TreeItem
            icon={expandedItems.has("bodies") ? <FolderOpen className="w-3.5 h-3.5" /> : <FolderClosed className="w-3.5 h-3.5" />}
            label={`Bodies (${objects.filter(o => o.type !== 'sketch' && o.type !== 'datumAxis').length})`}
            level={1}
            hasChildren
            isExpanded={expandedItems.has("bodies")}
            isVisible={bodiesVisible}
            onToggleExpand={() => toggleExpand("bodies")}
            onToggleVisibility={() => toggleVisibility("bodies")}
          >
            {objects.filter(o => o.type !== 'sketch' && o.type !== 'datumAxis').map(obj => (
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
