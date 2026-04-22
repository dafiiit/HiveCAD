// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListProjects = vi.fn();
const mockGetUserTags = vi.fn();
const mockGetUserFolders = vi.fn();
const mockOpenProjectInNewTab = vi.fn();
const mockStorageManager = {
  quickStore: {
    listProjects: mockListProjects,
  },
  supabaseMeta: {
    getUserTags: mockGetUserTags,
    getUserFolders: mockGetUserFolders,
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
    removeThumbnail: vi.fn(),
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
    mockOpenProjectInNewTab.mockReset();

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
    localStorage.clear();
  });

  it('still loads local workspace projects when remote storage is not connected', async () => {
    const { result } = renderHook(() => useProjectDashboard());

    await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.userProjects).toHaveLength(1));

    expect(result.current.userProjects[0].name).toBe('Local Cube');
  });
});
