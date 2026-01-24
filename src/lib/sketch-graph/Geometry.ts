export type Point2D = { x: number; y: number };

export const EPSILON = 1e-9;

export function distance(p1: Point2D, p2: Point2D): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function pointsEqual(p1: Point2D, p2: Point2D, tolerance = EPSILON): boolean {
    return distance(p1, p2) < tolerance;
}

export function arcFromThreePoints(p1: Point2D, p2: Point2D, p3: Point2D): ArcSegment | null {
    // p1 start, p2 end, p3 mid (point on arc)
    // Perpendicular bisector of p1-p3 and p3-p2 intersect at center

    const x1 = p1.x, y1 = p1.y;
    const x2 = p3.x, y2 = p3.y;
    const x3 = p2.x, y3 = p2.y; // note p2 in arg is end, p3 is mid. user passed start, end, mid

    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(D) < EPSILON) return null; // Collinear

    const center = {
        x: ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D,
        y: ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D
    };

    const radius = distance(center, p1);

    const aStart = Math.atan2(y1 - center.y, x1 - center.x);
    const aEnd = Math.atan2(y3 - center.y, x3 - center.x);
    const aMid = Math.atan2(y2 - center.y, x2 - center.x);

    // Determine direction.
    // Check if aMid is between aStart and aEnd in CCW direction.
    let isCCW = true;

    // Normalize angles to [0, 2PI)
    const nStart = (aStart % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const nEnd = (aEnd % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const nMid = (aMid % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    if (nStart < nEnd) {
        if (nMid > nStart && nMid < nEnd) isCCW = true;
        else isCCW = false;
    } else {
        if (nMid > nStart || nMid < nEnd) isCCW = true;
        else isCCW = false;
    }

    // Since our ArcSegment is strictly start/end and bool ccw:
    return new ArcSegment(center, radius, aStart, aEnd, isCCW);
}

export enum GeometryType {
    Line = 'line',
    Arc = 'arc',
    Circle = 'circle'
}

export interface Geometry {
    type: GeometryType;
    clone(): Geometry;
}

export class LineSegment implements Geometry {
    type = GeometryType.Line;
    constructor(public start: Point2D, public end: Point2D) { }

    clone(): LineSegment {
        return new LineSegment({ ...this.start }, { ...this.end });
    }

    length(): number {
        return distance(this.start, this.end);
    }
}

export class ArcSegment implements Geometry {
    type = GeometryType.Arc;
    // center, radius, startAngle, endAngle (radians), counterClockwise
    constructor(
        public center: Point2D,
        public radius: number,
        public startAngle: number,
        public endAngle: number,
        public ccw: boolean = true
    ) { }

    clone(): ArcSegment {
        return new ArcSegment({ ...this.center }, this.radius, this.startAngle, this.endAngle, this.ccw);
    }

    get startPoint(): Point2D {
        return {
            x: this.center.x + this.radius * Math.cos(this.startAngle),
            y: this.center.y + this.radius * Math.sin(this.startAngle)
        };
    }

    get endPoint(): Point2D {
        return {
            x: this.center.x + this.radius * Math.cos(this.endAngle),
            y: this.center.y + this.radius * Math.sin(this.endAngle)
        };
    }
}

export class Circle implements Geometry {
    type = GeometryType.Circle;
    constructor(public center: Point2D, public radius: number) { }

    clone(): Circle {
        return new Circle({ ...this.center }, this.radius);
    }
}

// --- Intersection Logic ---

// Helper: Check if a number is between a and b (inclusive-ish)
function isBetween(val: number, a: number, b: number, tol = EPSILON): boolean {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return val >= min - tol && val <= max + tol;
}

// Point on Line Segment check
export function isPointOnSegment(pt: Point2D, seg: LineSegment, tol = EPSILON): boolean {
    // Check collinearity via cross product area
    const dxc = pt.x - seg.start.x;
    const dyc = pt.y - seg.start.y;
    const dxl = seg.end.x - seg.start.x;
    const dyl = seg.end.y - seg.start.y;

    const cross = dxc * dyl - dyc * dxl;
    if (Math.abs(cross) > tol) return false;

    // Check bounds
    if (Math.abs(dxl) >= Math.abs(dyl)) {
        return dxl > 0 ?
            (seg.start.x - tol <= pt.x && pt.x <= seg.end.x + tol) :
            (seg.end.x - tol <= pt.x && pt.x <= seg.start.x + tol);
    } else {
        return dyl > 0 ?
            (seg.start.y - tol <= pt.y && pt.y <= seg.end.y + tol) :
            (seg.end.y - tol <= pt.y && pt.y <= seg.start.y + tol);
    }
}

// Line-Line Intersection
// Returns null if parallel/coincident (no single intersection point)
// Returns Point2D if intersection exists, DOES NOT check if inside segments
export function intersectLinesInfinite(l1: LineSegment, l2: LineSegment): Point2D | null {
    const x1 = l1.start.x, y1 = l1.start.y;
    const x2 = l1.end.x, y2 = l1.end.y;
    const x3 = l2.start.x, y3 = l2.start.y;
    const x4 = l2.end.x, y4 = l2.end.y;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < EPSILON) return null; // Parallel

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    // const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1)
    };
}

