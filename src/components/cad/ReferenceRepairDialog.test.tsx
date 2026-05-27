// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { repairReferenceMock, getReferenceManagerMock } = vi.hoisted(() => {
  const repairReferenceMock = vi.fn();
  const getReferenceManagerMock = vi.fn(() => ({
    repairReference: repairReferenceMock,
  }));
  return { repairReferenceMock, getReferenceManagerMock };
});

vi.mock('../../lib/topology', () => ({
  getReferenceManager: getReferenceManagerMock,
}));

import { ReferenceRepairDialog } from './ReferenceRepairDialog';
import type { ReferenceState } from '../../lib/topology';

describe('ReferenceRepairDialog', () => {
  it('reports the repaired count after accepting the final suggestion', () => {
    const references: ReferenceState[] = [
      {
        id: 'ref-1',
        featureId: 'feature-1',
        description: 'Face reference',
        confidence: 0,
        status: 'broken',
        reference: {
          type: 'face',
          baseObjectId: 'body-1',
          indexHint: 4,
        },
        alternatives: [
          { index: 7, confidence: 0.98, label: 'Top face' },
        ],
      },
    ];

    const onRepairComplete = vi.fn();
    const onClose = vi.fn();

    render(
      React.createElement(ReferenceRepairDialog, {
        references,
        onClose,
        onRepairComplete,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /accept best match/i }));

    expect(repairReferenceMock).toHaveBeenCalledWith('ref-1', 7, 'accept_suggestion');
    expect(onRepairComplete).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
