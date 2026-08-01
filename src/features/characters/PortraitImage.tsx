import { useEffect, useRef, useState } from "react";
import type { PortraitTransform } from "../../domain/models";
import { centeredPortraitTransform } from "../../domain/models";
import { clampPortraitTransform, type PortraitGeometry } from "./portraitTransform";

type PortraitImageProps = {
  alt?: string;
  className?: string;
  decoding?: "async" | "auto" | "sync";
  loading?: "eager" | "lazy";
  onError?: () => void;
  src: string;
  transform?: PortraitTransform;
};

export function PortraitImage({ alt = "", className = "", decoding = "async", loading = "eager", onError, src, transform }: PortraitImageProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [geometry, setGeometry] = useState<PortraitGeometry>({ frameWidth: 0, frameHeight: 0, imageWidth: 0, imageHeight: 0 });

  useEffect(() => {
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

  const displayed = clampPortraitTransform(transform ?? centeredPortraitTransform(), geometry);

  return (
    <span className={`portrait-image ${className}`.trim()} ref={rootRef}>
      <span className="portrait-image-pan" style={{ transform: `translate3d(${displayed.offsetX * 100}%, ${displayed.offsetY * 100}%, 0)` }}>
        <img
          alt={alt}
          decoding={decoding}
          loading={loading}
          onError={onError}
          onLoad={(event) => setGeometry((current) => ({
            ...current,
            imageWidth: event.currentTarget.naturalWidth,
            imageHeight: event.currentTarget.naturalHeight,
          }))}
          src={src}
          style={{ transform: `scale(${displayed.zoom})` }}
        />
      </span>
    </span>
  );
}
