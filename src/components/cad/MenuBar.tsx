import {
  FolderOpen,
  Undo2,
  Redo2,
  Settings,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  Search
} from "lucide-react";
import { useCADStore, useCADStoreApi } from "@/hooks/useCADStore";
import { useUIStore } from "@/store/useUIStore";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTabManager } from "@/components/layout/TabContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CloudConnectionsDialog } from "@/components/ui/CloudConnectionsDialog";
import { useEffect, useState } from "react";
import { SettingsDialog } from "@/components/ui/SettingsDialog";
import { Input } from "@/components/ui/input";
import { FileManagerDialog } from "./FileManagerDialog";


interface MenuBarProps {
  fileName: string;
  isSaved: boolean;
}

const MenuBar = ({ fileName, isSaved }: MenuBarProps) => {
  const {
    syncToCloud,
    open,
    undo,
    redo,
    reset,
    history,
    historyIndex,
    searchOpen,
    settingsOpen,
    helpOpen,
    notificationsOpen,
    toggleSearch,
    toggleSettings,
    toggleHelp,
    toggleNotifications,
    objects,
    isSaving,
    pendingSave,
    lastSaveError,
    setCode,
    setFileName,
    runCode,
    isSketchMode,
    activeSketchPrimitives,
    sketchRedoPrimitives,
    undoLastPrimitive,
    redoLastPrimitive,
  } = useCADStore();

  const { theme, setTheme } = useUIStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Alias for backward compatibility if needed, though we should use syncToCloud
  const save = syncToCloud;

  const { activeTabId, closeTab, tabs, switchToTab, createNewTab } = useTabManager();
  const { user } = useGlobalStore();

  const [cloudConnectionsOpen, setCloudConnectionsOpen] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");

  const handleNameSubmit = () => {
    if (tempName.trim() && tempName !== fileName) {
      setFileName(tempName);
      toast.success(`Renamed to ${tempName}`);
    }
    setIsEditingName(false);
  };

  const handleManualSave = async () => {
    if (!user?.pat) {
      setCloudConnectionsOpen(true);
      return;
    }
    await save(true);
  };

  const handleOpen = () => {
    setFileManagerOpen(true);
  };

  const handleUndo = () => {
    if (isSketchMode) {
      if (activeSketchPrimitives.length === 0) {
        toast.error("Nothing to undo");
        return;
      }
      undoLastPrimitive();
      toast("Undo sketch step");
      return;
    }

    if (historyIndex <= 0) {
      toast.error("Nothing to undo");
      return;
    }
    undo();
    toast(`Undo: ${history[historyIndex]?.name || 'action'}`);
  };

  const handleRedo = () => {
    if (isSketchMode) {
      if (sketchRedoPrimitives.length === 0) {
        toast.error("Nothing to redo");
        return;
      }
      redoLastPrimitive();
      toast("Redo sketch step");
      return;
    }

    if (historyIndex >= history.length - 1) {
      toast.error("Nothing to redo");
      return;
    }
    redo();
    toast(`Redo: ${history[historyIndex + 1]?.name || 'action'}`);
  };

  const handleReset = () => {
    if (objects.length > 0) {
      if (confirm("Are you sure you want to reset? All unsaved changes will be lost.")) {
        reset();
        toast("Project reset");
      }
    } else {
      toast("Nothing to reset");
    }
  };



  // Shortcut handler for Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save, user?.pat, handleManualSave]);


  return (
    <>
      <CloudConnectionsDialog
        open={cloudConnectionsOpen}
        onOpenChange={setCloudConnectionsOpen}
      />

      <FileManagerDialog
        open={fileManagerOpen}
        onOpenChange={setFileManagerOpen}
      />

      <div className="h-10 bg-background flex items-center justify-between px-2 text-xs relative z-30">
        {/* Left section - App controls - Vertically Centered */}
        <div className="flex items-center gap-1 h-full">
          <button
            className="p-1 rounded transition-colors flex items-center justify-center hover:bg-secondary"
            onClick={() => closeTab(activeTabId)}
            title="Back to Dashboard"
          >
            <img src="/favicon.ico" alt="HiveCAD Logo" className="w-5 h-5" />
          </button>

          <button
            className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover group relative"
            onClick={handleManualSave}
            title={!user?.pat ? "GitHub Sync Disabled - Click to link" : (isSaving ? "Saving..." : (pendingSave ? "Save Pending..." : (isSaved ? "Saved to Cloud" : "Unsaved Changes - Click to sync")))}
          >
            <RefreshCw className={cn(
              "w-4 h-4 transition-all",
              !isSaved && user?.pat && !isSaving && 'text-yellow-500 animate-pulse',
              isSaving && 'animate-spin text-primary',
              !user?.pat && 'text-muted-foreground/50'
            )} />
            {!user?.pat && (
              <div className="absolute -top-1 -right-1">
                <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />
              </div>
            )}
            {lastSaveError && (
              <div className="absolute -top-1 -right-1">
                <AlertCircle className="w-3 h-3 text-red-500" />
              </div>
            )}
          </button>

          <button
            className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover"
            onClick={handleOpen}
            title="File Management"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${(isSketchMode ? activeSketchPrimitives.length > 0 : historyIndex > 0) ? 'text-icon-default hover:text-icon-hover' : 'text-muted-foreground/50'}`}
            onClick={handleUndo}
            disabled={isSketchMode ? activeSketchPrimitives.length === 0 : historyIndex <= 0}
            title={isSketchMode ? (activeSketchPrimitives.length > 0 ? "Undo sketch step (Ctrl+Z)" : "Nothing to undo") : (historyIndex > 0 ? `Undo ${history[historyIndex]?.name || ''} (Ctrl+Z)` : "Nothing to undo")}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${(isSketchMode ? sketchRedoPrimitives.length > 0 : historyIndex < history.length - 1) ? 'text-icon-default hover:text-icon-hover' : 'text-muted-foreground/50'}`}
            onClick={handleRedo}
            disabled={isSketchMode ? sketchRedoPrimitives.length === 0 : historyIndex >= history.length - 1}
            title={isSketchMode ? (sketchRedoPrimitives.length > 0 ? "Redo sketch step (Ctrl+Y)" : "Nothing to redo") : (historyIndex < history.length - 1 ? `Redo ${history[historyIndex + 1]?.name || ''} (Ctrl+Y)` : "Nothing to redo")}
          >
            <Redo2 className="w-4 h-4" />
          </button>


        </div>

        {/* Center - Tabs */}
        <div className="flex-1 flex items-end justify-center h-full gap-1 overflow-x-auto px-4 pb-[1px]">
          {tabs.filter(t => t.type !== 'dashboard').map((tab, index, array) => {
            const isActive = activeTabId === tab.id;

            return (
              <div key={tab.id} className="flex items-center">
                {/* Divider before tab if not first and previous was not active (to avoid double dividers or clash with active tab) */}
                {index > 0 && activeTabId !== array[index - 1].id && !isActive && (
                  <div className="w-px h-4 bg-border mr-1" />
                )}

                <div
                  onClick={() => switchToTab(tab.id)}
                  className={cn(
                    "group relative flex items-center justify-center gap-2 px-4 py-1.5 min-w-[180px] h-[34px] text-[13px] cursor-pointer select-none transition-all",
                    isActive
                      ? "bg-toolbar text-foreground rounded-t-2xl rounded-b-xl z-20 translate-y-[2px]"
                      : "bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground rounded-2xl"
                  )}
                >
                  {/* Sticky fillets - always rendered but hidden when inactive to prevent layout thrashing */}
                  <div className={cn("absolute -left-[14px] bottom-0 w-4 h-4 bg-[radial-gradient(circle_at_0_0,transparent_14px,hsl(var(--toolbar-bg))_14.5px)] pointer-events-none transition-opacity duration-200", isActive ? "opacity-100" : "opacity-0")} />
                  <div className={cn("absolute -right-[14px] bottom-0 w-4 h-4 bg-[radial-gradient(circle_at_100%_0,transparent_14px,hsl(var(--toolbar-bg))_14.5px)] pointer-events-none transition-opacity duration-200", isActive ? "opacity-100" : "opacity-0")} />

                  {/* Gap fillers */}
                  <div className={cn("absolute left-0 bottom-0 w-4 h-2 bg-toolbar -z-10 rounded-bl-xl transition-opacity duration-200", isActive ? "opacity-100" : "opacity-0")} />
                  <div className={cn("absolute right-0 bottom-0 w-4 h-2 bg-toolbar -z-10 rounded-br-xl transition-opacity duration-200", isActive ? "opacity-100" : "opacity-0")} />

                  {!isEditingName || !isActive ? (
                    <span
                      className="truncate font-medium flex-1 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) {
                          setTempName(fileName);
                          setIsEditingName(true);
                        } else {
                          switchToTab(tab.id);
                        }
                      }}
                      title={isActive ? "Click to rename" : tab.title}
                    >
                      {isActive ? fileName : tab.title}
                      {isActive && !isSaved && '*'}
                    </span>
                  ) : (
                    <Input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onBlur={handleNameSubmit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNameSubmit();
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      className="h-6 w-full text-xs p-1 text-center"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className={cn(
                      "p-0.5 rounded-full hover:bg-zinc-700/50 text-muted-foreground/60 hover:text-foreground transition-opacity absolute right-2"
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="w-px h-4 bg-border mx-1 self-center mb-1" />

          <button
            onClick={createNewTab}
            className="p-1.5 mb-1.5 ml-1 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title="New Tab"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Right section - Unified Settings - Vertically Centered */}
        <div className="flex items-center gap-1 h-full pr-1">
          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${searchOpen ? 'bg-secondary text-foreground' : 'text-icon-default hover:text-icon-hover'}`}
            onClick={toggleSearch}
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <SettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />
        </div>
      </div>


    </>
  );
};

export default MenuBar;
