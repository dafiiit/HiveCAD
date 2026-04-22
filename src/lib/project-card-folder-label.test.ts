// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '@/components/project/ProjectCard';

describe('ProjectCard', () => {
  it('shows the folder name instead of the folder id', () => {
    render(
      React.createElement(ProjectCard, {
        project: {
          id: 'model-1',
          name: 'Bracket',
          ownerId: 'user-1',
          ownerEmail: 'user@example.com',
          description: '',
          visibility: 'private',
          tags: [],
          folder: 'folder-1',
          thumbnail: '',
          lastModified: Date.now(),
          createdAt: Date.now(),
          remoteProvider: '',
          remoteLocator: '',
          lockedBy: null,
        },
        onOpen: vi.fn(),
        onToggleStar: vi.fn(),
        isStarred: false,
        onAction: vi.fn(),
        showMenu: false,
        onDelete: vi.fn(),
        onRename: vi.fn(),
        onManageTags: vi.fn(),
        onShare: vi.fn(),
        onViewHistory: vi.fn(),
        tags: [],
        projectThumbnails: {},
        hasPAT: false,
        folders: [
          { id: 'folder-1', name: 'Mechanical Parts', color: '#3b82f6' },
        ],
        onMoveToFolder: vi.fn(),
      }),
    );

    expect(screen.getByText('Mechanical Parts')).toBeTruthy();
    expect(screen.queryByText('folder-1')).toBeNull();
  });
});
