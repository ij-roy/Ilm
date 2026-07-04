import { MediaKind, MediaLocation, buildMediaPath } from "@ilm/repository";
import { AppError, Result, err, ok, validationError } from "@ilm/shared";

export type MediaInput = {
  readonly kind: MediaKind;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly alt?: string;
  readonly caption?: string;
};

export type MediaAsset = MediaInput & {
  readonly location: MediaLocation;
};

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain"
]);

export function planMediaAsset(input: MediaInput): Result<MediaAsset, AppError> {
  if (!allowedMimeTypes.has(input.mimeType)) {
    return err(validationError("Unsupported media type", { mimeType: input.mimeType }));
  }

  if (input.sizeBytes <= 0) {
    return err(validationError("Media file is empty"));
  }

  return ok({
    ...input,
    location: buildMediaPath(input.kind, input.fileName)
  });
}

/**
 * Converts an image file to WebP format using HTML5 Canvas.
 * This function must only be called in a browser environment.
 */
export async function convertImageToWebP(file: File, maxWidth = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Failed to get canvas context"));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas toBlob failed"));
          },
          "image/webp",
          0.85
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
