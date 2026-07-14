// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListProjects = vi.fn();
const mockGetUserTags = vi.fn();
const mockGetUserFolders = vi.fn();
const mockSearchPublicProjects = vi.fn();
const mockOpenProjectInNewTab = vi.fn();
const mockDeleteProject = vi.fn();
const mockDeleteProjectMeta = vi.fn();
const mockRemoveThumbnail = vi.fn();
const mockStorageManager = {
  quickStore: {
    listProjects: mockListProjects,
    deleteProject: mockDeleteProject,
  },
  supabaseMeta: {
    getUserTags: mockGetUserTags,
    getUserFolders: mockGetUserFolders,
    searchPublicProjects: mockSearchPublicProjects,
    deleteProjectMeta: mockDeleteProjectMeta,
  },
  remoteStore: null,
  isRemoteConnected: false,
};

vi.mock('@/lib/storage/StorageManager', () => ({
  StorageManager: {
    getInstance: vi.fn(() => mockStorageManager),
  },
}));

vi.mock('@/store/useGlobalStore', () => ({
  useGlobalStore: vi.fn(() => ({
    user: {
      id: 'user-1',
      email: 'user@example.com',
      pat: 'ghp_remote-token',
    },
    logout: vi.fn(),
    showPATDialog: false,
    setShowPATDialog: vi.fn(),
    isStorageConnected: false,
  })),
}));

vi.mock('@/hooks/useCADStore', () => ({
  useCADStore: vi.fn(() => ({
    setFileName: vi.fn(),
    setCode: vi.fn(),
    projectThumbnails: {},
    reset: vi.fn(),
    closeProject: vi.fn(),
    removeThumbnail: mockRemoveThumbnail,
  })),
}));

vi.mock('@/components/layout/TabContext', () => ({
  useTabManager: vi.fn(() => ({
    openProjectInNewTab: mockOpenProjectInNewTab,
  })),
}));

import { useProjectDashboard } from '@/components/project/useProjectDashboard';

describe('useProjectDashboard', () => {
  beforeEach(() => {
    mockListProjects.mockReset();
    mockGetUserTags.mockReset();
    mockGetUserFolders.mockReset();
    mockSearchPublicProjects.mockReset();
    mockOpenProjectInNewTab.mockReset();
    mockDeleteProject.mockReset();
    mockDeleteProjectMeta.mockReset();
    mockRemoveThumbnail.mockReset();

    mockListProjects.mockResolvedValue([
      {
        id: 'local-1',
        name: 'Local Cube',
        ownerId: 'user-1',
        ownerEmail: 'user@example.com',
        description: '',
        visibility: 'private',
        tags: [],
        folder: '',
        thumbnail: '',
        lastModified: Date.now(),
        createdAt: Date.now(),
        remoteProvider: '',
        remoteLocator: '',
        lockedBy: null,
      },
    ]);
    mockGetUserTags.mockResolvedValue([]);
    mockGetUserFolders.mockResolvedValue([]);
    mockSearchPublicProjects.mockResolvedValue([]);
    window.localStorage.clear();
  });

  it('still loads local workspace projects when remote storage is not connected', async () => {
    const { result } = renderHook(() => useProjectDashboard());

    await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.userProjects).toHaveLength(1));

    expect(result.current.userProjects[0].name).toBe('Local Cube');
  });

  it('does not reload workspace projects when the local search query changes', async () => {
    const { result } = renderHook(() => useProjectDashboard());

    await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setSearchQuery('cube');
    });

    await waitFor(() => expect(result.current.searchQuery).toBe('cube'));
    expect(mockListProjects).toHaveBeenCalledTimes(1);
  });

  it('does not leak the workspace search query into discover mode', async () => {
    const { result } = renderHook(() => useProjectDashboard());

    await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setDashboardMode('discover');
    });

    await waitFor(() => expect(mockSearchPublicProjects).toHaveBeenCalledWith(''));
    expect(mockSearchPublicProjects).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setSearchQuery('cube');
    });

    await waitFor(() => expect(result.current.searchQuery).toBe('cube'));
    expect(mockSearchPublicProjects).toHaveBeenCalledTimes(1);
  });

  it('removes project thumbnails by stable id when deleting a project', async () => {
    const { result } = renderHook(() => useProjectDashboard());

    await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.handleDeleteProject('local-1');
    });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(mockDeleteProject).toHaveBeenCalledWith('local-1');
    expect(mockDeleteProjectMeta).toHaveBeenCalledWith('local-1');
    expect(mockRemoveThumbnail).toHaveBeenCalledWith('local-1', 'Local Cube');
  });
});
