import { Plus, Minus, Send, Trash2 } from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { useState } from "react";
import { toast } from "sonner";

const CommentsPanel = () => {
  const { 
    commentsExpanded, 
    toggleComments, 
    comments, 
    addComment, 
    deleteComment 
  } = useCADStore();

  const [newComment, setNewComment] = useState("");

  const handleAddComment = () => {
    if (!newComment.trim()) {
      toast.error("Please enter a comment");
      return;
    }
    addComment(newComment.trim());
    setNewComment("");
    toast.success("Comment added");
  };

  const handleDeleteComment = (id: string) => {
    deleteComment(id);
    toast("Comment deleted");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  };

  return (
    <div className="border-t border-border">
      <button
        onClick={toggleComments}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium uppercase tracking-wide bg-panel-header hover:bg-secondary/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          Comments
          {comments.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-2xs">
              {comments.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {commentsExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </span>
        </div>
      </button>

      {commentsExpanded && (
        <div className="p-3 space-y-3 max-h-48 overflow-y-auto">
          {/* Add comment input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className="flex-1 px-2 py-1.5 text-xs bg-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button 
              onClick={handleAddComment}
              className="p-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              title="Add comment"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Comments list */}
          {comments.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              No comments yet. Add one above!
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map(comment => (
                <div 
                  key={comment.id} 
                  className="p-2 bg-secondary/50 rounded group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-xs">{comment.text}</div>
                      <div className="text-2xs text-muted-foreground mt-1">
                        {comment.author} • {new Date(comment.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded transition-all"
                      title="Delete comment"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CommentsPanel;
