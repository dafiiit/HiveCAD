import * as THREE from 'three';

/**
 * Creates a circular point sprite texture for rendering vertex markers.
 * Uses a canvas to draw a filled circle with an anti-aliased edge,
 * producing smooth round dots instead of the default square points.
 */
let cachedTexture: THREE.Texture | null = null;

export function getCirclePointTexture(): THREE.Texture {
    if (cachedTexture) return cachedTexture;

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Clear with transparent background
    ctx.clearRect(0, 0, size, size);

    // Draw a filled circle
    const center = size / 2;
    const radius = size / 2 - 2; // Small margin for anti-aliasing

    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    cachedTexture = texture;
    return texture;
}
