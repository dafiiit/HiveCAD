import React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Download } from "lucide-react";
import * as Icons from "lucide-react";
import { LucideProps } from "lucide-react";
import { toast } from "sonner";
import { ExtensionEntry } from "@/lib/storage/types";
import { useGlobalStore } from "@/store/useGlobalStore";
import { StorageManager } from "@/lib/storage/StorageManager";

interface ExtensionCardProps {
    extension: ExtensionEntry;
    onRefresh?: () => void;
}

export const ExtensionCard: React.FC<ExtensionCardProps> = ({ extension, onRefresh }) => {
    const { user } = useGlobalStore();
    const [isTogglingStatus, setIsTogglingStatus] = React.useState(false);
    const [isVoting, setIsVoting] = React.useState(false);
    const [localStats, setLocalStats] = React.useState(extension.stats);

    // Use manifest data if available
    const name = extension.manifest?.name || 'Unknown';
    const description = extension.manifest?.description || '';
    const author = extension.authorEmail;
    const icon = extension.manifest?.icon || 'Package';
    const version = extension.manifest?.version || '1.0.0';
    const isOwnExtension = user?.email === author;

    // Dynamically get the icon component from lucide-react
    const LucideIcon = (Icons[icon as keyof typeof Icons] as React.FC<LucideProps>) || Icons.Package;

    const handleToggleStatus = async () => {
        if (!isOwnExtension) return;

        setIsTogglingStatus(true);
        try {
            const meta = StorageManager.getInstance().supabaseMeta;
            if (meta) {
                const newStatus = extension.status === 'development' ? 'published' : 'development';
                await meta.setExtensionStatus(extension.id, newStatus);
                toast.success(`Extension ${newStatus === 'published' ? 'published' : 'moved to development'}`);
                // Refresh the list
                if (onRefresh) {
                    onRefresh();
                }
            }
        } catch (error) {
            toast.error('Failed to update extension status');
        } finally {
            setIsTogglingStatus(false);
        }
    };

    const handleVote = async (voteType: 'like' | 'dislike') => {
        setIsVoting(true);
        try {
            const meta = StorageManager.getInstance().supabaseMeta;
            if (meta && user?.id) {
                await meta.voteExtension(extension.id, user.id, voteType);

                // Update local stats optimistically
                setLocalStats(prev => ({
                    ...prev,
                    likes: voteType === 'like' ? prev.likes + 1 : prev.likes,
                    dislikes: voteType === 'dislike' ? prev.dislikes + 1 : prev.dislikes,
                }));

                toast.success(voteType === 'like' ? '👍 Liked!' : '👎 Disliked');
            }
        } catch (error) {
            toast.error('Failed to vote');
        } finally {
            setIsVoting(false);
        }
    };

    const handleInstall = async () => {
        try {
            const meta = StorageManager.getInstance().supabaseMeta;
            if (meta) {
                await meta.incrementDownloads(extension.id);

                // Update local stats optimistically
                setLocalStats(prev => ({
                    ...prev,
                    downloads: prev.downloads + 1,
                }));
            }

            toast("Installing Extension", {
                description: `Installing ${name}...`,
            });
        } catch (error) {
            console.error('Failed to increment downloads:', error);
            // Still show the install toast even if download tracking fails
            toast("Installing Extension", {
                description: `Installing ${name}...`,
            });
        }
    };

    return (
        <Card className={`flex flex-col h-full overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 border-border/50 bg-card/50 backdrop-blur-sm rounded-[1.5rem] ${isOwnExtension ? 'ring-2 ring-primary/20' : ''}`}>
            {isOwnExtension && (
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                        <Icons.User size={14} />
                        Created by me
                    </span>
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${extension.status === 'published' ? 'bg-green-500/20 text-green-600' : 'bg-orange-500/20 text-orange-600'}`}>
                            {extension.status}
                        </span>
                        <button
                            onClick={handleToggleStatus}
                            disabled={isTogglingStatus}
                            className="text-[10px] px-2 py-1 rounded-md bg-background/50 hover:bg-background transition-colors font-medium"
                        >
                            {isTogglingStatus ? 'Updating...' : extension.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                    </div>
                </div>
            )}
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 p-5">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <LucideIcon size={24} />
                </div>
                <div className="flex flex-col">
                    <CardTitle className="text-lg leading-none font-bold">{name}</CardTitle>
                    <CardDescription className="text-xs mt-1">by {author}</CardDescription>
                </div>
            </CardHeader>

            <CardContent className="flex-1 px-5 pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {description}
                </p>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 p-5 pt-0">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground bg-muted/30 p-2 rounded-xl">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleVote('like')}
                            disabled={isVoting}
                            className="flex items-center gap-1 hover:text-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ThumbsUp size={12} className="text-green-500" />
                            {localStats.likes}
                        </button>
                        <button
                            onClick={() => handleVote('dislike')}
                            disabled={isVoting}
                            className="flex items-center gap-1 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ThumbsDown size={12} className="text-red-500" />
                            {localStats.dislikes}
                        </button>
                    </div>
                    <span className="flex items-center gap-1">
                        <Download size={12} />
                        {localStats.downloads.toLocaleString()}
                    </span>
                </div>

                <Button
                    onClick={handleInstall}
                    className="w-full rounded-full h-10 font-semibold"
                    variant="secondary"
                >
                    Install tool
                </Button>
            </CardFooter>
        </Card>
    );
};
