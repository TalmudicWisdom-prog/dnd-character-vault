import { useId, useState, type ChangeEvent } from "react";

const maxSourceBytes = 8 * 1024 * 1024;
const maxStoredDataUrlLength = 1_500_000;
const portraitSize = 512;

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

async function resizePortrait(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > maxSourceBytes) throw new Error("Choose an image under 8 MB.");

  const originalDataUrl = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(originalDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = portraitSize;
    canvas.height = portraitSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image resizing is unavailable on this device.");

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, portraitSize, portraitSize);

    const resized = canvas.toDataURL("image/jpeg", 0.86);
    if (resized.length <= maxStoredDataUrlLength) return resized;
  } catch {
    if (originalDataUrl.length <= maxStoredDataUrlLength) return originalDataUrl;
    throw new Error("That image is too large to save locally. Try a smaller picture.");
  }

  throw new Error("That image is too large to save locally. Try a smaller picture.");
}

type CharacterPortraitFieldProps = {
  characterName: string;
  compact?: boolean;
  label?: string;
  onChange: (portraitDataUrl: string) => void | Promise<void>;
  value: string;
};

export function CharacterPortraitField({ characterName, compact = false, label = "Character picture", onChange, value }: CharacterPortraitFieldProps) {
  const inputId = useId();
  const [status, setStatus] = useState("");

  const choosePortrait = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStatus("Preparing picture...");
    try {
      const portraitDataUrl = await resizePortrait(file);
      await onChange(portraitDataUrl);
      setStatus("Picture saved locally.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that picture.");
    }
  };

  const removePortrait = async () => {
    await onChange("");
    setStatus("Picture removed.");
  };

  return (
    <div className={compact ? "portrait-picker compact" : "portrait-picker"}>
      <div className="portrait-preview portrait-frame" aria-label={value ? `${characterName} character picture` : `${characterName} picture placeholder`}>
        {value ? <img alt="" src={value} /> : <span aria-hidden="true">{characterInitial(characterName)}</span>}
      </div>
      <div className="portrait-picker-controls">
        <span className="form-field-label">{label}</span>
        <div className="portrait-picker-actions">
          <label className="secondary-button compact file-button" htmlFor={inputId}>
            {value ? "Change picture" : "Add picture"}
            <input accept="image/*" id={inputId} onChange={(event) => void choosePortrait(event)} type="file" />
          </label>
          {value && <button className="text-button danger" onClick={() => void removePortrait()} type="button">Remove</button>}
        </div>
        <small>{status || "Stored on this device and included in character backups."}</small>
      </div>
    </div>
  );
}
