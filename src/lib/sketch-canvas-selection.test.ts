// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCanvasScope: any = {};

vi.mock('@/components/cad/useSketchCanvas', () => ({
  useSketchCanvas: () => mockCanvasScope,
}));

vi.mock('@/components/cad/SketchToolDialog', () => ({
  default: () => null,
}));

vi.mock('@/components/cad/SketchAnnotations', () => ({
  DimensionBadge: () => null,
  PointMarker: () => null,
}));

vi.mock('@/components/ui/IconResolver', () => ({
  IconResolver: () => null,
}));

vi.mock('@/lib/tools', () => ({
  toolRegistry: {
    get: vi.fn(() => null),
  },
}));

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({}),
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  Grid: () => null,
  Line: ({ color, lineWidth, opacity }: any) =>
    React.createElement('div', {
      'data-testid': 'mock-line',
      'data-color': color,
      'data-line-width': lineWidth,
      'data-opacity': opacity,
    }),
}));

import SketchCanvas from '@/components/cad/SketchCanvas';

describe('SketchCanvas solver entity styling', () => {
  beforeEach(() => {
    mockCanvasScope.isSketchMode = true;
    mockCanvasScope.sketchStep = 'drawing';
    mockCanvasScope.sketchPlane = 'XY';
    mockCanvasScope.selectedPrimitiveIds = new Set();
    mockCanvasScope.hoveredPrimitiveId = null;
    mockCanvasScope.to3D = (x: number, y: number) => ({
      x,
      y,
      z: 0,
      toArray: () => [x, y, 0],
    });
    mockCanvasScope.handlePointerDown = vi.fn();
    mockCanvasScope.handlePointerUp = vi.fn();
    mockCanvasScope.draggingHandle = null;
    mockCanvasScope.isHandleSelectedInCoincidentGroup = vi.fn(() => false);
    mockCanvasScope.pixelScale = 1;
    mockCanvasScope.activeTool = 'select';
    mockCanvasScope.activeConstraintType = null;
    mockCanvasScope.finalizeHandleDrag = vi.fn();
    mockCanvasScope.snapResultRef = { current: null };
    mockCanvasScope.setConstraintOverlayForHandle = vi.fn();
    mockCanvasScope.setDraggingHandle = vi.fn();
    mockCanvasScope.setCameraControlsDisabled = vi.fn();
    mockCanvasScope.handlePressedRef = { current: null };
    mockCanvasScope.dragStartRef = { current: null };
    mockCanvasScope.IS_CLICK_THRESHOLD = 5;
    mockCanvasScope.selectHandle = vi.fn();
    mockCanvasScope.applyCoincidentFromSelectedHandles = vi.fn();
    mockCanvasScope.lockedValues = {};
    mockCanvasScope.dimFocusedField = null;
    mockCanvasScope.handleDimLengthChange = vi.fn();
    mockCanvasScope.handleDimAngleChange = vi.fn();
    mockCanvasScope.handleDimFocusChange = vi.fn();
    mockCanvasScope.handleDimEnter = vi.fn();
    mockCanvasScope.selectedIds = new Set(['line-1']);
    mockCanvasScope.sketchEntities = new Map([
      ['p1', { id: 'p1', type: 'point', x: 0, y: 0 }],
      ['p2', { id: 'p2', type: 'point', x: 10, y: 0 }],
      ['line-1', { id: 'line-1', type: 'line', p1Id: 'p1', p2Id: 'p2' }],
    ]);
    mockCanvasScope.gridRef = { current: null };
    mockCanvasScope.gridSnapSize = 10;
    mockCanvasScope.handlePointerMove = vi.fn();
    mockCanvasScope.handleDoubleClick = vi.fn();
    mockCanvasScope.planeRotation = [0, 0, 0];
    mockCanvasScope.selectPrimitive = vi.fn();
    mockCanvasScope.applyDimensionToPrimitive = vi.fn();
    mockCanvasScope.dimensionFirstPrimRef = { current: null };
    mockCanvasScope.activeSketchPrimitives = [];
    mockCanvasScope.currentDrawingPrimitive = null;
    mockCanvasScope.constraintOverlay = null;
    mockCanvasScope.overlayConstraintItems = [];
    mockCanvasScope.selectedConstraintOverlayId = null;
    mockCanvasScope.setSelectedConstraintOverlayId = vi.fn();
    mockCanvasScope.hoverPoint = null;
    mockCanvasScope.showDialog = false;
    mockCanvasScope.snapResult = null;
    mockCanvasScope.annotationCtx = null;
    mockCanvasScope.sketchConstraints = [];
    mockCanvasScope.sketchDimensions = [];
    mockCanvasScope.pendingStartPoint = null;
    mockCanvasScope.handleDialogClose = vi.fn();
    mockCanvasScope.handleDialogConfirm = vi.fn();
    mockCanvasScope.constraintSelectionPrompt = null;
    mockCanvasScope.constraintSelectionIds = [];
    mockCanvasScope.primitiveCoincidents = new Map();
    mockCanvasScope.selectedHandleIds = new Set();
    mockCanvasScope.removeSolverConstraint = vi.fn();
  });

  it('uses the standard selection blue instead of debug magenta for selected solver entities', () => {
    render(React.createElement(SketchCanvas));

    const selectedLine = screen
      .getAllByTestId('mock-line')
      .find((node) => node.getAttribute('data-color') === '#3399FF');

    expect(selectedLine).toBeTruthy();
    expect(selectedLine?.getAttribute('data-color')).toBe('#3399FF');
    expect(selectedLine?.getAttribute('data-line-width')).toBe('4');
  });
});
