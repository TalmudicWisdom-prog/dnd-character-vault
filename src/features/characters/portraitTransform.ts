import type { PortraitTransform } from "../../domain/models";
import { centeredPortraitTransform } from "../../domain/models";

export const minimumPortraitZoom = 1;
export const maximumPortraitZoom = 8;

export type PortraitGeometry = {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
};

export function fitImageWithoutCropping(width: number, height: number, maximumDimension: number) {
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function portraitOffsetBounds(zoom: number, geometry: PortraitGeometry) {
  const { frameWidth, frameHeight, imageWidth, imageHeight } = geometry;
  if (!frameWidth || !frameHeight || !imageWidth || !imageHeight) return { x: 0, y: 0 };
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const renderedWidth = imageWidth * coverScale * zoom;
  const renderedHeight = imageHeight * coverScale * zoom;
  return {
    x: Math.max(0, (renderedWidth - frameWidth) / 2 / frameWidth),
    y: Math.max(0, (renderedHeight - frameHeight) / 2 / frameHeight),
  };
}

export function clampPortraitTransform(transform: PortraitTransform, geometry: PortraitGeometry): PortraitTransform {
  const zoom = Math.min(maximumPortraitZoom, Math.max(minimumPortraitZoom, transform.zoom));
  const bounds = portraitOffsetBounds(zoom, geometry);
  return {
    ...transform,
    zoom,
    offsetX: Math.min(bounds.x, Math.max(-bounds.x, transform.offsetX)),
    offsetY: Math.min(bounds.y, Math.max(-bounds.y, transform.offsetY)),
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

export function initialPortraitTransform() {
  return centeredPortraitTransform();
}
