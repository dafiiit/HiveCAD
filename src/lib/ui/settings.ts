export const getUserInitial = (email?: string | null, userId?: string | null) => {
    return (email?.[0] ?? userId?.[0] ?? '?').toUpperCase();
};

export const getUserLabel = (email?: string | null) => {
    return email ?? 'Unknown account';
};
