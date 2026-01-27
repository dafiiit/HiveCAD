import { useStore } from 'zustand';
import { useCADStoreContext } from '../store/CADStoreContext';
import { CADState } from '../store/types';

// Re-export types
export * from '../store/types';

export function useCADStore(): CADState;
export function useCADStore<T>(selector: (state: CADState) => T): T;
export function useCADStore<T>(selector?: (state: CADState) => T) {
  const store = useCADStoreContext();
  // @ts-ignore
  return useStore(store, selector);
}

export const useCADStoreApi = () => {
  return useCADStoreContext();
}
