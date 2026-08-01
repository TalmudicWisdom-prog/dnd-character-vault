import { useEffect, useState } from "react";
import type { PortraitTransform } from "../../domain/models";
import { PortraitImage } from "./PortraitImage";

export function characterInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)?.[0] ?? ""}` : words[0]?.slice(0, 2) || "?").toUpperCase();
}

export function CharacterAvatar({ name, portraitDataUrl, portraitTransform, size = "medium" }: { name: string; portraitDataUrl?: string; portraitTransform?: PortraitTransform; size?: "small" | "medium" | "large" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [portraitDataUrl]);
  return (
    <span aria-hidden="true" className={`character-avatar ${size}`}>
      {portraitDataUrl && !failed
        ? <PortraitImage loading="lazy" onError={() => setFailed(true)} src={portraitDataUrl} transform={portraitTransform} />
        : <span>{characterInitials(name)}</span>}
    </span>
  );
}
