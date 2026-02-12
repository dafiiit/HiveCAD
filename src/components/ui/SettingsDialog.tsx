import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Settings as SettingsIcon,
    User,
    Github,
    HelpCircle,
    RefreshCw,
    LogOut,
    Moon,
    Sun,
    Monitor,
    Cloud,
    Keyboard,
    ShieldCheck
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useCADStore } from '@/hooks/useCADStore';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StorageManager } from '@/lib/storage/StorageManager';
import { toast } from 'sonner';
import { isDesktop } from '@/lib/platform/platform';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { theme, setTheme } = useUIStore();
    const { user, logout, setShowPATDialog } = useGlobalStore();
    const { closeProject, snappingEnabled, toggleSnapping } = useCADStore();
    const [isResetting, setIsResetting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [resetStatus, setResetStatus] = useState<string | null>(null);

    const handleCheckAndInstallUpdate = async () => {
        if (!isDesktop()) {
            toast.info('In-app updates are only available in the desktop app.');
            return;
        }

        try {
            setIsUpdating(true);
            const { checkForUpdates, installUpdate } = await import('@/lib/platform/desktop');
            const update = await checkForUpdates();

            if (!update) {
                toast.success('You are on the latest version.');
                return;
            }

            toast.loading(`Installing v${update.version}...`, { id: 'desktop-update' });
            await installUpdate();
            toast.success('Update installed. The app will restart.', { id: 'desktop-update' });
        } catch (error) {
            console.error('Update failed:', error);
            toast.error('Failed to install update. Please try again.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleResetRepository = async () => {
        const confirmed = confirm(
            "Reset all HiveCAD data? This deletes all your projects/extensions in local storage, hivecad-data, and Supabase. This cannot be undone."
        );

        if (!confirmed) {
            return;
        }

        try {
            setIsResetting(true);
            setResetStatus('Starting reset...');
            const mgr = StorageManager.getInstance();
            await mgr.resetAll((status) => setResetStatus(status));

            setResetStatus('Closing current project...');
            await closeProject();

            setResetStatus('Cleaning local UI cache...');
            localStorage.removeItem('hivecad_thumbnails');
            localStorage.removeItem('hivecad_example_opens');
            localStorage.removeItem('hivecad_thumbnails_cache');

            toast.success("All repository and user data has been reset.");
            onOpenChange(false);
        } catch (error) {
            console.error("Reset failed:", error);
            const message = error instanceof Error ? error.message : 'Unknown reset error';
            setResetStatus(`Reset failed: ${message}`);
            toast.error(`Failed to reset repository data: ${message}`);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] h-[600px] p-0 overflow-hidden flex flex-col gap-0 rounded-3xl border-border/40 bg-background/95 backdrop-blur-xl">
                <DialogHeader className="p-6 border-b border-border/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <SettingsIcon className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight">System Settings</DialogTitle>
                            <DialogDescription className="text-muted-foreground/80">
                                Manage your workspace, account, and preferences
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="general" className="flex-1 flex overflow-hidden">
                    <TabsList className="w-56 h-auto flex flex-col items-stretch justify-start bg-muted/20 border-r border-border/10 p-3 space-y-1">
                        <TabsTrigger
                            value="general"
                            className="justify-start gap-3 px-4 py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                        >
                            <Monitor className="w-4 h-4" /> General
                        </TabsTrigger>
                        <TabsTrigger
                            value="account"
                            className="justify-start gap-3 px-4 py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                        >
                            <User className="w-4 h-4" /> Account
                        </TabsTrigger>
                        <TabsTrigger
                            value="help"
                            className="justify-start gap-3 px-4 py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
                        >
                            <HelpCircle className="w-4 h-4" /> Shortcuts & Help
                        </TabsTrigger>
                        <TabsTrigger
                            value="system"
                            className="justify-start gap-3 px-4 py-2.5 rounded-xl data-[state=active]:bg-background data-[state=active]:text-destructive data-[state=active]:shadow-sm transition-all mt-auto"
                        >
                            <RefreshCw className="w-4 h-4" /> System
                        </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="flex-1 p-6">
                        <TabsContent value="general" className="m-0 space-y-6">
                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <Sun className="w-4 h-4" /> Appearance
                                </h3>
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-border/10 hover:bg-muted/30 transition-colors">
                                    <div className="space-y-0.5">
                                        <div className="text-sm font-medium">Dark Mode</div>
                                        <div className="text-xs text-muted-foreground">Switch between light and dark themes</div>
                                    </div>
                                    <button
                                        className="p-1.5 rounded-full hover:bg-background transition-all"
                                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                    >
                                        {theme === 'dark' ? (
                                            <Sun className="w-5 h-5 text-amber-500" />
                                        ) : (
                                            <Moon className="w-5 h-5 text-blue-400" />
                                        )}
                                    </button>
                                </div>
                            </section>
                        </TabsContent>

                        <TabsContent value="account" className="m-0 space-y-6">
                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4" /> Profile Info
                                </h3>
                                <div className="p-4 rounded-2xl bg-muted/20 border border-border/10 space-y-3">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
                                            {user?.email?.[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">{user?.email}</div>
                                            <div className="text-xs text-muted-foreground">Standard License</div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <Github className="w-4 h-4" /> Cloud Storage
                                </h3>
                                <div className="p-4 rounded-2xl bg-muted/20 border border-border/10 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium flex items-center gap-2">
                                            <Cloud className="w-4 h-4 text-blue-500" /> GitHub Backend
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {user?.pat ? "Connected and synced" : "Not configured"}
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); setShowPATDialog(true); }} className="rounded-xl">
                                        Configure
                                    </Button>
                                </div>
                                <Button variant="ghost" onClick={logout} className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl gap-2">
                                    <LogOut className="w-4 h-4" /> Log Out
                                </Button>
                            </section>
                        </TabsContent>

                        <TabsContent value="help" className="m-0 space-y-6">
                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                    <Keyboard className="w-4 h-4" /> Keyboard Shortcuts
                                </h3>
                                <div className="grid gap-2 text-sm bg-muted/10 rounded-2xl border border-border/5 p-4">
                                    <div className="flex justify-between items-center py-1"><span>Command Search</span><kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/20 text-[10px]">Cmd+K</kbd></div>
                                    <Separator className="opacity-10" />
                                    <div className="flex justify-between items-center py-1"><span>Save</span><kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/20 text-[10px]">Ctrl+S</kbd></div>
                                    <Separator className="opacity-10" />
                                    <div className="flex justify-between items-center py-1"><span>Undo</span><kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/20 text-[10px]">Ctrl+Z</kbd></div>
                                    <Separator className="opacity-10" />
                                    <div className="flex justify-between items-center py-1"><span>Redo</span><kbd className="px-1.5 py-0.5 bg-muted rounded border border-border/20 text-[10px]">Ctrl+Y</kbd></div>
                                </div>
                            </section>
                        </TabsContent>

                        <TabsContent value="system" className="m-0 space-y-6">
                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground">CAD Interaction</h3>
                                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-border/10">
                                    <div className="space-y-0.5">
                                        <div className="text-sm font-medium">Grid Snapping</div>
                                        <div className="text-xs text-muted-foreground">Snap sketch input to the active grid</div>
                                    </div>
                                    <Switch checked={snappingEnabled} onCheckedChange={toggleSnapping} />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-muted-foreground">Application Update</h3>
                                <div className="p-4 rounded-2xl bg-muted/20 border border-border/10 space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        Check for a new standalone version and install it directly.
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl gap-2"
                                        onClick={handleCheckAndInstallUpdate}
                                        disabled={isUpdating}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                                        {isUpdating ? 'Updating...' : 'Check for Updates'}
                                    </Button>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h3 className="text-sm font-semibold text-destructive">Advanced Options</h3>
                                <div className="p-5 rounded-2xl border border-destructive/20 bg-destructive/5 space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        Delete all user data across local storage, the hivecad-data GitHub repository, and Supabase metadata.
                                    </p>
                                    <Button
                                        variant="destructive"
                                        className="w-full rounded-xl gap-2 h-11"
                                        onClick={handleResetRepository}
                                        disabled={isResetting}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
                                        {isResetting ? 'Resetting...' : 'Reset Repository & User Data'}
                                    </Button>
                                    {resetStatus && (
                                        <p className="text-xs text-muted-foreground mt-2" role="status" aria-live="polite">
                                            {resetStatus}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-3">
                                        This permanently removes all projects, extension metadata, tags, folders, and votes associated with your account.
                                    </p>
                                </div>
                            </section>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
