// @requirement none
// Geometry of the profile photo editor. The photo is drawn into a square of
// `size` pixels: centered, rotated, scaled and shifted by the user. The image
// must always cover the whole square, so the base scale grows with the tilt and
// the shift is clamped to the positions that still leave no empty corner.

export interface CropParams {
    imageWidth: number;
    imageHeight: number;
    // Extra zoom on top of the scale that just covers the square (1 or more).
    zoom: number;
    // Degrees, clockwise.
    rotation: number;
    // Shift of the image center from the center of the square, in square pixels.
    offsetX: number;
    offsetY: number;
}

export const EDITOR_SIZE = 256;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function normalizeRotation(degrees: number): number {
    const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
    // The wrap maps +180 to -180; keep a half turn as +180 like the input.
    return wrapped === -180 && degrees > 0 ? 180 : wrapped;
}

// Smallest scale at which the image, tilted by `rotation`, covers the square.
export function baseScale(params: CropParams, size: number): number {
    const angle = radians(params.rotation);
    const spread = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle));
    return (size * spread) / Math.min(params.imageWidth, params.imageHeight);
}

export const totalScale = (params: CropParams, size: number) => baseScale(params, size) * params.zoom;

// True when every corner of the square falls inside the image.
export function covers(params: CropParams, size: number): boolean {
    const scale = totalScale(params, size);
    const halfWidth = (params.imageWidth * scale) / 2;
    const halfHeight = (params.imageHeight * scale) / 2;
    const angle = radians(params.rotation);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const epsilon = 0.01;
    return [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
    ].every(([sx, sy]) => {
        // Corner relative to the image center, then into the image's own axes.
        const dx = (sx as number) * (size / 2) - params.offsetX;
        const dy = (sy as number) * (size / 2) - params.offsetY;
        const x = dx * cos + dy * sin;
        const y = -dx * sin + dy * cos;
        return Math.abs(x) <= halfWidth + epsilon && Math.abs(y) <= halfHeight + epsilon;
    });
}

// Pulls the shift back along its own direction until the image covers the square.
export function clampOffset(params: CropParams, size: number): { offsetX: number; offsetY: number } {
    const wanted = { offsetX: params.offsetX, offsetY: params.offsetY };
    if (covers(params, size)) return wanted;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 40; step += 1) {
        const middle = (low + high) / 2;
        const trial = { ...params, offsetX: wanted.offsetX * middle, offsetY: wanted.offsetY * middle };
        if (covers(trial, size)) low = middle;
        else high = middle;
    }
    return { offsetX: wanted.offsetX * low, offsetY: wanted.offsetY * low };
}

// Moves the image by (dx, dy) as far as it can go while still covering the square.
// Each axis is limited on its own, so dragging along an edge slides instead of sticking.
export function moveBy(params: CropParams, dx: number, dy: number, size: number): { offsetX: number; offsetY: number } {
    const along = (current: CropParams, axis: "offsetX" | "offsetY", delta: number): number => {
        const wanted = { ...current, [axis]: current[axis] + delta };
        if (covers(wanted, size)) return wanted[axis];
        let low = 0;
        let high = 1;
        for (let step = 0; step < 40; step += 1) {
            const middle = (low + high) / 2;
            if (covers({ ...current, [axis]: current[axis] + delta * middle }, size)) low = middle;
            else high = middle;
        }
        return current[axis] + delta * low;
    };
    const offsetX = along(params, "offsetX", dx);
    const offsetY = along({ ...params, offsetX }, "offsetY", dy);
    return { offsetX, offsetY };
}

export function drawCrop(ctx: CanvasRenderingContext2D | null, source: CanvasImageSource, params: CropParams, size: number): void {
    if (!ctx) return;
    const scale = totalScale(params, size);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2 + params.offsetX, size / 2 + params.offsetY);
    ctx.rotate(radians(params.rotation));
    ctx.scale(scale, scale);
    ctx.drawImage(source, -params.imageWidth / 2, -params.imageHeight / 2);
    ctx.restore();
}
