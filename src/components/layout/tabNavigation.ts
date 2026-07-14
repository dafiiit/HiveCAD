import type { Tab } from './TabContext';

export const getDashboardTabId = (tabs: Pick<Tab, 'id' | 'type'>[]) => {
    return tabs.find((tab) => tab.type === 'dashboard')?.id ?? null;
};
