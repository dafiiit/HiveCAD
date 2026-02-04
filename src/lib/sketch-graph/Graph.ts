import {
    Geometry, GeometryType, Point2D, LineSegment, ArcSegment, Circle,
    pointsEqual, intersect, distance, EPSILON
} from './Geometry';

export class GraphNode {
    id: number;
    point: Point2D;
    edges: GraphEdge[] = [];

    constructor(id: number, point: Point2D) {
        this.id = id;
        this.point = point;
    }

    // Sort edges by angle CCW around this node
    sortEdges() {
        this.edges.sort((e1, e2) => {
            const angle1 = e1.getStartAngleAt(this);
            const angle2 = e2.getStartAngleAt(this);
            return angle1 - angle2;
        });
    }
}

export class GraphEdge {
    id: number;
    start: GraphNode;
    end: GraphNode;
    geometry: Geometry; // The geometry BETWEEN start and end
    visited: boolean = false; // For cycle finding

    constructor(id: number, start: GraphNode, end: GraphNode, geometry: Geometry) {
        this.id = id;
        this.start = start;
        this.end = end;
        this.geometry = geometry;
    }

    getOtherNode(node: GraphNode): GraphNode | null {
        if (node === this.start) return this.end;
        if (node === this.end) return this.start;
        return null;
    }

    // Get angle of the edge leaving 'node'
    getStartAngleAt(node: GraphNode): number {
        const p1 = node.point;
        let p2: Point2D;

        if (this.geometry.type === GeometryType.Line) {
            p2 = (node === this.start) ? this.end.point : this.start.point;
        } else if (this.geometry.type === GeometryType.Arc) {
            // Tangent angle at start/end
            const arc = this.geometry as ArcSegment;
            const angle = Math.atan2(p1.y - arc.center.y, p1.x - arc.center.x);
            // Tangent is perpendicular to radius. Direction depends on CW/CCW and if we are at start or end.
            // Simplified: compute a point slightly along the curve
            // todo:refine Analytical tangent is better.
            const isStart = pointsEqual(p1, arc.startPoint);
            // If traversing from start, we go towards end.
            // If traversing from end, we go towards start (reversing the arc direction effectively)

            // Tangent of circle at angle alpha is alpha + PI/2 (CCW).
            // If arc is CCW, at start (angle alpha), we move towards alpha + PI/2.
            // At limit, tangent is alpha + PI/2.
            // If arc is CCW, at end (angle beta), we move BACKWARDS, so tangent is beta - PI/2 ??

            if (arc.ccw) {
                return isStart ? angle + Math.PI / 2 : angle - Math.PI / 2;
            } else {
                return isStart ? angle - Math.PI / 2 : angle + Math.PI / 2;
            }
        } else {
            // Circle shouldn't be an edge usually (closed loop itself), but if so...
            // todo:refine Placeholder tangent direction for circle edges.
            p2 = { x: p1.x + 1, y: p1.y };
        }

        // Fallback for line tangent
        p2 = (node === this.start) ? this.end.point : this.start.point;
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }
}

export class PlanarGraph {
    nodes: GraphNode[] = [];
    edges: GraphEdge[] = [];

    // Raw inputs before splitting
    geometries: Geometry[] = [];

    private nodeIdCounter = 0;
    private edgeIdCounter = 0;

    constructor() { }

    private findOrAddNode(p: Point2D): GraphNode {
        for (const n of this.nodes) {
            if (pointsEqual(n.point, p)) return n;
        }
        const node = new GraphNode(this.nodeIdCounter++, p);
        this.nodes.push(node);
        return node;
    }

    addGeometry(geo: Geometry) {
        this.geometries.push(geo);
    }

