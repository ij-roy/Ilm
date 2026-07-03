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
