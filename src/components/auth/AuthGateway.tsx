import React, { useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { AuthDialog } from './AuthDialog';
import { ProjectDashboard } from '../project/ProjectDashboard';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, fileName, loadSession, authLoaded, isAutosaveEnabled, save, code, objects } = useCADStore();

    useEffect(() => {
        loadSession();
    }, [loadSession]);

    // Autosave effect
    useEffect(() => {
        if (isAutosaveEnabled && user && fileName !== 'Untitled') {
            const timeout = setTimeout(() => {
                save();
            }, 2000); // 2 second debounce
            return () => clearTimeout(timeout);
        }
    }, [code, objects, isAutosaveEnabled, user, fileName, save]);

    // Show nothing while loading session
    if (!authLoaded) return null;

    // If no user, show AuthDialog
    if (!user) {
        return <AuthDialog />;
    }

    // If user is logged in but hasn't picked a project yet
    if (fileName === 'Untitled') {
        return <ProjectDashboard />;
    }

    return <>{children}</>;
}
