import React from 'react';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';

export const BackgroundSyncHandler = () => {
    useBackgroundSync();
    return null;
};
