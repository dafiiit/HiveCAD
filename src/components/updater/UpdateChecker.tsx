
import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

export function UpdateChecker() {
    const [isOpen, setIsOpen] = useState(false);
    const [update, setUpdate] = useState<Update | null>(null);
    const [isInstalling, setIsInstalling] = useState(false);

    useEffect(() => {
        // Only run in Tauri environment
        // @ts-expect-error - __TAURI_INTERNALS__ is injected by Tauri
        if (!window.__TAURI_INTERNALS__) return;

        const checkForUpdates = async () => {
            // Check if user skipped update this session
            if (sessionStorage.getItem("hivecad_update_skipped")) {
                console.log("Update check skipped due to user preference this session.");
                return;
            }

            try {
                const updateResult = await check();
                if (updateResult && updateResult.available) {
                    setUpdate(updateResult);
                    setIsOpen(true);
                }
            } catch (error) {
                console.error("Failed to check for updates:", error);
            }
        };

        // Check on mount
        checkForUpdates();

        // Check on network reconnect
        const handleOnline = () => checkForUpdates();
        window.addEventListener("online", handleOnline);

        return () => {
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    const handleInstall = async () => {
        if (!update) return;

        setIsInstalling(true);
        try {
            await update.downloadAndInstall();
            // Restart the application
            await relaunch();
        } catch (error) {
            console.error("Failed to install update:", error);
            setIsInstalling(false);
            // Ideally show an error toast here
        }
    };

    const handleSkip = () => {
        sessionStorage.setItem("hivecad_update_skipped", "true");
        setIsOpen(false);
    };

    if (!update) return null;

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Update Available</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <div>
                            A new version of HiveCAD ({update.version}) is available.
                            {update.currentVersion && ` You are currently on v${update.currentVersion}.`}
                        </div>
                        {update.body && (
                            <div className="max-h-40 overflow-y-auto rounded-md bg-muted p-2 text-xs">
                                <p className="font-semibold mb-1">Release Notes:</p>
                                <pre className="whitespace-pre-wrap font-sans">{update.body}</pre>
                            </div>
                        )}
                        <div>Would you like to install it now?</div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleSkip} disabled={isInstalling}>
                        Skip for now
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleInstall} disabled={isInstalling}>
                        {isInstalling ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Installing...
                            </>
                        ) : (
                            "Install & Restart"
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
