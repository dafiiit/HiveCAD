import React from 'react';
import * as THREE from 'three';
import { CADObject } from '../../../hooks/useCADStore';
import { getCirclePointTexture } from '../../../lib/selection/circlePointTexture';

/**
 * Unified selection colors used by all highlighters.
 */
export const SELECTION_COLORS = {
    hover: '#5ba8f5',
    selected: '#2979e6',
    hoverOpacity: 0.25,
    selectedOpacity: 0.45,
    edgeHover: '#5ba8f5',
    edgeSelected: '#2979e6',
    vertexHover: '#5ba8f5',
    vertexSelected: '#2979e6',
} as const;

/**
 * Highlights selected or hovered faces on a CAD object mesh.
 */
export const FaceHighlighter = ({ object, faceIds, clippingPlanes = [], isHover = false }: {
    object: CADObject;
    faceIds: number[];
    clippingPlanes?: THREE.Plane[];
    isHover?: boolean;
}) => {
    const geometry = React.useMemo(() => {
        if (!object.geometry || !object.faceMapping) return null;

        const subset = new THREE.BufferGeometry();
        subset.setAttribute('position', object.geometry.getAttribute('position'));
        if (object.geometry.attributes.normal) {
            subset.setAttribute('normal', object.geometry.getAttribute('normal'));
        }

        const indices: number[] = [];
        const indexAttr = object.geometry.index;

        if (!indexAttr) return null;

        faceIds.forEach(fid => {
            const mapping = object.faceMapping?.find(m => m.faceId === fid);
            if (mapping) {
                for (let i = 0; i < mapping.count; i++) {
                    indices.push(indexAttr.getX(mapping.start + i));
                }
            }
        });

        if (indices.length === 0) return null;
        subset.setIndex(indices);
        subset.computeBoundingSphere();
        return subset;
    }, [object, faceIds]);

    if (!geometry) return null;

    const color = isHover ? SELECTION_COLORS.hover : SELECTION_COLORS.selected;
    const opacity = isHover ? SELECTION_COLORS.hoverOpacity : SELECTION_COLORS.selectedOpacity;

    return (
        <mesh geometry={geometry}>
            <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                depthTest={false}
                side={THREE.DoubleSide}
                clippingPlanes={clippingPlanes}
            />
        </mesh>
    );
};

/**
 * Highlights selected or hovered edges on a CAD object.
 */
export const EdgeHighlighter = ({ object, edgeIds, clippingPlanes = [], isHover = false }: {
    object: CADObject;
    edgeIds: number[];
    clippingPlanes?: THREE.Plane[];
    isHover?: boolean;
}) => {
    const geometry = React.useMemo(() => {
        if (!object.edgeGeometry || !object.edgeMapping) return null;

        const subset = new THREE.BufferGeometry();
        const posAttr = object.edgeGeometry.getAttribute('position');
        const positions: number[] = [];

        edgeIds.forEach(eid => {
            const mapping = object.edgeMapping?.find(m => m.edgeId === eid);
            if (mapping) {
                for (let i = 0; i < mapping.count; i++) {
                    const vertexIdx = mapping.start + i;
                    positions.push(
                        posAttr.array[vertexIdx * 3],
                        posAttr.array[vertexIdx * 3 + 1],
                        posAttr.array[vertexIdx * 3 + 2]
                    );
                }
            }
        });

        if (positions.length === 0) return null;
        subset.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        subset.computeBoundingSphere();
        return subset;
    }, [object, edgeIds]);

    if (!geometry) return null;

    const color = isHover ? SELECTION_COLORS.edgeHover : SELECTION_COLORS.edgeSelected;

    return (
        <lineSegments geometry={geometry} renderOrder={1}>
            <lineBasicMaterial color={color} linewidth={3} depthTest={false} clippingPlanes={clippingPlanes} />
        </lineSegments>
    );
};

/**
 * Highlights selected or hovered vertices on a CAD object.
 */
export const VertexHighlighter = ({ object, vertexIds, isHover = false }: {
    object: CADObject;
    vertexIds: number[];
    isHover?: boolean;
}) => {
    const circleTexture = React.useMemo(() => getCirclePointTexture(), []);

    const geometry = React.useMemo(() => {
        if (!object.vertexGeometry) return null;
        const posAttr = object.vertexGeometry.getAttribute('position');
        const positions: number[] = [];

        vertexIds.forEach(vid => {
            if (vid < posAttr.count) {
                positions.push(posAttr.getX(vid), posAttr.getY(vid), posAttr.getZ(vid));
            }
        });

        if (positions.length === 0) return null;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeBoundingSphere();
        return geo;
    }, [object.vertexGeometry, vertexIds]);

    if (!geometry) return null;

    const color = isHover ? SELECTION_COLORS.vertexHover : SELECTION_COLORS.vertexSelected;
    const size = isHover ? 14 : 12;

    return (
        <points geometry={geometry}>
            <pointsMaterial
                color={color}
                size={size}
                sizeAttenuation={false}
                depthTest={false}
                transparent
                opacity={0.9}
                map={circleTexture}
                alphaTest={0.5}
            />
        </points>
    );
};

/**
 * Base vertex dots rendered as small circles on all vertices.
 */
export const VertexBasePoints = ({ geometry }: { geometry: THREE.BufferGeometry }) => {
    const circleTexture = React.useMemo(() => getCirclePointTexture(), []);

    return (
        <points geometry={geometry} renderOrder={2}>
            <pointsMaterial
                color="#666666"
                size={7}
                sizeAttenuation={false}
                transparent
                opacity={0.7}
                depthTest={false}
                map={circleTexture}
                alphaTest={0.5}
            />
        </points>
    );
};
