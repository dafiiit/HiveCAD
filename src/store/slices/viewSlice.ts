import { StateCreator } from 'zustand';
import { CADState, ViewSlice } from '../types';

export const createViewSlice: StateCreator<CADState, [], [], ViewSlice> = (set) => ({
    isFullscreen: false,
    currentView: 'isometric',
    cameraRotation: null,
    cameraQuaternion: [0, 0, 0, 1],
    zoom: 25,
    gridVisible: true,
    originVisible: true,
    axesVisible: true,
    sketchesVisible: true,
    bodiesVisible: true,
    planeVisibility: {
        XY: true,
        XZ: true,
        YZ: true,
    },
    sketchOptions: { lookAt: true },
    projectionMode: 'orthographic',
    backgroundMode: 'dark',
    sectionViewEnabled: false,
    showMeasurements: false,
    thumbnailCapturer: null,
    fitToScreenSignal: 0,

    setView: (view) => set({ currentView: view }),
    setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
    setCameraQuaternion: (quaternion) => set({ cameraQuaternion: quaternion }),
    setZoom: (zoom) => set({ zoom }),
    toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
    setOriginVisibility: (visible) => set({ originVisible: visible }),
    setAxesVisibility: (visible) => set({ axesVisible: visible }),
    setSketchesVisibility: (visible) => set({ sketchesVisible: visible }),
    setBodiesVisibility: (visible) => set({ bodiesVisible: visible }),
    setPlaneVisibility: (plane, visible) => set((state) => ({
        planeVisibility: { ...state.planeVisibility, [plane]: visible }
    })),
    fitToScreen: () => set((state) => ({ fitToScreenSignal: (state.fitToScreenSignal || 0) + 1 })),

    toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
    setProjectionMode: (mode) => set({ projectionMode: mode }),
    setBackgroundMode: (mode) => set({ backgroundMode: mode }),
    toggleSectionView: () => set((state) => ({ sectionViewEnabled: !state.sectionViewEnabled })),
    toggleMeasurements: () => set((state) => ({ showMeasurements: !state.showMeasurements })),
    setSketchOption: (key, value) => set((state) => ({
        sketchOptions: { ...state.sketchOptions, [key]: value }
    })),
    setThumbnailCapturer: (capturer) => set({ thumbnailCapturer: capturer }),
});
