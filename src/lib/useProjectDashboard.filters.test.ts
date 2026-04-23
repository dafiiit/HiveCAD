import { describe, expect, it } from 'vitest';
import { matchesWorkspaceProjectFilters } from '@/components/project/useProjectDashboard';
import type { ProjectMeta } from '@/lib/storage/types';

const baseProject: ProjectMeta = {
  id: 'user-1',
  name: 'User Cube',
  ownerId: 'account-1',
  ownerEmail: 'user@example.com',
  description: 'My own model',
  visibility: 'private',
  tags: ['alpha'],
  folder: '',
  thumbnail: '',
  lastModified: Date.now(),
  createdAt: Date.now(),
  remoteProvider: '',
  remoteLocator: '',
  lockedBy: null,
};

describe('matchesWorkspaceProjectFilters', () => {
  it('excludes example projects from the Created by me view', () => {
    const exampleProject = {
      ...baseProject,
      id: 'example-1',
      ownerId: 'Example Project',
      type: 'example' as const,
      name: 'Example Gridfinity',
    };

    const userProject = {
      ...baseProject,
      type: 'user' as const,
    };

    expect(matchesWorkspaceProjectFilters(exampleProject, {
      activeNav: 'Created by me',
      activeTags: [],
      searchQuery: '',
      starredProjects: [],
      currentUserId: 'account-1',
    })).toBe(false);

    expect(matchesWorkspaceProjectFilters(userProject, {
      activeNav: 'Created by me',
      activeTags: [],
      searchQuery: '',
      starredProjects: [],
      currentUserId: 'account-1',
    })).toBe(true);
  });

  it('shows other users projects in Shared with me', () => {
    const sharedProject = {
      ...baseProject,
      type: 'user' as const,
      ownerId: 'account-2',
      name: 'Shared Bracket',
    };

    const ownProject = {
      ...baseProject,
      type: 'user' as const,
      ownerId: 'account-1',
    };

    expect(matchesWorkspaceProjectFilters(sharedProject, {
      activeNav: 'Shared with me',
      activeTags: [],
      searchQuery: '',
      starredProjects: [],
      currentUserId: 'account-1',
    })).toBe(true);

    expect(matchesWorkspaceProjectFilters(ownProject, {
      activeNav: 'Shared with me',
      activeTags: [],
      searchQuery: '',
      starredProjects: [],
      currentUserId: 'account-1',
    })).toBe(false);
  });
});
