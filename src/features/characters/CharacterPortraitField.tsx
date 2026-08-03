import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import type { PortraitFramingMode, PortraitTransform } from "../../domain/models";
import { centeredPortraitTransform } from "../../domain/models";
import { PortraitViewport } from "./PortraitImage";
import {
  clampPortraitTransform,
  fitImageWithoutCropping,
  initialPortraitTransform,
  maximumPortraitZoom,
  panPortrait,
  portraitFrameAspectForViewport,
  smartPortraitMode,
  switchPortraitMode,
  validatePortraitTransform,
  zoomPortrait,
  type PortraitGeometry,
} from "./portraitTransform";

const maxSourceBytes = 8 * 1024 * 1024;
const maxStoredDataUrlLength = 1_500_000;
const maximumStoredDimension = 2048;

export type PortraitValue = {
  imageDataUrl: string;
  imageId: string;
  transform: PortraitTransform;
};

type PreparedPortrait = {
  dataUrl: string;
  height: number;
  width: number;
};

type EditorCandidate = PreparedPortrait & { imageId: string };

function characterInitial(name: string) {
  return name.trim().slice(0, 1).toLocaleUpperCase() || "V";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Could not read that image.")));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not preview that image type.")));
    image.src = src;
  });
}

/** Preserves the complete composition. Large files are resized proportionally, never cropped. */
export async function preparePortraitSource(file: File): Promise<PreparedPortrait> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > maxSourceBytes) throw new Error("Choose an image under 8 MB.");

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  if (originalDataUrl.length <= maxStoredDataUrlLength) {
    return { dataUrl: originalDataUrl, width: image.naturalWidth, height: image.naturalHeight };
  }

  let dimensions = fitImageWithoutCropping(image.naturalWidth, image.naturalHeight, maximumStoredDimension);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image resizing is unavailable on this device.");
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, dimensions.width, dimensions.height);
    const dataUrl = canvas.toDataURL("image/jpeg", Math.max(0.68, 0.9 - attempt * 0.035));
    if (dataUrl.length <= maxStoredDataUrlLength) return { dataUrl, ...dimensions };
    dimensions = fitImageWithoutCropping(dimensions.width, dimensions.height, Math.round(Math.max(dimensions.width, dimensions.height) * 0.82));
  }

  throw new Error("That image is too large to save locally. Try a smaller picture.");
}

type CharacterPortraitFieldProps = {
  characterName: string;
  compact?: boolean;
  imageId?: string;
  label?: string;
  onChange: (portrait: PortraitValue) => void | Promise<void>;
  suppressed?: boolean;
  transform?: PortraitTransform;
  value: string;
};

type PointerPosition = { x: number; y: number };
type PinchState = {
  centerX: number;
  centerY: number;
  distance: number;
  transform: PortraitTransform;
};

