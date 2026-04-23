// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStarredProjects, loadStarredProjects, saveStarredProjects, toggleStarredProject } from '@/components/project/starredProjects';

describe('starredProjects storage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('round-trips starred projects through localStorage', () => {
        saveStarredProjects(['project-a', 'project-b']);

        expect(loadStarredProjects()).toEqual(['project-a', 'project-b']);
    });

    it('normalizes invalid saved data', () => {
        localStorage.setItem('hivecad_starred_projects', JSON.stringify(['project-a', '', null, 7, 'project-b']));

        expect(loadStarredProjects()).toEqual(['project-a', 'project-b']);
    });

    it('toggles a project id in place', () => {
        expect(toggleStarredProject(['project-a'], 'project-b')).toEqual(['project-a', 'project-b']);
        expect(toggleStarredProject(['project-a', 'project-b'], 'project-b')).toEqual(['project-a']);
    });

    it('clears the persisted starred list', () => {
        saveStarredProjects(['project-a']);
        clearStarredProjects();

        expect(loadStarredProjects()).toEqual([]);
    });
});
