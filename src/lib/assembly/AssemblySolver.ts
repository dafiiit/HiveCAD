
import * as THREE from 'three';
import { AssemblyState, AssemblyComponent, AssemblyMate, MateType, MateConnector } from './types';

export interface SolverResult {
    success: boolean;
    updatedComponents: AssemblyComponent[];
    error?: string;
}

/**
 * AssemblySolver
 * 
 * Solves geometric constraints (Mates) between components in an assembly.
 * Uses an iterative approach to minimize error in mate alignments.
 */
export class AssemblySolver {
    private state: AssemblyState;
    private maxIterations = 50;
    private tolerance = 1e-6;
    private learningRate = 0.5; // For gradient descent step

    constructor(state: AssemblyState) {
        this.state = state;
    }

    /**
     * Updates the solver with new state
     */
    updateState(state: AssemblyState) {
        this.state = state;
    }

    /**
     * Main solve function.
     * Attempts to satisfy all mates by moving non-fixed components.
     */
    solve(): SolverResult {
        // 1. Identification: Separate fixed and free components
        const freeComponents: AssemblyComponent[] = [];
        this.state.components.forEach(comp => {
            if (!comp.fixed) {
                freeComponents.push(comp);
            }
        });

        if (freeComponents.length === 0 && this.state.mates.size > 0) {
            // Nothing to move, but mates exist. Just check if valid.
            // For now, return success.
            return { success: true, updatedComponents: [] };
        }

        // 2. Iterative optimization (Simple Gradient Descent / Relaxation for now)
        // In a real implementation, we would use a Jacobian-based solver (Newton-Raphson)

        let totalError = 0;
        for (let i = 0; i < this.maxIterations; i++) {
            totalError = this.iterationStep();
            if (totalError < this.tolerance) {
                break;
            }
        }

        // 3. Return result
        return {
            success: totalError < this.tolerance,
            updatedComponents: Array.from(this.state.components.values()),
            error: totalError >= this.tolerance ? 'Did not converge' : undefined
        };
    }

    private iterationStep(): number {
        let totalError = 0;

        // Iterate over all mates and apply corrections
        this.state.mates.forEach(mate => {
            if (mate.suppressed) return;

            const c1 = this.state.components.get(mate.connector1.componentId);
            const c2 = this.state.components.get(mate.connector2.componentId);

            if (!c1 || !c2) return;
            if (c1.fixed && c2.fixed) return; // Cannot solve if both fixed

            // Calculate World Transforms of Connectors
            const w1 = this.getConnectorWorldTransform(c1.transform, mate.connector1.localTransform);
            const w2 = this.getConnectorWorldTransform(c2.transform, mate.connector2.localTransform);

            // Solve based on Mate Type
            // We calculate the delta required to satisfy the mate
            // and apply a fraction of it to the free component(s).

            const error = this.solveMate(mate, c1, c2, w1, w2);
            totalError += error;
        });

        return totalError;
    }

    private getConnectorWorldTransform(componentTransform: THREE.Matrix4, localTransform: THREE.Matrix4): THREE.Matrix4 {
        return localTransform.clone().premultiply(componentTransform);
    }

    /**
     * Solves a single mate and applies corrections to valid components.
     * Returns the error magnitude.
     */
    private solveMate(
        mate: AssemblyMate,
        c1: AssemblyComponent,
        c2: AssemblyComponent,
        w1: THREE.Matrix4,
        w2: THREE.Matrix4
    ): number {
        const p1 = new THREE.Vector3();
        const q1 = new THREE.Quaternion();
        const s1 = new THREE.Vector3();
        w1.decompose(p1, q1, s1);

        const p2 = new THREE.Vector3();
        const q2 = new THREE.Quaternion();
        const s2 = new THREE.Vector3();
        w2.decompose(p2, q2, s2);

        let error = 0;

        // --- Position Correction ---
        // Most mates require origins to coincide (or be on a line/plane)
        // For Rigid, Revolute, Cylindrical, Ball -> Origins match

        // Vector from P1 to P2
        const deltaPos = p2.clone().sub(p1);
        const distSq = deltaPos.lengthSq();
        error += distSq;

        // Apply translation correction
        if (distSq > 1e-9) {
            const adjustment = deltaPos.multiplyScalar(this.learningRate);

            if (!c1.fixed && !c2.fixed) {
                // Split between both
                const half = adjustment.multiplyScalar(0.5);
                this.translateComponent(c1, half); // Move c1 towards c2
                this.translateComponent(c2, half.negate()); // Move c2 towards c1
            } else if (!c1.fixed) {
                this.translateComponent(c1, adjustment);
            } else if (!c2.fixed) {
                this.translateComponent(c2, adjustment.negate());
            }
        }

        // --- Rotation Correction ---
        // For Rigid ('Fastened'): Orientations must match exactly
        if (mate.type === 'rigid' || mate.type === 'fastened') {
            // Validation: Q1 should equal Q2
            const angle = q1.angleTo(q2);
            error += angle * angle;

            if (angle > 1e-5) {
                // Slerp towards the target
                if (!c1.fixed && !c2.fixed) {
                    // Meet in middle
                    const targetQ = q1.clone().slerp(q2, 0.5);
                    this.rotateComponent(c1, q1, targetQ);
                    this.rotateComponent(c2, q2, targetQ);
                } else if (!c1.fixed) {
                    this.rotateComponent(c1, q1, q2);
                } else if (!c2.fixed) {
                    this.rotateComponent(c2, q2, q1);
                }
            }
        }

        // TODO: Implement other constraint types (Revolute aka align Z axis)

        return error;
    }

    private translateComponent(comp: AssemblyComponent, delta: THREE.Vector3) {
        const elements = comp.transform.elements;
        elements[12] += delta.x;
        elements[13] += delta.y;
        elements[14] += delta.z;
    }

    private rotateComponent(comp: AssemblyComponent, currentQ: THREE.Quaternion, targetQ: THREE.Quaternion) {
        // Find delta Rotation R such that R * currentQ = targetQ
        // R = targetQ * inverse(currentQ)
        // Actually we have the whole matrix. 
        // Simplified: Just extract position, update quaternion, recompose.

        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        comp.transform.decompose(p, q, s);

        // Interpolate current rotation towards target
        // Note: This is a hacky partial update. In real solver, we apply angular velocity.
        q.slerp(targetQ, this.learningRate);

        comp.transform.compose(p, q, s);
    }
}
