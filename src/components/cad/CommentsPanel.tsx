import { Plus, Minus } from "lucide-react";

interface CommentsPanelProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const CommentsPanel = ({ isExpanded, onToggle }: CommentsPanelProps) => {
  return (
    <div className="border-t border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium uppercase tracking-wide bg-panel-header hover:bg-secondary/30 transition-colors"
      >
        <span>Comments</span>
        <div className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 text-xs text-muted-foreground">
          No comments yet. Click + to add a comment.
        </div>
      )}
    </div>
  );
};

export default CommentsPanel;