function distanceBetween(first: PointerPosition, second: PointerPosition) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function centerBetween(first: PointerPosition, second: PointerPosition) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function CharacterPortraitField({
  characterName,
  compact = false,
  imageId = "",
  label = "Character picture",
  onChange,
  suppressed = false,
  transform = centeredPortraitTransform(),
  value,
}: CharacterPortraitFieldProps) {
  const inputId = useId();
  const replacementInputId = useId();
  const editorFrameRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const lastPointerRef = useRef<PointerPosition & { at: number; velocityX: number; velocityY: number }>({ x: 0, y: 0, at: 0, velocityX: 0, velocityY: 0 });
  const pointerStartRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const pinchRef = useRef<PinchState | null>(null);
  const transformRef = useRef(transform);
  const momentumFrameRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState("");
  const [candidate, setCandidate] = useState<EditorCandidate | null>(null);
  const [draftTransform, setDraftTransform] = useState<PortraitTransform>(transform);
  const [isResetting, setIsResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [portraitWarning, setPortraitWarning] = useState("");
  const [locallySuppressed, setLocallySuppressed] = useState(suppressed);
  const safeTransform = validatePortraitTransform(transform);

  const geometry = (): PortraitGeometry => {
    const bounds = editorFrameRef.current?.getBoundingClientRect();
    return {
      frameWidth: bounds?.width ?? 0,
      frameHeight: bounds?.height ?? 0,
      imageWidth: candidate?.width ?? 0,
      imageHeight: candidate?.height ?? 0,
    };
  };

  const setTransform = (next: PortraitTransform) => {
    transformRef.current = next;
    setDraftTransform(next);
  };

  const stopMomentum = () => {
    if (momentumFrameRef.current != null) cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
  };

  const resetPosition = () => {
    stopMomentum();
    setIsResetting(true);
    setTransform(initialPortraitTransform(
      transformRef.current.mode,
      candidate?.width ?? transformRef.current.naturalWidth,
      candidate?.height ?? transformRef.current.naturalHeight,
    ));
    setStatus(`${transformRef.current.mode === "contain" ? "Show Full Image" : "Fill Frame"} position reset to centered 100%.`);
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setIsResetting(false), 220);
  };

  useEffect(() => () => {
    stopMomentum();
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
  }, []);

  useEffect(() => {
    if (suppressed) setLocallySuppressed(true);
  }, [suppressed]);

  useEffect(() => {
    if (!safeTransform.valid && value) setPortraitWarning("Portrait framing was reset because its saved settings were invalid.");
  }, [safeTransform.valid, value]);

  useEffect(() => {
    if (!candidate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => editorFrameRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [candidate]);

  const openExistingEditor = async () => {
    if (!value) return;
    setStatus("Opening portrait editor...");
    try {
      const image = await loadImage(value);
      setTransform({ ...safeTransform.transform, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
      setCandidate({ dataUrl: value, imageId: imageId || crypto.randomUUID(), width: image.naturalWidth, height: image.naturalHeight });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open that picture.");
    }
  };

  const choosePortrait = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStatus("Preparing the full picture...");
    try {
      const prepared = await preparePortraitSource(file);
      stopMomentum();
      const mode = smartPortraitMode(prepared.width, prepared.height, portraitFrameAspectForViewport(window.innerWidth));
      setTransform(initialPortraitTransform(mode, prepared.width, prepared.height));
      setCandidate({ ...prepared, imageId: crypto.randomUUID() });
      setStatus(mode === "contain" ? "Show Full Image selected so the complete artwork is visible." : "Fill Frame selected. Position the portrait, then save.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not prepare that picture.");
    }
  };

  const cancelEditor = () => {
    stopMomentum();
    setCandidate(null);
    setTransform(safeTransform.transform);
    setStatus(value ? "Existing portrait kept unchanged." : "No portrait was saved.");
  };

  const savePortrait = async () => {
    if (!candidate || saving) return;
    setSaving(true);
    try {
      const savedTransform = {
        ...clampPortraitTransform(transformRef.current, geometry()),
        naturalWidth: candidate.width,
        naturalHeight: candidate.height,
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      await onChange({ imageDataUrl: candidate.dataUrl, imageId: candidate.imageId, transform: savedTransform });
      setCandidate(null);
      setLocallySuppressed(false);
      setPortraitFailed(false);
      setPortraitWarning("");
      setStatus("Portrait and position saved locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that portrait.");
    } finally {
      setSaving(false);
    }
  };

  const removePortrait = async () => {
    await onChange({ imageDataUrl: "", imageId: "", transform: centeredPortraitTransform() });
    setLocallySuppressed(false);
    setPortraitFailed(false);
    setPortraitWarning("");
    setStatus("Picture removed.");
  };

  const resetSavedFraming = async () => {
    if (!value) return;
    const reset = centeredPortraitTransform(safeTransform.transform.mode, safeTransform.transform.naturalWidth, safeTransform.transform.naturalHeight);
    await onChange({ imageDataUrl: value, imageId, transform: reset });
    setTransform(reset);
    setLocallySuppressed(false);
    setPortraitFailed(false);
    setPortraitWarning("");
    setStatus("Portrait framing reset. No other character data was changed.");
  };

  const changeFramingMode = (mode: PortraitFramingMode) => {
    if (mode === transformRef.current.mode) return;
    stopMomentum();
    setIsResetting(true);
    setTransform(switchPortraitMode(transformRef.current, mode, geometry()));
    setStatus(mode === "contain"
      ? "Show Full Image selected. The entire image is visible with background padding."
      : "Fill Frame selected. The portrait fills the area and some cropping may occur.");
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setIsResetting(false), 220);
  };

  const beginMomentum = () => {
    let { velocityX, velocityY } = lastPointerRef.current;
    if (Math.hypot(velocityX, velocityY) < 0.05) return;
    let previous = performance.now();
    const move = (now: number) => {
      const elapsed = Math.min(32, now - previous);
      previous = now;
      const next = panPortrait(transformRef.current, velocityX * elapsed, velocityY * elapsed, geometry());
      setTransform(next);
      velocityX *= 0.9 ** (elapsed / 16);
      velocityY *= 0.9 ** (elapsed / 16);
      if (Math.hypot(velocityX, velocityY) >= 0.015) momentumFrameRef.current = requestAnimationFrame(move);
      else momentumFrameRef.current = null;
    };
    momentumFrameRef.current = requestAnimationFrame(move);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    stopMomentum();
    setIsResetting(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, position);
    pointerStartRef.current = position;
    lastPointerRef.current = { ...position, at: performance.now(), velocityX: 0, velocityY: 0 };
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()];
      const center = centerBetween(first, second);
      pinchRef.current = { centerX: center.x, centerY: center.y, distance: distanceBetween(first, second), transform: transformRef.current };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const position = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, position);
    const pointerValues = [...pointersRef.current.values()];
    if (pointerValues.length >= 2 && pinchRef.current) {
      const [first, second] = pointerValues;
      const center = centerBetween(first, second);
      const frameBounds = editorFrameRef.current?.getBoundingClientRect();
      const frameWidth = frameBounds?.width ?? 1;
      const frameHeight = frameBounds?.height ?? 1;
      const focusX = (pinchRef.current.centerX - (frameBounds?.left ?? 0) - frameWidth / 2) / frameWidth;
      const focusY = (pinchRef.current.centerY - (frameBounds?.top ?? 0) - frameHeight / 2) / frameHeight;
      let next = zoomPortrait(
        pinchRef.current.transform,
        pinchRef.current.transform.zoom * distanceBetween(first, second) / Math.max(1, pinchRef.current.distance),
        focusX,
        focusY,
        geometry(),
      );
      next = panPortrait(next, center.x - pinchRef.current.centerX, center.y - pinchRef.current.centerY, geometry());
      setTransform(next);
      return;
    }

    const previous = lastPointerRef.current;
    const now = performance.now();
    const elapsed = Math.max(1, now - previous.at);
    const deltaX = position.x - previous.x;
    const deltaY = position.y - previous.y;
    setTransform(panPortrait(transformRef.current, deltaX, deltaY, geometry()));
    lastPointerRef.current = {
      ...position,
      at: now,
      velocityX: previous.velocityX * 0.65 + deltaX / elapsed * 0.35,
      velocityY: previous.velocityY * 0.65 + deltaY / elapsed * 0.35,
    };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = Math.hypot(event.clientX - pointerStartRef.current.x, event.clientY - pointerStartRef.current.y);
    if (event.pointerType === "touch" && moved < 8 && pointersRef.current.size === 0) {
      const now = performance.now();
      if (now - lastTapRef.current < 320) resetPosition();
      lastTapRef.current = now;
    }
    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.values()][0];
      lastPointerRef.current = { ...remaining, at: performance.now(), velocityX: 0, velocityY: 0 };
    } else if (pointersRef.current.size === 0 && !pinchRef.current) {
      beginMomentum();
    }
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const changeZoom = (nextZoom: number, focusX = 0, focusY = 0) => {
    stopMomentum();
    setTransform(zoomPortrait(transformRef.current, nextZoom, focusX, focusY, geometry()));
  };

  const onFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = event.shiftKey ? 20 : 8;
    if (event.key === "ArrowLeft") setTransform(panPortrait(transformRef.current, -move, 0, geometry()));
    else if (event.key === "ArrowRight") setTransform(panPortrait(transformRef.current, move, 0, geometry()));
    else if (event.key === "ArrowUp") setTransform(panPortrait(transformRef.current, 0, -move, geometry()));
    else if (event.key === "ArrowDown") setTransform(panPortrait(transformRef.current, 0, move, geometry()));
    else if (event.key === "+" || event.key === "=") changeZoom(transformRef.current.zoom + 0.1);
    else if (event.key === "-") changeZoom(transformRef.current.zoom - 0.1);
    else if (event.key === "Escape") cancelEditor();
    else if (event.key === "Enter") void savePortrait();
    else return;
    event.preventDefault();
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const focusX = (event.clientX - bounds.left - bounds.width / 2) / bounds.width;
    const focusY = (event.clientY - bounds.top - bounds.height / 2) / bounds.height;
    changeZoom(transformRef.current.zoom * (event.deltaY > 0 ? 0.94 : 1.06), focusX, focusY);
  };

  const controls = (
    <div className="portrait-picker-controls">
      <span className="form-field-label">{label}</span>
      <div className="portrait-picker-actions">
        <label className="secondary-button compact file-button" data-portrait-file-label htmlFor={inputId} onKeyDown={(event: KeyboardEvent<HTMLLabelElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          document.getElementById(inputId)?.click();
        }} tabIndex={0}>
          {value ? "Replace image" : "Select image"}
          <input accept="image/*" id={inputId} onChange={(event) => void choosePortrait(event)} type="file" />
        </label>
        {value && <button className="secondary-button compact" onClick={() => void openExistingEditor()} type="button">Position &amp; zoom</button>}
        {value && <button className="text-button danger" onClick={() => void removePortrait()} type="button">Remove</button>}
      </div>
      <small>{status || "The full image and its framing are stored locally and included in backups."}</small>
      {portraitWarning && <p className="portrait-warning" role="status">{portraitWarning}</p>}
      {value && (portraitFailed || locallySuppressed) && <div className="portrait-recovery-panel" role="alert">
        <strong>Portrait could not be displayed.</strong>
        <span>The rest of this character is safe and remains available.</span>
        <div>
          <button className="secondary-button compact" onClick={() => void resetSavedFraming()} type="button">Reset Portrait Framing</button>
          <label className="secondary-button compact file-button" htmlFor={`${inputId}-recovery`}>Choose Another Image<input accept="image/*" id={`${inputId}-recovery`} onChange={(event) => void choosePortrait(event)} type="file" /></label>
          <button className="secondary-button compact" onClick={() => setLocallySuppressed(true)} type="button">Continue Without Portrait</button>
          <button className="text-button danger" onClick={() => void removePortrait()} type="button">Remove Portrait</button>
        </div>
      </div>}
    </div>
  );

  return (
    <div className={compact ? "portrait-picker compact" : "portrait-picker"}>
      <PortraitViewport
        aria-label={value ? `${characterName} character picture` : `${characterName} picture placeholder`}
        className="portrait-preview portrait-frame"
        image={value && !locallySuppressed
          ? {
            fallback: <span aria-hidden="true">{characterInitial(characterName)}</span>,
            onError: () => { setPortraitFailed(true); setLocallySuppressed(true); },
            onInvalidTransform: () => setPortraitWarning("Portrait framing was reset because its saved settings were invalid."),
            src: value,
            transform: safeTransform.transform,
          }
          : undefined}
        surface="hud"
      >
        {(!value || locallySuppressed) && <span aria-hidden="true">{characterInitial(characterName)}</span>}
      </PortraitViewport>
      {compact ? <details className="portrait-management"><summary>Edit portrait</summary>{controls}</details> : controls}

      {candidate && (
        <div className="portrait-editor-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) cancelEditor(); }}>
          <section
            aria-describedby="portrait-editor-help"
            aria-labelledby="portrait-editor-title"
            aria-modal="true"
            className="portrait-editor-dialog"
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelEditor(); } }}
            role="dialog"
          >
            <header className="portrait-editor-header">
              <div><span className="card-label">Live HUD preview</span><h2 id="portrait-editor-title">Position portrait</h2></div>
              <button aria-label="Cancel portrait editing" className="sheet-section-close" onClick={cancelEditor} type="button">×</button>
            </header>
            <p id="portrait-editor-help">Choose whether to fill the banner or show the complete artwork, then drag and zoom to position it.</p>
            <div aria-label="Portrait framing mode" className="portrait-framing-control" role="group">
              <button aria-pressed={draftTransform.mode === "cover"} className={draftTransform.mode === "cover" ? "active" : ""} onClick={() => changeFramingMode("cover")} type="button"><strong>Fill Frame</strong><span>Fills the portrait area. Some cropping may occur.</span></button>
              <button aria-pressed={draftTransform.mode === "contain"} className={draftTransform.mode === "contain" ? "active" : ""} onClick={() => changeFramingMode("contain")} type="button"><strong>Show Full Image</strong><span>Displays the entire image with background padding.</span></button>
            </div>
            <span aria-live="polite" className="sr-only">{status}</span>
            <PortraitViewport
              aria-label="Portrait positioning area. Use arrow keys to move, plus or minus to zoom, Enter to save, and Escape to cancel."
              className={isResetting ? "portrait-editor-frame resetting" : "portrait-editor-frame"}
              image={{ src: candidate.dataUrl, transform: draftTransform }}
              onDoubleClick={resetPosition}
              onKeyDown={onFrameKeyDown}
              onPointerCancel={onPointerEnd}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onWheel={onWheel}
              ref={editorFrameRef}
              role="application"
              surface="editor"
              tabIndex={0}
            >
              <span aria-hidden="true" className="portrait-editor-guide" />
            </PortraitViewport>
            <div className="portrait-editor-zoom">
              <label htmlFor={`${replacementInputId}-zoom`}>Zoom <output>{Math.round(draftTransform.zoom * 100)}%</output></label>
              <div><button aria-label="Zoom out" className="secondary-button compact" onClick={() => changeZoom(draftTransform.zoom - 0.1)} type="button">−</button><input aria-valuetext={`${Math.round(draftTransform.zoom * 100)}% relative to ${draftTransform.mode === "contain" ? "Show Full Image" : "Fill Frame"}`} id={`${replacementInputId}-zoom`} max={maximumPortraitZoom} min={1} onChange={(event) => changeZoom(Number(event.target.value))} step={0.01} type="range" value={draftTransform.zoom} /><button aria-label="Zoom in" className="secondary-button compact" onClick={() => changeZoom(draftTransform.zoom + 0.1)} type="button">+</button></div>
            </div>
            <div className="portrait-editor-actions">
              <label className="secondary-button compact file-button" htmlFor={replacementInputId}>Replace image<input accept="image/*" id={replacementInputId} onChange={(event) => void choosePortrait(event)} type="file" /></label>
              <button className="secondary-button compact" onClick={resetPosition} type="button">Reset Position</button>
              <span className="portrait-editor-action-spacer" />
              <button className="text-button" onClick={cancelEditor} type="button">Cancel</button>
              <button className="primary-button compact" disabled={saving} onClick={() => void savePortrait()} type="button">{saving ? "Saving..." : "Save Portrait"}</button>
            </div>
            <small className="portrait-editor-keyboard-help">Keyboard: arrows move · + / − zoom · Enter saves · Esc cancels</small>
          </section>
        </div>
      )}
    </div>
  );
}
