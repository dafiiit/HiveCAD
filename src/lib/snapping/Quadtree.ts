/**
 * Quadtree Spatial Index
 * 
 * A 2D spatial index for efficient snap point lookup.
 * Optimized for sketch-sized datasets (hundreds to thousands of points).
 */

import { SnapPoint, QuadtreeBounds } from './types';

const MAX_POINTS_PER_NODE = 8;
const MAX_DEPTH = 8;

/**
 * A node in the quadtree
 */
class QuadtreeNode {
    bounds: QuadtreeBounds;
    points: SnapPoint[] = [];
    children: QuadtreeNode[] | null = null;
    depth: number;

    constructor(bounds: QuadtreeBounds, depth: number = 0) {
        this.bounds = bounds;
        this.depth = depth;
    }

    /**
     * Check if a point is within this node's bounds
     */
    containsPoint(x: number, y: number): boolean {
        return (
            x >= this.bounds.x - this.bounds.halfWidth &&
            x <= this.bounds.x + this.bounds.halfWidth &&
            y >= this.bounds.y - this.bounds.halfHeight &&
            y <= this.bounds.y + this.bounds.halfHeight
        );
    }

    /**
     * Check if bounds intersect with a query rectangle
     */
    intersectsBounds(queryBounds: QuadtreeBounds): boolean {
        return !(
            queryBounds.x - queryBounds.halfWidth > this.bounds.x + this.bounds.halfWidth ||
            queryBounds.x + queryBounds.halfWidth < this.bounds.x - this.bounds.halfWidth ||
            queryBounds.y - queryBounds.halfHeight > this.bounds.y + this.bounds.halfHeight ||
            queryBounds.y + queryBounds.halfHeight < this.bounds.y - this.bounds.halfHeight
        );
    }

    /**
     * Subdivide this node into 4 children
     */
    subdivide(): void {
        const { x, y, halfWidth, halfHeight } = this.bounds;
        const newHalfWidth = halfWidth / 2;
        const newHalfHeight = halfHeight / 2;

        this.children = [
            // NE
            new QuadtreeNode({
                x: x + newHalfWidth,
                y: y + newHalfHeight,
                halfWidth: newHalfWidth,
                halfHeight: newHalfHeight,
            }, this.depth + 1),
            // NW
            new QuadtreeNode({
                x: x - newHalfWidth,
                y: y + newHalfHeight,
                halfWidth: newHalfWidth,
                halfHeight: newHalfHeight,
            }, this.depth + 1),
            // SW
            new QuadtreeNode({
                x: x - newHalfWidth,
                y: y - newHalfHeight,
                halfWidth: newHalfWidth,
                halfHeight: newHalfHeight,
            }, this.depth + 1),
            // SE
            new QuadtreeNode({
                x: x + newHalfWidth,
                y: y - newHalfHeight,
                halfWidth: newHalfWidth,
                halfHeight: newHalfHeight,
            }, this.depth + 1),
        ];

        // Redistribute existing points to children
        for (const point of this.points) {
            for (const child of this.children) {
                if (child.containsPoint(point.x, point.y)) {
                    child.insert(point);
                    break;
                }
            }
        }
        this.points = [];
    }

    /**
     * Insert a snap point into this node
     */
    insert(point: SnapPoint): boolean {
        if (!this.containsPoint(point.x, point.y)) {
            return false;
        }

        if (this.children === null) {
            if (this.points.length < MAX_POINTS_PER_NODE || this.depth >= MAX_DEPTH) {
                this.points.push(point);
                return true;
            }
            this.subdivide();
        }

        for (const child of this.children!) {
            if (child.insert(point)) {
                return true;
            }
        }

        // Fallback: add to this node if no child accepts it
        this.points.push(point);
        return true;
    }

    /**
     * Query all points within a rectangular bounds
     */
    query(queryBounds: QuadtreeBounds, result: SnapPoint[]): void {
        if (!this.intersectsBounds(queryBounds)) {
            return;
        }

        for (const point of this.points) {
            if (
                point.x >= queryBounds.x - queryBounds.halfWidth &&
                point.x <= queryBounds.x + queryBounds.halfWidth &&
                point.y >= queryBounds.y - queryBounds.halfHeight &&
                point.y <= queryBounds.y + queryBounds.halfHeight
            ) {
                result.push(point);
            }
        }

        if (this.children) {
            for (const child of this.children) {
                child.query(queryBounds, result);
            }
        }
    }

