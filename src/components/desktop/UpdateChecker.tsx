/**
 * UpdateChecker - Desktop-only component for in-app updates
 * 
 * Shows a notification when updates are available and allows
 * users to install them directly from the app.
 */

import { useEffect, useState } from 'react';
import { isDesktop } from '@/lib/platform/platform';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface UpdateInfo {
    version: string;
    currentVersion: string;
    body?: string;
    date?: string;
}

export function UpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);
    const [showDialog, setShowDialog] = useState(false);

    useEffect(() => {
        // Only run on desktop
        if (!isDesktop()) return;

        const checkForUpdates = async () => {
            try {
                const { checkForUpdates: check } = await import('@/lib/platform/desktop');
                const update = await check();
                if (update) {
                    setUpdateAvailable(update);
                    toast.info(`Update v${update.version} available`, {
                        action: {
                            label: 'View',
                            onClick: () => setShowDialog(true),
                        },
                    });
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        };

        // Check on mount and every hour
        checkForUpdates();
        const interval = setInterval(checkForUpdates, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    const handleInstall = async () => {
        if (!updateAvailable) return;

        setIsInstalling(true);
        try {
            const { installUpdate } = await import('@/lib/platform/desktop');
            toast.loading('Downloading update...');
            await installUpdate();
            toast.success('Update installed! The app will restart.');
        } catch (error) {
            console.error('Failed to install update:', error);
            toast.error('Failed to install update. Please try again.');
        } finally {
            setIsInstalling(false);
            setShowDialog(false);
        }
    };

    // Don't render on web
    if (!isDesktop() || !updateAvailable) return null;

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDialog(true)}
                className="text-yellow-500 hover:text-yellow-400"
            >
                <Download className="h-4 w-4 mr-2" />
                Update Available
            </Button>

            <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Update Available</AlertDialogTitle>
                        <AlertDialogDescription>
                            <div className="space-y-2">
                                <p>
                                    A new version of HiveCAD is available: <strong>v{updateAvailable.version}</strong>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Current version: v{updateAvailable.currentVersion}
                                </p>
                                {updateAvailable.body && (
                                    <div className="mt-4 p-3 bg-muted rounded-md text-sm">
                                        <p className="font-medium mb-2">What's new:</p>
                                        <p className="whitespace-pre-wrap">{updateAvailable.body}</p>
                                    </div>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isInstalling}>Later</AlertDialogCancel>
                        <AlertDialogAction onClick={handleInstall} disabled={isInstalling}>
                            {isInstalling ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Installing...
                                </>
                            ) : (
                                <>
                                    <Download className="h-4 w-4 mr-2" />
                                    Install Update
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
