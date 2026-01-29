import React from 'react';
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
import { useCADStore } from "@/hooks/useCADStore";
import { AlertTriangle } from "lucide-react";

export const ImportWarningModal = () => {
    const { pendingImport, confirmImport, cancelImport } = useCADStore();

    if (!pendingImport) return null;

    const fileSizeMB = (pendingImport.file.size / 1024 / 1024).toFixed(1);

    return (
        <AlertDialog open={!!pendingImport} onOpenChange={(open) => !open && cancelImport()}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <div className="flex items-center gap-3 mb-2 text-amber-500">
                        <AlertTriangle className="w-6 h-6" />
                        <AlertDialogTitle>Large File Warning</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-foreground/80">
                        The file <span className="font-semibold text-foreground">"{pendingImport.file.name}"</span> is quite large ({fileSizeMB}MB).
                        Importing and processing large CAD files can cause the application to slow down or even crash during the mesh generation phase.
                        <br /><br />
                        Are you sure you want to continue?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-6">
                    <AlertDialogCancel onClick={cancelImport}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmImport}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        Continue Import
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