    // The main processing function
    computeTopology() {
        // 1. Intersect all geometries against all others
        // specific generic "cut points" map
        const cuts: Map<Geometry, Point2D[]> = new Map();

        for (const g of this.geometries) {
            cuts.set(g, []);
            // Add start/end points as default cuts for lines/arcs
            if (g.type === GeometryType.Line) {
                const l = g as LineSegment;
                cuts.get(g)!.push(l.start, l.end);
            } else if (g.type === GeometryType.Arc) {
                const a = g as ArcSegment;
                cuts.get(g)!.push(a.startPoint, a.endPoint);
            }
        }

        for (let i = 0; i < this.geometries.length; i++) {
            for (let j = i + 1; j < this.geometries.length; j++) {
                const g1 = this.geometries[i];
                const g2 = this.geometries[j];

                const pts = intersect(g1, g2);
                for (const p of pts) {
                    cuts.get(g1)!.push(p);
                    cuts.get(g2)!.push(p);
                }
            }
        }

        // 2. Fragment Geometries into Edges
        for (const [geo, points] of cuts.entries()) {
            // Sort points along the geometry
            const uniquePoints = this.sortPointsAlongGeometry(points, geo);

            // Handle Circle geometry specially
            if (geo.type === GeometryType.Circle) {
                const circle = geo as Circle;
                
                if (uniquePoints.length < 2) {
                    // Standalone circle with no intersections - create a self-loop arc edge
                    // This represents a closed profile that can be detected as a cycle
                    const refAngle = 0;
                    const subGeo = new ArcSegment(
                        circle.center, 
                        circle.radius, 
                        refAngle, 
                        refAngle + 2 * Math.PI, 
                        true
                    );
                    const nodePoint = { 
                        x: circle.center.x + circle.radius, 
                        y: circle.center.y 
                    };
                    const node = this.findOrAddNode(nodePoint);
                    const edge = new GraphEdge(this.edgeIdCounter++, node, node, subGeo);
                    node.edges.push(edge);
                    node.edges.push(edge); // Add twice for self-loop traversal (in/out)
                    this.edges.push(edge);
                } else {
                    // Circle with intersection points - split into arc segments
                    for (let k = 0; k < uniquePoints.length; k++) {
                        const pStart = uniquePoints[k];
                        const pEnd = uniquePoints[(k + 1) % uniquePoints.length];
                        
                        if (pointsEqual(pStart, pEnd)) continue;
                        
                        const u = this.findOrAddNode(pStart);
                        const v = this.findOrAddNode(pEnd);
                        
                        const ang1 = Math.atan2(pStart.y - circle.center.y, pStart.x - circle.center.x);
                        const ang2 = Math.atan2(pEnd.y - circle.center.y, pEnd.x - circle.center.x);
                        const subGeo = new ArcSegment(circle.center, circle.radius, ang1, ang2, true);
                        
                        const edge = new GraphEdge(this.edgeIdCounter++, u, v, subGeo);
                        u.edges.push(edge);
                        v.edges.push(edge);
                        this.edges.push(edge);
                    }
                }
                continue; // Move to next geometry
            }

            // Handle Line and Arc geometries
            for (let k = 0; k < uniquePoints.length - 1; k++) {
                const pStart = uniquePoints[k];
                const pEnd = uniquePoints[k + 1];

                if (pointsEqual(pStart, pEnd)) continue; // skip degenerate

                const u = this.findOrAddNode(pStart);
                const v = this.findOrAddNode(pEnd);

                // create sub-geometry
                let subGeo: Geometry;
                if (geo.type === GeometryType.Line) {
                    subGeo = new LineSegment(u.point, v.point);
                } else if (geo.type === GeometryType.Arc) {
                    const orig = geo as ArcSegment;
                    const ang1 = Math.atan2(u.point.y - orig.center.y, u.point.x - orig.center.x);
                    const ang2 = Math.atan2(v.point.y - orig.center.y, v.point.x - orig.center.x);
                    // Handle wrap-around or correct direction?
                    // We need to ensure [ang1, ang2] is a sub-arc of lines [start, end]
                    // For now, assume simple case, we might need logic to handle CCW order

                    // Actually, sortPointsAlongGeometry ensures they are in order.
                    // So we just connect k to k+1 with same params.
                    subGeo = new ArcSegment(orig.center, orig.radius, ang1, ang2, orig.ccw);
                } else {
                    // Unknown geometry type - skip
                    continue;
                }

                const edge = new GraphEdge(this.edgeIdCounter++, u, v, subGeo);
                u.edges.push(edge);
                v.edges.push(edge);
                this.edges.push(edge);
            }
        }

        // 3. Sort edges at each node
        for (const n of this.nodes) {
            n.sortEdges();
        }
    }

