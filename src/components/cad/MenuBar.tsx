import { 
  Save, 
  FolderOpen, 
  Undo2, 
  Redo2, 
  RotateCcw,
  Settings,
  HelpCircle,
  User,
  Bell,
  Search
} from "lucide-react";

interface MenuBarProps {
  fileName: string;
  isSaved: boolean;
}

const MenuBar = ({ fileName, isSaved }: MenuBarProps) => {
  return (
    <div className="h-8 bg-background flex items-center justify-between px-2 border-b border-border text-xs">
      {/* Left section - App controls */}
      <div className="flex items-center gap-1">
        <button className="p-1.5 hover:bg-secondary rounded transition-colors">
          <div className="w-4 h-4 grid grid-cols-3 gap-0.5">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-foreground/60 rounded-sm" />
            ))}
          </div>
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Save className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <FolderOpen className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Undo2 className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Redo2 className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Center - File name */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isSaved ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-foreground font-medium">{fileName}</span>
      </div>

      {/* Right section - User controls */}
      <div className="flex items-center gap-1">
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Search className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Bell className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <Settings className="w-4 h-4" />
        </button>
        
        <button className="p-1.5 hover:bg-secondary rounded transition-colors text-icon-default hover:text-icon-hover">
          <HelpCircle className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <button className="w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:opacity-90 transition-opacity">
          <User className="w-4 h-4 text-primary-foreground" />
        </button>
      </div>
    </div>
  );
};

export default MenuBar;
