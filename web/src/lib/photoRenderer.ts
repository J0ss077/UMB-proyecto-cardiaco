// @requirement none
import { EDITOR_SIZE, drawCrop, type CropParams } from "./photoCrop";

export type ViewParams = Omit<CropParams, "imageWidth" | "imageHeight">;

export interface LoadedImage {
    width: number;
    height: number;
    source: CanvasImageSource;
}

// Browser-facing half of the photo editor, kept behind an interface so the
// editor can be tested without a canvas.
export interface PhotoRenderer {
    load: (file: File) => Promise<LoadedImage>;
    draw: (canvas: HTMLCanvasElement, image: LoadedImage, view: ViewParams) => void;
    // Returns the cropped square as a JPEG data URL.
    export: (image: LoadedImage, view: ViewParams) => string;
}

const OUTPUT_QUALITY = 0.85;

const withImage = (image: LoadedImage, view: ViewParams): CropParams => ({
    ...view,
    imageWidth: image.width,
    imageHeight: image.height,
});

async function decode(file: File): Promise<LoadedImage> {
    // The bitmap applies the photo's EXIF orientation, so a phone picture is not drawn sideways.
    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { width: bitmap.width, height: bitmap.height, source: bitmap };
    }
    const url = URL.createObjectURL(file);
    try {
        const element = new Image();
        element.src = url;
        await element.decode();
        return { width: element.naturalWidth, height: element.naturalHeight, source: element };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export const canvasRenderer: PhotoRenderer = {
    load: decode,
    draw(canvas, image, view) {
        drawCrop(canvas.getContext("2d"), image.source, withImage(image, view), EDITOR_SIZE);
    },
    export(image, view) {
        const canvas = document.createElement("canvas");
        canvas.width = EDITOR_SIZE;
        canvas.height = EDITOR_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available");
        drawCrop(ctx, image.source, withImage(image, view), EDITOR_SIZE);
        return canvas.toDataURL("image/jpeg", OUTPUT_QUALITY);
    },
};