    private sortPointsAlongGeometry(points: Point2D[], geo: Geometry): Point2D[] {
        // Filter unique
        const unique: Point2D[] = [];
        for (const p of points) {
            if (!unique.some(existing => pointsEqual(existing, p))) {
                unique.push(p);
            }
        }

        if (geo.type === GeometryType.Line) {
            const l = geo as LineSegment;
            // Project to 1D t along line
            // t = [(p - start) . (end - start)] / |end - start|^2
            const dx = l.end.x - l.start.x;
            const dy = l.end.y - l.start.y;
            const len2 = dx * dx + dy * dy;

            return unique.sort((a, b) => {
                const ta = ((a.x - l.start.x) * dx + (a.y - l.start.y) * dy) / len2;
                const tb = ((b.x - l.start.x) * dx + (b.y - l.start.y) * dy) / len2;
                return ta - tb;
            });
        } else if (geo.type === GeometryType.Arc) {
            const arc = geo as ArcSegment;
            // Sort by angle from startAngle in CCW direction?
            return unique.sort((a, b) => {
                // get angle of each point
                const angA = Math.atan2(a.y - arc.center.y, a.x - arc.center.x);
                const angB = Math.atan2(b.y - arc.center.y, b.x - arc.center.x);

                // Normalize relative to startAngle
                let da = normalizeAngle(angA - arc.startAngle);
                let db = normalizeAngle(angB - arc.startAngle);

                if (!arc.ccw) {
                    // If CW, maybe we treat as distance from start backwards
                    // or just normalize differently.
                    // For simplicity, let's just stick to CCW arcs if possible
                    // but if not, logic required.
                }
                return da - db;
            });
        }

        return unique;
    }

    // Find Minimal Cycles (Faces)
    findCycles(): { edges: GraphEdge[], direction: boolean[] }[] {
        const cycles: { edges: GraphEdge[], direction: boolean[] }[] = [];
        const visitedEdges = new Set<string>(); // "edgeId-fromNodeId" (directed edges)

        // For every edge in both directions
        for (const edge of this.edges) {
            // Treat as directed edge u -> v
            this.traverseCycle(edge, edge.start, visitedEdges, cycles);
            // Treat as directed edge v -> u
            this.traverseCycle(edge, edge.end, visitedEdges, cycles);
        }

        return cycles;
    }

    private traverseCycle(
        startEdge: GraphEdge,
        pivNode: GraphNode,
        visited: Set<string>,
        cycles: { edges: GraphEdge[], direction: boolean[] }[]
    ) {
        // We start traversal along `startEdge` FROM `pivNode`.
        const startDirId = `${startEdge.id}-${pivNode.id}`;
        if (visited.has(startDirId)) return;

        const pathEdges: GraphEdge[] = [];
        const pathDirs: boolean[] = []; // true if traversed start->end, false if end->start

        const visitedInThisWalk = new Set<string>();

        let currEdge = startEdge;
        let currFrom = pivNode; // Node we are LEAVING

        while (true) {
            const dirId = `${currEdge.id}-${currFrom.id}`;
            visitedInThisWalk.add(dirId);
            pathEdges.push(currEdge);
            // If currFrom is start, we traverse forward (true).
            pathDirs.push(currFrom === currEdge.start);

            const nextNode = currEdge.getOtherNode(currFrom);
            if (!nextNode) break;

            if (nextNode === pivNode) {
                // Cycle closed
                cycles.push({ edges: pathEdges, direction: pathDirs });
                // Mark all used directed edges as visited globally
                for (const k of visitedInThisWalk) visited.add(k);
                return;
            }

            // Turn Left logic:
            // Find idx of currEdge in nextNode.edges
            const edges = nextNode.edges; // Sorted by angle LEAVING nextNode
            const idx = edges.indexOf(currEdge);

            // We entered nextNode via currEdge.
            // We want the next edge in the CCW list.
            const nextEdge = edges[(idx + 1) % edges.length];

            // Check if immediate u-turn (only likely if dead end, i.e., 1 edge)
            if (nextEdge === currEdge && edges.length > 1) {
                // degenerate?
            }

            currEdge = nextEdge;
            currFrom = nextNode;

            if (visited.has(`${currEdge.id}-${currFrom.id}`)) {
                // Merged into an existing path we already processed?
                // Abort
                return;
            }
            if (visitedInThisWalk.has(`${currEdge.id}-${currFrom.id}`)) {
                // Loop detected but not at pivot? (Lasso)
                // Just abort
                return;
            }
        }
    }
}

function normalizeAngle(a: number): number {
    let res = a % (2 * Math.PI);
    if (res < 0) res += 2 * Math.PI;
    return res;
}
