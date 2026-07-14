import { describe, expect, it } from 'vitest';
import { getDashboardTabId } from '@/components/layout/tabNavigation';

describe('getDashboardTabId', () => {
    it('returns the dashboard tab when one exists', () => {
        expect(getDashboardTabId([
            { id: 'project-1', type: 'project' },
            { id: 'dashboard', type: 'dashboard' },
        ])).toBe('dashboard');
    });

    it('returns null when no dashboard tab exists', () => {
        expect(getDashboardTabId([
            { id: 'project-1', type: 'project' },
        ])).toBeNull();
    });
});
