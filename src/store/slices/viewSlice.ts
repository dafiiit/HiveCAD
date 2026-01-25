import { StateCreator } from 'zustand';
import { CADState, ViewSlice } from '../types';

export const createViewSlice: StateCreator<
    CADState,
    [],
    [],
    ViewSlice
> = (set) => ({
    isFullscreen: false,
    currentView: 'home',
    cameraRotation: { x: -0.4, y: -0.6, z: 0 },
    cameraQuaternion: [0, 0, 0, 1],
    zoom: 100,
    gridVisible: true,
    sketchOptions: {
        lookAt: true,
    },

    setView: (view) => set({ currentView: view }),
    setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
    setCameraQuaternion: (quaternion) => set({ cameraQuaternion: quaternion }),
    setZoom: (zoom) => set({ zoom }),
    toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),

    fitToScreen: () => console.log("fitToScreen"), // This might need implementation or bridge to UI
    toggleFullscreen: () => set(state => ({ isFullscreen: !state.isFullscreen })),

    setSketchOption: (key, value) => set(state => ({
        sketchOptions: { ...state.sketchOptions, [key]: value }
    })),
});
