import React, { createContext, useRef, useContext } from 'react';
import { StoreApi, useStore } from 'zustand';
import { CADState } from './types';
import { createCADStore } from './createCADStore';

const CADStoreContext = createContext<StoreApi<CADState> | null>(null);

interface CADStoreProviderProps {
    children: React.ReactNode;
    store?: StoreApi<CADState>;
}

export const CADStoreProvider = ({ children, store }: CADStoreProviderProps) => {
    const storeRef = useRef<StoreApi<CADState>>();
    if (!storeRef.current) {
        storeRef.current = store || createCADStore();
    }

    return (
        <CADStoreContext.Provider value={storeRef.current}>
            {children}
        </CADStoreContext.Provider>
    );
};

export const useCADStoreContext = () => {
    const store = useContext(CADStoreContext);
    if (!store) {
        throw new Error('useCADStore must be used within a CADStoreProvider');
    }
    return store;
};