    /**
     * Get count of all points in this subtree
     */
    count(): number {
        let total = this.points.length;
        if (this.children) {
            for (const child of this.children) {
                total += child.count();
            }
        }
        return total;
    }
}

/**
 * Quadtree spatial index for snap points
 */
export class Quadtree {
    private root: QuadtreeNode;
    private defaultBounds: QuadtreeBounds;

    constructor(bounds?: QuadtreeBounds) {
        // Default to a 1000x1000 area centered at origin
        this.defaultBounds = bounds || {
            x: 0,
            y: 0,
            halfWidth: 500,
            halfHeight: 500,
        };
        this.root = new QuadtreeNode(this.defaultBounds);
    }

    /**
     * Insert a snap point into the tree
     */
    insert(point: SnapPoint): void {
        // If point is outside bounds, expand the tree
        if (!this.root.containsPoint(point.x, point.y)) {
            this.expandToContain(point.x, point.y);
        }
        this.root.insert(point);
    }

    /**
     * Expand tree bounds to contain a point
     */
    private expandToContain(x: number, y: number): void {
        while (!this.root.containsPoint(x, y)) {
            const { halfWidth, halfHeight } = this.root.bounds;
            const newBounds: QuadtreeBounds = {
                x: this.root.bounds.x,
                y: this.root.bounds.y,
                halfWidth: halfWidth * 2,
                halfHeight: halfHeight * 2,
            };

            const oldRoot = this.root;
            this.root = new QuadtreeNode(newBounds);

            // Re-insert all points from old tree
            const allPoints: SnapPoint[] = [];
            oldRoot.query({
                x: oldRoot.bounds.x,
                y: oldRoot.bounds.y,
                halfWidth: oldRoot.bounds.halfWidth,
                halfHeight: oldRoot.bounds.halfHeight,
            }, allPoints);

            for (const point of allPoints) {
                this.root.insert(point);
            }
        }
    }

    /**
     * Query all points within a rectangular region
     */
    query(bounds: QuadtreeBounds): SnapPoint[] {
        const result: SnapPoint[] = [];
        this.root.query(bounds, result);
        return result;
    }

    /**
     * Query all points within a circular radius
     */
    queryRadius(x: number, y: number, radius: number): SnapPoint[] {
        // First get all points in bounding box
        const candidates = this.query({
            x,
            y,
            halfWidth: radius,
            halfHeight: radius,
        });

        // Filter to actual circle
        const radiusSquared = radius * radius;
        return candidates.filter(point => {
            const dx = point.x - x;
            const dy = point.y - y;
            return dx * dx + dy * dy <= radiusSquared;
        });
    }

    /**
     * Find the nearest snap point within a radius
     */
    findNearest(x: number, y: number, radius: number): SnapPoint | null {
        const candidates = this.queryRadius(x, y, radius);

        if (candidates.length === 0) {
            return null;
        }

        let nearest: SnapPoint | null = null;
        let nearestDistSquared = Infinity;
        let nearestPriority = Infinity;

        for (const point of candidates) {
            const dx = point.x - x;
            const dy = point.y - y;
            const distSquared = dx * dx + dy * dy;

            // First compare by priority, then by distance
            if (
                point.priority < nearestPriority ||
                (point.priority === nearestPriority && distSquared < nearestDistSquared)
            ) {
                nearest = point;
                nearestDistSquared = distSquared;
                nearestPriority = point.priority;
            }
        }

        return nearest;
    }

    /**
     * Clear all points from the tree
     */
    clear(): void {
        this.root = new QuadtreeNode(this.defaultBounds);
    }

    /**
     * Rebuild tree with new points
     */
    rebuild(points: SnapPoint[]): void {
        this.clear();
        for (const point of points) {
            this.insert(point);
        }
    }

    /**
     * Get total number of points in tree
     */
    get size(): number {
        return this.root.count();
    }
}
