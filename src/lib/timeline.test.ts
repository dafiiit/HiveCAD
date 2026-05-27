// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Timeline from '@/components/cad/Timeline';
import { useCADStoreApi } from '@/hooks/useCADStore';

const { toastMock, stepForwardMock, storeState, storeApi } = vi.hoisted(() => {
  const stepForwardMock = vi.fn();
  const storeState = {
    history: [
      { id: 'step-1', name: 'Step 1' },
      { id: 'step-2', name: 'Step 2' },
    ],
    historyIndex: 0,
    skipToStart: vi.fn(),
    skipToEnd: vi.fn(),
    stepBack: vi.fn(),
    stepForward: stepForwardMock,
    goToHistoryIndex: vi.fn(),
  };
  const storeApi = {
    getState: vi.fn(() => storeState),
  };
  return {
    toastMock: vi.fn(),
    stepForwardMock,
    storeState,
    storeApi,
  };
});

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('@/hooks/useCADStore', () => ({
  useCADStore: vi.fn(() => storeState),
  useCADStoreApi: vi.fn(() => storeApi),
}));

describe('Timeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    storeState.historyIndex = 0;
    stepForwardMock.mockImplementation(() => {
      storeState.historyIndex += 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the store API at render time and uses it for playback ticks', () => {
    render(React.createElement(Timeline));

    expect(storeApi.getState).not.toHaveBeenCalled();
    expect(useCADStoreApi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Play'));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(stepForwardMock).toHaveBeenCalledTimes(1);
    expect(storeApi.getState).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenCalledWith('Playback complete');
  });
});
