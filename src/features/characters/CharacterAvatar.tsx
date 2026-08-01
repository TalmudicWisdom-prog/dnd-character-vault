import { useEffect, useState } from "react";

export function characterInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)?.[0] ?? ""}` : words[0]?.slice(0, 2) || "?").toUpperCase();
}

export function CharacterAvatar({ name, portraitDataUrl, size = "medium" }: { name: string; portraitDataUrl?: string; size?: "small" | "medium" | "large" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [portraitDataUrl]);
  return (
    <span aria-hidden="true" className={`character-avatar ${size}`}>
      {portraitDataUrl && !failed
        ? <img alt="" decoding="async" loading="lazy" onError={() => setFailed(true)} src={portraitDataUrl} />
        : <span>{characterInitials(name)}</span>}
    </span>
  );
}
