import { Plus, Minus, Send, Trash2, MessageSquare } from "lucide-react";
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
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border bg-muted/20">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Comments
        </h3>
        <p className="text-2xs text-muted-foreground">
          Project discussions and notes
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Comments list */}
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs">No comments yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map(comment => (
              <div
                key={comment.id}
                className="p-3 bg-secondary/50 rounded-lg group border border-transparent hover:border-border transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-xs leading-relaxed">{comment.text}</div>
                    <div className="text-2xs text-muted-foreground mt-2 flex items-center gap-2">
                      <span className="font-medium text-foreground">{comment.author}</span>
                      <span>•</span>
                      <span>{new Date(comment.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add comment input */}
      <div className="p-3 bg-transparent">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a comment..."
            className="flex-1 px-3 py-2 text-xs bg-secondary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
          <button
            onClick={handleAddComment}
            className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm"
            title="Send"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentsPanel;
