// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VCSGraph } from '@/components/cad/VCSGraph';

describe('VCSGraph', () => {
  const commits = [
    {
      id: 'commit-a',
      parentId: null,
      message: 'Initial commit',
      author: 'Alice',
      timestamp: new Date('2024-01-01T00:00:00Z').getTime(),
      branchName: 'main',
    },
    {
      id: 'commit-b',
      parentId: 'commit-a',
      message: 'Follow-up change',
      author: 'Bob',
      timestamp: new Date('2024-01-02T00:00:00Z').getTime(),
      branchName: 'main',
    },
  ];

  it('does not checkout when the action is hidden', () => {
    const onCheckout = vi.fn();
    const { container } = render(
      React.createElement(VCSGraph, {
        commits,
        onCheckout,
        showCheckoutAction: false,
      }),
    );

    const dot = container.querySelector('[data-dot-id="commit-b"]');
    expect(dot).toBeTruthy();

    fireEvent.click(dot!);

    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('checks out from the dot when the action is shown', () => {
    const onCheckout = vi.fn();
    const { container } = render(
      React.createElement(VCSGraph, {
        commits,
        onCheckout,
      }),
    );

    const dot = container.querySelector('[data-dot-id="commit-b"]');
    expect(dot).toBeTruthy();

    fireEvent.click(dot!);

    expect(onCheckout).toHaveBeenCalledWith('commit-b');
  });
});
