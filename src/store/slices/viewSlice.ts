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
    originVisible: true,
    axesVisible: true,
    sketchesVisible: true,
    bodiesVisible: true,
    planeVisibility: {
        XY: false,
        XZ: false,
        YZ: false,
    },
    sketchOptions: {
        lookAt: true,
    },

    setView: (view) => set({ currentView: view }),
    setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
    setCameraQuaternion: (quaternion) => set({ cameraQuaternion: quaternion }),
    setZoom: (zoom) => set({ zoom }),
    toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
    setOriginVisibility: (visible) => set({ originVisible: visible }),
    setAxesVisibility: (visible) => set({ axesVisible: visible }),
    setSketchesVisibility: (visible) => set({ sketchesVisible: visible }),
    setBodiesVisibility: (visible) => set({ bodiesVisible: visible }),
    setPlaneVisibility: (plane, visible) => set(state => ({
        planeVisibility: { ...state.planeVisibility, [plane]: visible }
    })),

    fitToScreen: () => console.log("fitToScreen"), // This might need implementation or bridge to UI
    toggleFullscreen: () => set(state => ({ isFullscreen: !state.isFullscreen })),

    setSketchOption: (key, value) => set(state => ({
        sketchOptions: { ...state.sketchOptions, [key]: value }
    })),

    thumbnailCapturer: null,
    setThumbnailCapturer: (capturer) => set({ thumbnailCapturer: capturer }),
});
