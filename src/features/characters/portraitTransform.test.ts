import { describe, expect, it } from "vitest";
import { centeredPortraitTransform } from "../../domain/models";
import {
  clampPortraitTransform,
  fitImageWithoutCropping,
  initialPortraitTransform,
  panPortrait,
  portraitBaseScale,
  portraitFrameAspectForViewport,
  portraitOffsetBounds,
  portraitRenderedSize,
  smartPortraitMode,
  switchPortraitMode,
  zoomPortrait,
  type PortraitGeometry,
} from "./portraitTransform";

const landscape: PortraitGeometry = { frameWidth: 400, frameHeight: 500, imageWidth: 1600, imageHeight: 900 };
const portrait: PortraitGeometry = { frameWidth: 400, frameHeight: 500, imageWidth: 900, imageHeight: 1600 };
const tallInWideFrame: PortraitGeometry = { frameWidth: 400, frameHeight: 225, imageWidth: 900, imageHeight: 1600 };

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
    expect(initialPortraitTransform()).toEqual({ mode: "cover", zoom: 1, offsetX: 0, offsetY: 0, naturalWidth: null, naturalHeight: null, version: 1, updatedAt: null });
    expect(initialPortraitTransform("contain", 900, 1600)).toMatchObject({ mode: "contain", zoom: 1, offsetX: 0, offsetY: 0, naturalWidth: 900, naturalHeight: 1600 });
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

  it("uses cover scale for Fill Frame and contain scale for Show Full Image", () => {
    expect(portraitBaseScale("cover", tallInWideFrame)).toBeCloseTo(400 / 900);
    expect(portraitBaseScale("contain", tallInWideFrame)).toBeCloseTo(225 / 1600);
    expect(portraitBaseScale("contain", tallInWideFrame)).toBeLessThan(portraitBaseScale("cover", tallInWideFrame));
  });

  it("shows a complete tall image in a wide frame without stretching", () => {
    const rendered = portraitRenderedSize("contain", 1, tallInWideFrame);
    expect(rendered.height).toBeCloseTo(225);
    expect(rendered.width).toBeCloseTo(126.5625);
    expect(rendered.width / rendered.height).toBeCloseTo(900 / 1600);
    expect(rendered.width).toBeLessThanOrEqual(tallInWideFrame.frameWidth);
    expect(rendered.height).toBeLessThanOrEqual(tallInWideFrame.frameHeight);
  });

  it("switches base modes safely and resets mode-specific zoom and offsets", () => {
    const cropped = { ...centeredPortraitTransform("cover", 900, 1600), zoom: 2.4, offsetY: -0.3 };
    const contained = switchPortraitMode(cropped, "contain", tallInWideFrame);
    expect(contained).toMatchObject({ mode: "contain", zoom: 1, offsetX: 0, offsetY: 0, naturalWidth: 900, naturalHeight: 1600 });
    expect(switchPortraitMode(contained, "cover", tallInWideFrame)).toMatchObject({ mode: "cover", zoom: 1, offsetX: 0, offsetY: 0 });
  });

  it("allows contained artwork to move within padding without losing it off-screen", () => {
    const transform = centeredPortraitTransform("contain", 900, 1600);
    const bounds = portraitOffsetBounds(1, tallInWideFrame, "contain");
    expect(bounds.x).toBeGreaterThan(0);
    expect(bounds.y).toBe(0);
    const moved = panPortrait(transform, 10000, 10000, tallInWideFrame);
    expect(moved.offsetX).toBeCloseTo(bounds.x);
    expect(moved.offsetY).toBe(0);
  });

  it("chooses Show Full Image for dramatic aspect mismatch and Fill Frame for similar images", () => {
    expect(smartPortraitMode(900, 1600, 16 / 9)).toBe("contain");
    expect(smartPortraitMode(800, 1000, 4 / 5)).toBe("cover");
    expect(portraitFrameAspectForViewport(390)).toBeCloseTo(16 / 9);
    expect(portraitFrameAspectForViewport(768)).toBeCloseTo(4 / 5);
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

  it("produces identical iPad crop composition at editor and HUD sizes", () => {
    const editor: PortraitGeometry = { frameWidth: 360, frameHeight: 450, imageWidth: 900, imageHeight: 1600 };
    const hud: PortraitGeometry = { frameWidth: 192, frameHeight: 240, imageWidth: 900, imageHeight: 1600 };
    const saved = { ...centeredPortraitTransform("cover", 900, 1600), zoom: 1.6, offsetX: 0, offsetY: -0.18 };

    const editorBounds = portraitOffsetBounds(saved.zoom, editor, saved.mode);
    const hudBounds = portraitOffsetBounds(saved.zoom, hud, saved.mode);
    expect(editorBounds.x).toBeCloseTo(hudBounds.x);
    expect(editorBounds.y).toBeCloseTo(hudBounds.y);
    expect(clampPortraitTransform(saved, editor)).toEqual(clampPortraitTransform(saved, hud));

    const editorRendered = portraitRenderedSize(saved.mode, saved.zoom, editor);
    const hudRendered = portraitRenderedSize(saved.mode, saved.zoom, hud);
    expect(editorRendered.width / editor.frameWidth).toBeCloseTo(hudRendered.width / hud.frameWidth);
    expect(editorRendered.height / editor.frameHeight).toBeCloseTo(hudRendered.height / hud.frameHeight);
    expect(portraitFrameAspectForViewport(768)).toBeCloseTo(editor.frameWidth / editor.frameHeight);
  });
});
