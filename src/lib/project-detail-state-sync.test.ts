// @vitest-environment jsdom

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectDetailView } from '@/components/project/ProjectDetailView';
import type { FolderEntry, ProjectMeta } from '@/lib/storage/types';

describe('ProjectDetailView project switching', () => {
  const rootProject: FolderEntry = {
    id: 'project-1',
    name: 'Root Project',
    color: '#3b82f6',
    description: 'Main project',
  };

  const childProject: FolderEntry = {
    id: 'project-2',
    name: 'Child Project',
    color: '#22c55e',
    description: 'Nested project',
  };

  const model: ProjectMeta = {
    id: 'model-1',
    name: 'Alpha Model',
    ownerId: 'user-1',
    ownerEmail: 'user@example.com',
    description: '',
    visibility: 'private',
    tags: [],
    folder: rootProject.id,
    thumbnail: '',
    lastModified: Date.now(),
    createdAt: Date.now(),
    remoteProvider: '',
    remoteLocator: '',
    lockedBy: null,
  };

  const renderView = (project: FolderEntry) =>
    render(
      React.createElement(ProjectDetailView, {
        breadcrumb: [project],
        project,
        allFolders: [rootProject, childProject],
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

  it('resets editable fields when navigating to a different project', () => {
    const { rerender } = renderView(rootProject);

    fireEvent.click(screen.getByRole('heading', { name: 'Root Project' }));
    expect(screen.getByDisplayValue('Root Project')).toBeTruthy();

    rerender(
      React.createElement(ProjectDetailView, {
        breadcrumb: [childProject],
        project: childProject,
        allFolders: [rootProject, childProject],
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

    fireEvent.click(screen.getByRole('heading', { name: 'Child Project' }));
    expect(screen.getByDisplayValue('Child Project')).toBeTruthy();
  });

  it('clears the detail search when navigating to a different project', () => {
    const { rerender } = renderView(rootProject);

    const search = screen.getByPlaceholderText('Search in Root Project...');
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryByText('Alpha Model')).toBeNull();

    rerender(
      React.createElement(ProjectDetailView, {
        breadcrumb: [childProject],
        project: childProject,
        allFolders: [rootProject, childProject],
        models: [{
          ...model,
          id: 'model-2',
          name: 'Beta Model',
          folder: childProject.id,
        }],
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

    expect((screen.getByPlaceholderText('Search in Child Project...') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Beta Model')).toBeTruthy();
  });

  it('uses readable theme tokens for sub-project titles', () => {
    renderView(rootProject);

    const subProjectTitle = screen.getByRole('heading', { name: 'Child Project' });
    expect(subProjectTitle.className).toContain('text-foreground');
    expect(subProjectTitle.className).not.toContain('text-zinc-200');
  });
});
