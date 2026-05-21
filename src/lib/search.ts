export function matchesSearchableFields(searchQuery: string, ...fields: Array<string | undefined | null>) {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return fields.some(field => field?.toLowerCase().includes(query));
}
