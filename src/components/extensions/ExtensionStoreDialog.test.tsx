// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { searchExtensionsMock, registerMock } = vi.hoisted(() => {
  const searchExtensionsMock = vi.fn().mockResolvedValue([]);
  const registerMock = vi.fn();
  return { searchExtensionsMock, registerMock };
});

vi.mock('@/lib/storage/StorageManager', () => ({
  StorageManager: {
    getInstance: () => ({
      supabaseMeta: {
        searchExtensions: searchExtensionsMock,
      },
    }),
  },
}));

vi.mock('@/lib/tools', () => ({
  toolRegistry: {
    register: registerMock,
    getAllMetadata: () => [],
  },
}));

vi.mock('./ExtensionCard', () => ({
  ExtensionCard: ({ extension }: { extension: { id: string } }) => (
    <div>{extension.id}</div>
  ),
}));

vi.mock('./CreateExtensionForm', () => ({
  CreateExtensionForm: () => <div>Create form</div>,
}));

import { ExtensionStoreDialog } from './ExtensionStoreDialog';

describe('ExtensionStoreDialog', () => {
  it('returns to the browse view when reopened', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      React.createElement(ExtensionStoreDialog, {
        open: true,
        onOpenChange,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /create new tool/i }));
    expect(await screen.findByText(/create community tool/i)).toBeInTheDocument();

    rerender(
      React.createElement(ExtensionStoreDialog, {
        open: false,
        onOpenChange,
      }),
    );

    rerender(
      React.createElement(ExtensionStoreDialog, {
        open: true,
        onOpenChange,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/extension library/i)).toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText('Search tools, generators, patterns...'),
    ).toHaveValue('');
  });
});
