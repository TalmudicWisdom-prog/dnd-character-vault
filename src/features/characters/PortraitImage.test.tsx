import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { centeredPortraitTransform } from "../../domain/models";
import { capturePortraitImageDimensions, isStablePortraitSource, PortraitImage, PortraitViewport } from "./PortraitImage";

describe("portrait image crash containment", () => {
  it("captures natural dimensions synchronously and reads currentTarget only once", () => {
    let targetReads = 0;
    const event = {
      get currentTarget() {
        targetReads += 1;
        if (targetReads > 1) throw new Error("SyntheticEvent was accessed after capture");
        return { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement;
      },
    };

    const dimensions = capturePortraitImageDimensions(event);

    expect(dimensions).toEqual({ naturalWidth: 1600, naturalHeight: 900 });
    expect(targetReads).toBe(1);
  });

  it("treats null targets and zero dimensions as a recoverable load failure", () => {
    expect(capturePortraitImageDimensions(null)).toEqual({ naturalWidth: 0, naturalHeight: 0 });
    expect(capturePortraitImageDimensions({ currentTarget: null })).toEqual({ naturalWidth: 0, naturalHeight: 0 });
    expect(capturePortraitImageDimensions({ currentTarget: { naturalWidth: 0, naturalHeight: -1 } })).toEqual({ naturalWidth: 0, naturalHeight: 0 });
  });

  it("rejects missing and stale object-URL references without throwing", () => {
    expect(isStablePortraitSource("")).toBe(false);
    expect(isStablePortraitSource("blob:https://vault.invalid/stale")).toBe(false);
    expect(isStablePortraitSource("data:image/jpeg;base64,portrait")).toBe(true);

    const markup = renderToStaticMarkup(
      <PortraitImage fallback="AV" src="blob:https://vault.invalid/stale" transform={centeredPortraitTransform()} />,
    );
    expect(markup).toContain("Portrait could not be displayed");
    expect(markup).toContain("AV");
  });

  it("renders the same undistorted contain treatment used by editor and live HUD", () => {
    const markup = renderToStaticMarkup(
      <PortraitImage src="data:image/jpeg;base64,tall" transform={centeredPortraitTransform("contain", 900, 1600)} />,
    );
    expect(markup).toContain('data-portrait-mode="contain"');
    expect(markup).toContain("portrait-image-backdrop");
    expect(markup).toContain("object-fit:contain");
    expect(markup).toContain("portrait-image-foreground");
  });

  it("uses one shared portrait viewport for the editor and saved HUD", () => {
    const transform = { ...centeredPortraitTransform("cover", 900, 1600), zoom: 1.6, offsetY: -0.18 };
    const hud = renderToStaticMarkup(<PortraitViewport className="portrait-frame" image={{ src: "data:image/jpeg;base64,akiva", transform }} surface="hud" />);
    const editor = renderToStaticMarkup(<PortraitViewport className="portrait-editor-frame" image={{ src: "data:image/jpeg;base64,akiva", transform }} surface="editor" />);

    for (const markup of [hud, editor]) {
      expect(markup).toContain("portrait-render-frame");
      expect(markup).toContain('data-portrait-mode="cover"');
      expect(markup).toContain("portrait-image-pan");
      expect(markup).toContain("object-fit:cover;transform:scale(1.6)");
    }
    expect(hud).toContain('data-portrait-surface="hud"');
    expect(editor).toContain('data-portrait-surface="editor"');
  });
});
