import type { PortraitFramingMode, PortraitTransform } from "../../domain/models";
import { centeredPortraitTransform } from "../../domain/models";

export const minimumPortraitZoom = 1;
export const maximumPortraitZoom = 8;

export type PortraitGeometry = {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
};

export type PortraitTransformValidation = {
  transform: PortraitTransform;
  valid: boolean;
};

function validOptionalDimension(value: unknown) {
  return value == null || (Number.isInteger(value) && Number(value) > 0);
}

export function validatePortraitTransform(transform?: Partial<PortraitTransform> | null): PortraitTransformValidation {
  const mode: PortraitFramingMode = transform?.mode === "contain" ? "contain" : "cover";
  const modeValid = transform?.mode == null || transform.mode === "cover" || transform.mode === "contain";
  const valid = Boolean(
    transform
    && modeValid
    && Number.isFinite(transform.zoom)
    && Number(transform.zoom) > 0
    && Number.isFinite(transform.offsetX)
    && Number.isFinite(transform.offsetY)
    && validOptionalDimension(transform.naturalWidth)
    && validOptionalDimension(transform.naturalHeight),
  );
  if (!valid) return { transform: centeredPortraitTransform(mode), valid: false };
  return {
    valid: true,
    transform: {
      mode,
      zoom: Math.min(maximumPortraitZoom, Math.max(minimumPortraitZoom, Number(transform!.zoom))),
      offsetX: Number(transform!.offsetX),
      offsetY: Number(transform!.offsetY),
      naturalWidth: typeof transform!.naturalWidth === "number" ? transform!.naturalWidth : null,
      naturalHeight: typeof transform!.naturalHeight === "number" ? transform!.naturalHeight : null,
      version: Number.isInteger(transform!.version) && Number(transform!.version) > 0 ? Number(transform!.version) : 1,
      updatedAt: typeof transform!.updatedAt === "string" ? transform!.updatedAt : null,
    },
  };
}

export function fitImageWithoutCropping(width: number, height: number, maximumDimension: number) {
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function validPortraitGeometry(geometry: PortraitGeometry) {
  return [geometry.frameWidth, geometry.frameHeight, geometry.imageWidth, geometry.imageHeight]
    .every((value) => Number.isFinite(value) && value > 0);
}

export function portraitBaseScale(mode: PortraitFramingMode, geometry: PortraitGeometry) {
  if (!validPortraitGeometry(geometry)) return 0;
  const widthScale = geometry.frameWidth / geometry.imageWidth;
  const heightScale = geometry.frameHeight / geometry.imageHeight;
  return mode === "contain" ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale);
}

export function portraitRenderedSize(mode: PortraitFramingMode, zoom: number, geometry: PortraitGeometry) {
  const baseScale = portraitBaseScale(mode, geometry);
  return {
    width: geometry.imageWidth * baseScale * zoom,
    height: geometry.imageHeight * baseScale * zoom,
  };
}

export function portraitOffsetBounds(zoom: number, geometry: PortraitGeometry, mode: PortraitFramingMode = "cover") {
  if (!validPortraitGeometry(geometry)) return { x: 0, y: 0 };
  const rendered = portraitRenderedSize(mode, zoom, geometry);
  if (mode === "cover") {
    return {
      x: Math.max(0, (rendered.width - geometry.frameWidth) / 2 / geometry.frameWidth),
      y: Math.max(0, (rendered.height - geometry.frameHeight) / 2 / geometry.frameHeight),
    };
  }
  // Contained images may move within letterboxing. Once user zoom makes an axis
  // overflow, allow panning through that crop without letting the image disappear.
  return {
    x: Math.abs(rendered.width - geometry.frameWidth) / 2 / geometry.frameWidth,
    y: Math.abs(rendered.height - geometry.frameHeight) / 2 / geometry.frameHeight,
  };
}

export function clampPortraitTransform(transform: PortraitTransform, geometry: PortraitGeometry): PortraitTransform {
  const validated = validatePortraitTransform(transform).transform;
  const bounds = portraitOffsetBounds(validated.zoom, geometry, validated.mode);
  return {
    ...validated,
    offsetX: Math.min(bounds.x, Math.max(-bounds.x, validated.offsetX)),
    offsetY: Math.min(bounds.y, Math.max(-bounds.y, validated.offsetY)),
  };
}

export function panPortrait(transform: PortraitTransform, deltaX: number, deltaY: number, geometry: PortraitGeometry) {
  if (!geometry.frameWidth || !geometry.frameHeight) return transform;
  return clampPortraitTransform({
    ...transform,
    offsetX: transform.offsetX + deltaX / geometry.frameWidth,
    offsetY: transform.offsetY + deltaY / geometry.frameHeight,
  }, geometry);
}

export function zoomPortrait(
  transform: PortraitTransform,
  zoom: number,
  focusX: number,
  focusY: number,
  geometry: PortraitGeometry,
) {
  const nextZoom = Math.min(maximumPortraitZoom, Math.max(minimumPortraitZoom, zoom));
  const ratio = nextZoom / transform.zoom;
  return clampPortraitTransform({
    ...transform,
    zoom: nextZoom,
    offsetX: focusX - ratio * (focusX - transform.offsetX),
    offsetY: focusY - ratio * (focusY - transform.offsetY),
  }, geometry);
}

export function initialPortraitTransform(mode: PortraitFramingMode = "cover", naturalWidth: number | null = null, naturalHeight: number | null = null) {
  return centeredPortraitTransform(mode, naturalWidth, naturalHeight);
}

export function switchPortraitMode(transform: PortraitTransform, mode: PortraitFramingMode, geometry: PortraitGeometry) {
  return clampPortraitTransform(initialPortraitTransform(mode, transform.naturalWidth, transform.naturalHeight), geometry);
}

export function smartPortraitMode(imageWidth: number, imageHeight: number, frameAspectRatio: number, dramaticMismatch = 1.5): PortraitFramingMode {
  if (![imageWidth, imageHeight, frameAspectRatio].every((value) => Number.isFinite(value) && value > 0)) return "cover";
  const imageAspectRatio = imageWidth / imageHeight;
  const mismatch = Math.max(imageAspectRatio / frameAspectRatio, frameAspectRatio / imageAspectRatio);
  return mismatch >= dramaticMismatch ? "contain" : "cover";
}

export function portraitFrameAspectForViewport(viewportWidth: number) {
  if (viewportWidth <= 430) return 16 / 9;
  if (viewportWidth <= 680) return 3 / 4;
  return 4 / 5;
}
