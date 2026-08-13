import { useRef, useState } from "react";
import EditableText from "./EditableText";
import { uploadTroubleshootingImage } from "@/api/troubleshooting";
import type { Figure } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                   EDITING A STEP'S FIGURE                       |
///  +-----------------------------------------------------------------+
//
//  THE CAPTION IS THE FIGURE. It is required and the pictures are not, which
//  is the schema's oldest rule: a caption carries the navigation path in
//  words, survives a redesign of the screen it describes, and is what a
//  screen reader announces. So "Add figure" creates a caption, and images are
//  added to it afterwards.
//
//  IMAGES ARE A SEQUENCE — the menu that gets you there, then the screen you
//  land on. Order is the order they render, so it is editable.
//
//  BOTH THEMES UPLOAD TOGETHER. The light and dark files share a minted base
//  name on the server, so offering them as one action is what keeps the pair
//  from drifting; uploading a dark variant separately is not a thing the API
//  can express, deliberately.
//
//  SIZE IS A NAME, NOT A NUMBER — flyout, window, full — because only the
//  author knows whether the detail in a screenshot matters, and nobody
//  writing content should be choosing pixel widths.
///  +-----------------------------------------------------------------+

type Props = {
  figure?: Figure;
  subjectKey: string;
  symptomId: string;
  onChange: (figure: Figure) => void;
  onRemove: () => void;
};

/** Strip the data: prefix — the API wants raw base64. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

export default function FigureEditor({
  figure,
  subjectKey,
  symptomId,
  onChange,
  onRemove,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lightRef = useRef<HTMLInputElement | null>(null);
  const darkRef = useRef<HTMLInputElement | null>(null);

  if (!figure) {
    return (
      <button
        type="button"
        onClick={() => onChange({ caption: "" })}
        className="self-start rounded-lg border border-dashed border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
      >
        + Add figure
      </button>
    );
  }

  const images = figure.images ?? [];

  async function upload() {
    const light = lightRef.current?.files?.[0];
    const dark = darkRef.current?.files?.[0];

    if (!light) {
      setError("Choose a light-theme image first.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadTroubleshootingImage(subjectKey, symptomId, {
        // Named from the caption so filenames stay descriptive without
        // asking for a second thing to type.
        name: figure!.caption.slice(0, 40) || "Figure",
        light: await readAsBase64(light),
        dark: dark ? await readAsBase64(dark) : undefined,
      });

      onChange({
        ...figure!,
        images: [
          ...images,
          { src: uploaded.src, ...(uploaded.srcDark ? { srcDark: uploaded.srcDark } : {}) },
        ],
      });

      if (lightRef.current) lightRef.current.value = "";
      if (darkRef.current) darkRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...figure, images: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline bg-surface-container-low/10 p-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined !text-[16px] text-info-light">image</span>
        <span className="text-xs font-semibold text-info-light">Figure</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove figure"
          className="ml-auto grid size-7 place-items-center rounded-md border border-outline text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined !text-[16px]">close</span>
        </button>
      </div>

      <EditableText
        value={figure.caption}
        onChange={(caption) => onChange({ ...figure, caption })}
        ariaLabel="Figure caption"
        className="text-[13px]"
        placeholder="The path in words — “Settings › Wi-Fi › Forget This Network”"
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, i) => (
            <div
              key={image.src}
              className="flex items-center gap-2 rounded-md border border-outline bg-surface px-2 py-1"
            >
              <img
                src={`/troubleshooting/${image.src}`}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
              <span className="max-w-[16rem] truncate text-[11px] text-info-light">
                {image.src.split("/").pop()}
                {image.srcDark ? " + dark" : ""}
              </span>
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Move image earlier"
                className="text-info-light disabled:opacity-30 hover:cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">arrow_back</span>
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === images.length - 1}
                aria-label="Move image later"
                className="text-info-light disabled:opacity-30 hover:cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...figure, images: images.filter((_, j) => j !== i) })
                }
                aria-label="Remove image"
                className="text-error hover:cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-info-light">
          Light image
          <input
            ref={lightRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-[11px] file:mr-2 file:rounded file:border file:border-outline file:bg-surface file:px-2 file:py-1 file:text-[11px] hover:file:cursor-pointer"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-info-light">
          Dark image (optional)
          <input
            ref={darkRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-[11px] file:mr-2 file:rounded file:border file:border-outline file:bg-surface file:px-2 file:py-1 file:text-[11px] hover:file:cursor-pointer"
          />
        </label>
        <button
          type="button"
          onClick={() => void upload()}
          disabled={uploading}
          className="rounded-lg border border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer disabled:opacity-50 transition-colors"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>

        <label className="ml-auto flex items-center gap-2 text-[11px] text-info-light">
          Size
          <select
            value={figure.size ?? "flyout"}
            onChange={(e) => {
              const value = e.target.value;
              const next = { ...figure };
              // "flyout" is the absence of a size, not a value — the schema
              // only knows window and full.
              if (value === "flyout") delete next.size;
              else next.size = value as "window" | "full";
              onChange(next);
            }}
            className="rounded-md border border-outline bg-surface px-2 py-1 text-[11px] hover:cursor-pointer"
          >
            <option value="flyout">Flyout — a menu or small panel</option>
            <option value="window">Window — an application window</option>
            <option value="full">Full — a whole-screen capture</option>
          </select>
        </label>
      </div>

      {error && <p className="text-[13px] text-error">{error}</p>}
    </div>
  );
}
