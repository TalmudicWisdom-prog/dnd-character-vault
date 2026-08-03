import { Component, forwardRef, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type HTMLAttributes, type ReactNode, type SyntheticEvent } from "react";
import type { PortraitTransform } from "../../domain/models";
import { clampPortraitTransform, type PortraitGeometry, validatePortraitTransform } from "./portraitTransform";

export type PortraitImageProps = {
  alt?: string;
  className?: string;
  decoding?: "async" | "auto" | "sync";
  fallback?: ReactNode;
  loading?: "eager" | "lazy";
  onError?: () => void;
  onInvalidTransform?: () => void;
  src: string;
  transform?: PortraitTransform;
};

type ImageLoadEvent = { currentTarget: Pick<HTMLImageElement, "naturalHeight" | "naturalWidth"> | null } | null;

export function capturePortraitImageDimensions(event: ImageLoadEvent) {
  const image = event?.currentTarget ?? null;
  const naturalWidth = Number(image?.naturalWidth ?? 0);
  const naturalHeight = Number(image?.naturalHeight ?? 0);
  return {
    naturalWidth: Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 0,
    naturalHeight: Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : 0,
  };
}

export function isStablePortraitSource(src: string) {
  return Boolean(src.trim()) && !src.trim().toLocaleLowerCase().startsWith("blob:");
}

function PortraitFallback({ children }: { children?: ReactNode }) {
  return <span aria-label="Portrait could not be displayed" className="portrait-image-fallback">{children ?? "Portrait unavailable"}</span>;
}

class PortraitRenderBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Portrait rendering failed: ${error.name}: ${error.message}\n${info.componentStack}`);
    try { this.props.onError?.(); } catch { /* Portrait recovery callbacks must never escape this boundary. */ }
  }

  render() {
    return this.state.failed ? <PortraitFallback>{this.props.fallback}</PortraitFallback> : this.props.children;
  }
}

function PortraitImageContent({ alt = "", className = "", decoding = "async", fallback, loading = "eager", onError, onInvalidTransform, src, transform }: PortraitImageProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const validation = validatePortraitTransform(transform);
  const [failed, setFailed] = useState(false);
  const [geometry, setGeometry] = useState<PortraitGeometry>({
    frameWidth: 0,
    frameHeight: 0,
    imageWidth: validation.transform.naturalWidth ?? 0,
    imageHeight: validation.transform.naturalHeight ?? 0,
  });
  const sourceValid = isStablePortraitSource(src);

  const handleFailure = () => {
    setFailed(true);
    try { onError?.(); } catch { /* A portrait callback cannot take down its parent view. */ }
  };

  useEffect(() => {
    setFailed(false);
    if (!sourceValid) handleFailure();
  }, [src, sourceValid]);

  useEffect(() => {
    if (!validation.valid) {
      try { onInvalidTransform?.(); } catch { /* Invalid metadata always falls back locally. */ }
    }
  }, [validation.valid, onInvalidTransform]);

  useEffect(() => {
    if (!validation.transform.naturalWidth || !validation.transform.naturalHeight) return;
    setGeometry((current) => ({
      ...current,
      imageWidth: validation.transform.naturalWidth ?? current.imageWidth,
      imageHeight: validation.transform.naturalHeight ?? current.imageHeight,
    }));
  }, [validation.transform.naturalWidth, validation.transform.naturalHeight]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const bounds = root.getBoundingClientRect();
      setGeometry((current) => ({ ...current, frameWidth: bounds.width, frameHeight: bounds.height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    // Capture primitives before React/Safari releases currentTarget. Never close over the event.
    const { naturalWidth, naturalHeight } = capturePortraitImageDimensions(event);
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      handleFailure();
      return;
    }
    setGeometry((current) => ({ ...current, imageWidth: naturalWidth, imageHeight: naturalHeight }));
  };

  if (failed || !sourceValid) return <PortraitFallback>{fallback}</PortraitFallback>;

  const displayed = clampPortraitTransform(validation.transform, geometry);
  return (
    <span className={`portrait-image ${className}`.trim()} data-portrait-mode={displayed.mode} ref={rootRef}>
      {displayed.mode === "contain" && <span aria-hidden="true" className="portrait-image-backdrop"><img alt="" src={src} /></span>}
      <span className="portrait-image-pan" style={{ transform: `translate3d(${displayed.offsetX * 100}%, ${displayed.offsetY * 100}%, 0)` }}>
        <img
          alt={alt}
          className="portrait-image-foreground"
          decoding={decoding}
          loading={loading}
          onError={handleFailure}
          onLoad={handleImageLoad}
          src={src}
          style={{ objectFit: displayed.mode === "contain" ? "contain" : "cover", transform: `scale(${displayed.zoom})` }}
        />
      </span>
    </span>
  );
}

export function PortraitImage(props: PortraitImageProps) {
  return (
    <PortraitRenderBoundary fallback={props.fallback} key={props.src} onError={props.onError}>
      <PortraitImageContent {...props} />
    </PortraitRenderBoundary>
  );
}

export type PortraitViewportProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children?: ReactNode;
  image?: PortraitImageProps;
  surface: "editor" | "hud";
};

/** Shared frame and renderer used by both the interactive editor and saved HUD. */
export const PortraitViewport = forwardRef<HTMLDivElement, PortraitViewportProps>(function PortraitViewport(
  { children, className = "", image, surface, ...frameProps },
  ref,
) {
  return (
    <div
      {...frameProps}
      className={`portrait-render-frame ${className}`.trim()}
      data-portrait-surface={surface}
      ref={ref}
    >
      {image && <PortraitImage {...image} />}
      {children}
    </div>
  );
});
