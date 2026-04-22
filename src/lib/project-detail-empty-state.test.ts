// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectDetailView } from '@/components/project/ProjectDetailView';
import type { FolderEntry, ProjectMeta } from '@/lib/storage/types';

describe('ProjectDetailView empty search states', () => {
  const project: FolderEntry = {
    id: 'project-1',
    name: 'Root Project',
    color: '#3b82f6',
    description: 'Main project',
  };

  const subProject: FolderEntry = {
    id: 'project-1-child',
    name: 'Alpha Child',
    color: '#22c55e',
    parentId: project.id,
  };

  const model: ProjectMeta = {
    id: 'model-1',
    name: 'Alpha Model',
    ownerId: 'user-1',
    ownerEmail: 'user@example.com',
    description: '',
    visibility: 'private',
    tags: [],
    folder: project.id,
    thumbnail: '',
    lastModified: Date.now(),
    createdAt: Date.now(),
    remoteProvider: '',
    remoteLocator: '',
    lockedBy: null,
  };

  const renderView = () =>
    render(
      React.createElement(ProjectDetailView, {
        breadcrumb: [project],
        project,
        allFolders: [project, subProject],
        models: [model],
        onNavigateBreadcrumb: vi.fn(),
        onBack: vi.fn(),
        onCreate3DModel: vi.fn(),
        onCreateSubProject: vi.fn(),
        onOpenSubProject: vi.fn(),
        onOpen3DModel: vi.fn(),
        onDelete3DModel: vi.fn(),
        onRename3DModel: vi.fn(),
        onUpdateProject: vi.fn(),
        projectThumbnails: {},
      }),
    );

  it('shows explicit empty states when search filters out every item', () => {
    renderView();

    expect(screen.queryByText(/No sub-projects match your search/i)).toBeNull();
    expect(screen.queryByText(/No 3D models match your search/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Search in Root Project...'), {
      target: { value: 'zzz' },
    });

    expect(screen.getByText(/No sub-projects match your search/i)).toBeTruthy();
    expect(screen.getByText(/No 3D models match your search/i)).toBeTruthy();
  });
});
