import {
  FolderOpen,
  Undo2,
  Redo2,
  RotateCcw,
  Settings,
  HelpCircle,
  User,
  Bell,
  Search,
  RefreshCw,
  AlertCircle,
  Home,
  Box,
  Plus,
  X
} from "lucide-react";
import { useCADStore, useCADStoreApi } from "@/hooks/useCADStore";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTabManager } from "@/components/layout/TabContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CloudConnectionsDialog } from "@/components/ui/CloudConnectionsDialog";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    runCode
  } = useCADStore();

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
    if (historyIndex <= 0) {
      toast.error("Nothing to undo");
      return;
    }
    undo();
    toast(`Undo: ${history[historyIndex]?.name || 'action'}`);
  };

  const handleRedo = () => {
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
        {/* Bottom border line that runs across but is redundant if we want fusion (kept for non-tab areas) */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-toolbar-border z-0" />

        {/* Left section - App controls - Vertically Centered */}
        <div className="flex items-center gap-1 h-full">
          <button
            className="p-1 rounded transition-colors flex items-center justify-center cursor-default"
            // todo:refine Restore app menu action or remove the disabled control entirely.
            // Disabled for now - use tab close button (X) instead
            title="HiveCAD"
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
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${historyIndex > 0 ? 'text-icon-default hover:text-icon-hover' : 'text-muted-foreground/50'}`}
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title={historyIndex > 0 ? `Undo ${history[historyIndex]?.name || ''} (Ctrl+Z)` : "Nothing to undo"}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${historyIndex < history.length - 1 ? 'text-icon-default hover:text-icon-hover' : 'text-muted-foreground/50'}`}
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            title={historyIndex < history.length - 1 ? `Redo ${history[historyIndex + 1]?.name || ''} (Ctrl+Y)` : "Nothing to redo"}
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

        {/* Right section - User controls - Vertically Centered */}
        <div className="flex items-center gap-1 h-full">
          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${searchOpen ? 'bg-secondary text-foreground' : 'text-icon-default hover:text-icon-hover'}`}
            onClick={toggleSearch}
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors relative ${notificationsOpen ? 'bg-secondary text-foreground' : 'text-icon-default hover:text-icon-hover'}`}
            onClick={toggleNotifications}
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${settingsOpen ? 'bg-secondary text-foreground' : 'text-icon-default hover:text-icon-hover'}`}
            onClick={toggleSettings}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            className={`p-1.5 hover:bg-secondary rounded transition-colors ${helpOpen ? 'bg-secondary text-foreground' : 'text-icon-default hover:text-icon-hover'}`}
            onClick={toggleHelp}
            title="Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            className="w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity"
            onClick={() => toast("User profile")}
          >
            <User className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>


      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={toggleSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Configure your CAD workspace
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Grid Snap</span>
              <input type="checkbox" className="toggle" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Auto-save</span>
              <input type="checkbox" className="toggle" defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Dark Mode</span>
              <input type="checkbox" className="toggle" defaultChecked />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={toggleHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Quick reference for common actions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 text-sm">
            <div className="flex justify-between font-medium text-primary mb-2"><span>Command Search</span><kbd className="px-2 py-1 bg-primary/20 text-primary rounded">Cmd+K</kbd></div>
            <div className="flex justify-between"><span>Save</span><kbd className="px-2 py-1 bg-secondary rounded">Ctrl+S</kbd></div>
            <div className="flex justify-between"><span>Undo</span><kbd className="px-2 py-1 bg-secondary rounded">Ctrl+Z</kbd></div>
            <div className="flex justify-between"><span>Redo</span><kbd className="px-2 py-1 bg-secondary rounded">Ctrl+Y</kbd></div>
            <div className="flex justify-between"><span>Delete</span><kbd className="px-2 py-1 bg-secondary rounded">Delete</kbd></div>
            <div className="flex justify-between"><span>Duplicate</span><kbd className="px-2 py-1 bg-secondary rounded">Ctrl+D</kbd></div>
            <div className="flex justify-between"><span>Select All</span><kbd className="px-2 py-1 bg-secondary rounded">Ctrl+A</kbd></div>
            <div className="flex justify-between"><span>Orbit View</span><kbd className="px-2 py-1 bg-secondary rounded">Middle Mouse</kbd></div>
            <div className="flex justify-between"><span>Pan View</span><kbd className="px-2 py-1 bg-secondary rounded">Shift+Middle Mouse</kbd></div>
            <div className="flex justify-between"><span>Zoom</span><kbd className="px-2 py-1 bg-secondary rounded">Scroll Wheel</kbd></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notifications Dialog */}
      <Dialog open={notificationsOpen} onOpenChange={toggleNotifications}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>
              Recent activity and alerts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-sm font-medium">Welcome to CAD Editor</div>
              <div className="text-xs text-muted-foreground">Start creating by clicking tools in the toolbar</div>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-sm font-medium">Auto-save enabled</div>
              <div className="text-xs text-muted-foreground">Your work will be saved automatically</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MenuBar;
