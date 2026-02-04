
export class InteractionManager {
    /**
     * Converts a selection ID (usually from Three.js userData) into a Replicad predicate.
     * @param selectionId The ID of the selected element (e.g. "face-12", "edge-5")
     * @param objectType The type of object (face, edge, vertex)
     * @param contextInfo Additional context (e.g. normal vector, position) to help generate stable selectors
     */
    static generateSelector(selectionId: string, objectType: 'face' | 'edge', contextInfo?: any): string {
        // Basic implementation: direct index or ID matching
        // In the future this implies analyzing the geometry to create "stable" selectors:
        // e.g. "face in XY plane" or "longest edge"

        // For Project Prometheus PoC, we rely on face IDs provided by the WASM/Replicad kernel.

        if (objectType === 'face') {
            // Check if we can generate a predicate based on context
            if (contextInfo) {
                if (contextInfo.plane) {
                    return `(f) => f.inPlane('${contextInfo.plane}')`;
                }
                // Parallel to plane?
                // Area match?
            }

            // Fallback to index if available in string "face-12"
            const match = selectionId.match(/face-(\d+)/);
            if (match) {
                const index = parseInt(match[1]);
                // return `(f, i) => i === ${index}`;
                // Replicad might expose specific ID methods
            }
        }

        // todo:refine Default generic selector placeholder.
        return `(e) => e.id === '${selectionId}'`;
    }
}
