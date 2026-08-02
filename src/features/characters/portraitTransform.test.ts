import { describe, expect, it } from "vitest";
import { centeredPortraitTransform } from "../../domain/models";
import {
  clampPortraitTransform,
  fitImageWithoutCropping,
  initialPortraitTransform,
  panPortrait,
  portraitOffsetBounds,
  zoomPortrait,
  type PortraitGeometry,
} from "./portraitTransform";

const landscape: PortraitGeometry = { frameWidth: 400, frameHeight: 500, imageWidth: 1600, imageHeight: 900 };
const portrait: PortraitGeometry = { frameWidth: 400, frameHeight: 500, imageWidth: 900, imageHeight: 1600 };

describe("portrait positioning and cropping", () => {
  it("uses smart cover framing: landscape fits height and portrait fits width", () => {
    expect(portraitOffsetBounds(1, landscape)).toEqual({ x: expect.any(Number), y: 0 });
    expect(portraitOffsetBounds(1, landscape).x).toBeGreaterThan(0);
    expect(portraitOffsetBounds(1, portrait)).toEqual({ x: 0, y: expect.any(Number) });
    expect(portraitOffsetBounds(1, portrait).y).toBeGreaterThan(0);
  });

  it("updates the preview transform for mouse or touch dragging and prevents blank edges", () => {
    const moved = panPortrait(centeredPortraitTransform(), 120, 40, landscape);
    const bounds = portraitOffsetBounds(1, landscape);
    expect(moved.offsetX).toBeCloseTo(0.3);
    expect(moved.offsetY).toBe(0);
    expect(moved.offsetX).toBeLessThanOrEqual(bounds.x);
    expect(panPortrait(moved, 10000, 0, landscape).offsetX).toBe(bounds.x);
  });

  it("updates zoom for pinch, wheel, buttons, and keyboard while retaining the focal point", () => {
    const zoomed = zoomPortrait(centeredPortraitTransform(), 2, 0.25, -0.1, landscape);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.offsetX).toBeCloseTo(-0.25);
    expect(zoomed.offsetY).toBeCloseTo(0.1);
    expect(zoomPortrait(zoomed, 99, 0, 0, landscape).zoom).toBe(8);
  });

  it("resets to the non-destructive initial framing", () => {
    expect(initialPortraitTransform()).toEqual({ zoom: 1, offsetX: 0, offsetY: 0, version: 1, updatedAt: null });
  });

  it("falls back safely for non-finite zoom and offsets", () => {
    const invalid = clampPortraitTransform({
      ...centeredPortraitTransform(),
      zoom: Number.NaN,
      offsetX: Number.POSITIVE_INFINITY,
      offsetY: Number.NaN,
    }, landscape);
    expect(invalid).toEqual(centeredPortraitTransform());
  });

  it("keeps image proportions instead of producing a square crop", () => {
    expect(fitImageWithoutCropping(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
    expect(fitImageWithoutCropping(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
  });

  it("clamps the same normalized transform safely for responsive HUD dimensions", () => {
    const saved = { ...centeredPortraitTransform(), zoom: 2.25, offsetX: 0.4, offsetY: -0.2 };
    const phonePortrait = clampPortraitTransform(saved, { ...landscape, frameWidth: 300, frameHeight: 400 });
    const phoneLandscape = clampPortraitTransform(saved, { ...landscape, frameWidth: 640, frameHeight: 360 });
    const desktop = clampPortraitTransform(saved, landscape);
    for (const result of [phonePortrait, phoneLandscape, desktop]) {
      expect(result.zoom).toBe(2.25);
      expect(Number.isFinite(result.offsetX)).toBe(true);
      expect(Number.isFinite(result.offsetY)).toBe(true);
    }
  });
});