// Line-Circle Intersection
// Returns 0, 1, or 2 points
export function intersectLineCircleInfinite(line: LineSegment, circle: Circle | ArcSegment): Point2D[] {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;

    const fx = line.start.x - circle.center.x;
    const fy = line.start.y - circle.center.y;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = (fx * fx + fy * fy) - circle.radius * circle.radius;

    let discriminant = b * b - 4 * a * c;
    if (discriminant < -EPSILON) return [];

    discriminant = Math.max(0, discriminant); // clamp small negative noise to 0
    const sqrtDisc = Math.sqrt(discriminant);

    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    const results: Point2D[] = [];

    // t values are ratio along the infinite line starting from line.start
    // 0 = start, 1 = end. But we calculate recursive infinite intersection here,
    // so we accept any t, but we return the point.

    const p1 = { x: line.start.x + t1 * dx, y: line.start.y + t1 * dy };
    results.push(p1);

    if (Math.abs(t1 - t2) > EPSILON) {
        const p2 = { x: line.start.x + t2 * dx, y: line.start.y + t2 * dy };
        results.push(p2);
    }

    return results;
}

// Helper: Normalize angle to [0, 2PI)
function normalizeAngle(a: number): number {
    let res = a % (2 * Math.PI);
    if (res < 0) res += 2 * Math.PI;
    return res;
}

// Helper: Check if angle is within arc sweep
function isAngleInArc(angle: number, arc: ArcSegment): boolean {
    const nAngle = normalizeAngle(angle);
    const nStart = normalizeAngle(arc.startAngle);
    const nEnd = normalizeAngle(arc.endAngle);

    if (Math.abs(nAngle - nStart) < EPSILON || Math.abs(nAngle - nEnd) < EPSILON) return true;

    if (arc.ccw) {
        if (nStart < nEnd) return nAngle > nStart && nAngle < nEnd;
        return nAngle > nStart || nAngle < nEnd;
    } else {
        // Clockwise: swap start/end logic conceptually or just inverse
        // Simplest is to treat as CCW from End to Start?
        // Or just rely on geometry properties.
        // Let's assume standard CCW arcs for simplicity in our system if possible, 
        // but if we support CW, handle it.
        // Actually simplest check: is angle "between" start and end in the direction of travel?

        // Easier: Transform to CCW range
        // If CW, sweep is start -> end going negative.
        // Equivalent to CCW from end -> start.
        if (nEnd < nStart) return nAngle > nEnd && nAngle < nStart;
        return nAngle > nEnd || nAngle < nStart;
    }
}


// --- Main Intersection Router ---

export function intersect(g1: Geometry, g2: Geometry): Point2D[] {
    const points: Point2D[] = [];

    // Line-Line
    if (g1.type === GeometryType.Line && g2.type === GeometryType.Line) {
        const l1 = g1 as LineSegment;
        const l2 = g2 as LineSegment;
        const pt = intersectLinesInfinite(l1, l2);
        if (pt) {
            // Check if within BOTH segments
            if (isPointOnSegment(pt, l1) && isPointOnSegment(pt, l2)) {
                points.push(pt);
            }
        }
    }
    // Line-Circle / Line-Arc
    else if ((g1.type === GeometryType.Line && (g2.type === GeometryType.Circle || g2.type === GeometryType.Arc)) ||
        ((g2.type === GeometryType.Line && (g1.type === GeometryType.Circle || g1.type === GeometryType.Arc)))) {

        const line = g1.type === GeometryType.Line ? g1 as LineSegment : g2 as LineSegment;
        const curve = g1.type === GeometryType.Line ? g2 : g1; // Circle or Arc

        const candidates = intersectLineCircleInfinite(line, curve as any);
        for (const pt of candidates) {
            // Check line bounds
            if (!isPointOnSegment(pt, line)) continue;

            // Check Arc bounds if it's an arc
            if (curve.type === GeometryType.Arc) {
                const angle = Math.atan2(pt.y - (curve as ArcSegment).center.y, pt.x - (curve as ArcSegment).center.x);
                if (!isAngleInArc(angle, curve as ArcSegment)) continue;
            }
            points.push(pt);
        }
    }
    // Circle-Circle / Arc-Arc / Circle-Arc
    // TODO: Implement if needed. For now, we mainly care about Line/Line and Line/Arc for sketches.

    return points;
}
