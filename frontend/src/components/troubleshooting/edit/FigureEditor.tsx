import { useId, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_TRIGGER, SELECT_CONTENT, SELECT_ITEM } from "./BlockRow";
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
  /**
   * Rendered inside a BlockRow, which already carries the type label, the
   * colour and the remove action.
   *
   * So this drops its own header and border and renders only the fields —
   * otherwise the row's label and the panel's label say the same thing twice,
   * with two different remove buttons under them.
   */
  bare?: boolean;
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
  bare = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captionId = useId();
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
    <div
      className={
        bare
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 rounded-lg border border-outline bg-surface-container-low/10 p-3"
      }
    >
      <div className={bare ? "hidden" : "flex items-center gap-2"}>
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

      {/* A label column and a field column, so the four things a figure has
          read as one form rather than four unrelated controls. Matches the
          rail above it: the labels line up, the fields line up. */}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <FieldLabel htmlFor={captionId}>Caption path</FieldLabel>
        {/* PLAIN, unlike the other prose fields, and it was tried the other
            way first. A caption is a navigation path — "Settings › Wi-Fi ›
            Forget This Network" — not a sentence: the monospace face and the
            even spacing are what make it readable as a path, and nothing in
            it wants emphasis or a link. A rich field here bought an author
            three controls they would never press, in exchange for a field
            that no longer looked like the thing it holds. */}
        <input
          id={captionId}
          value={figure.caption}
          onChange={(e) => onChange({ ...figure, caption: e.target.value })}
          placeholder="Settings › Wi-Fi › Forget This Network"
          className="w-full rounded-md border border-outline bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-on-surface outline-none focus:border-primary"
        />

        <FieldLabel>Light image</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={lightRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Light image"
            className="text-[12px] file:mr-2 file:rounded-md file:border file:border-outline file:bg-surface file:px-2.5 file:py-1 file:text-[12px] hover:file:cursor-pointer"
          />
        </div>

        <FieldLabel>Dark image</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={darkRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Dark image"
            className="text-[12px] file:mr-2 file:rounded-md file:border file:border-outline file:bg-surface file:px-2.5 file:py-1 file:text-[12px] hover:file:cursor-pointer"
          />
          {/* Said here rather than in the label, because it is a fact about
              this field and not part of its name. */}
          <span className="text-[11.5px] text-info-light">
            Optional — only when the screenshot changes with the theme
          </span>
        </div>

        <FieldLabel>Size</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={figure.size ?? "flyout"}
            onValueChange={(value) => {
              const next = { ...figure };
              // "flyout" is the absence of a size, not a value — the schema
              // only knows window and full.
              if (value === "flyout") delete next.size;
              else next.size = value as "window" | "full";
              onChange(next);
            }}
          >
            <SelectTrigger
              aria-label="Figure size"
              className={`h-8 w-[19rem] text-[12.5px] ${SELECT_TRIGGER}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              <SelectItem className={SELECT_ITEM} value="flyout">Flyout — a menu or small panel</SelectItem>
              <SelectItem className={SELECT_ITEM} value="window">Window — an application window</SelectItem>
              <SelectItem className={SELECT_ITEM} value="full">Full — a whole-screen capture</SelectItem>
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => void upload()}
            disabled={uploading}
            className="rounded-md border border-outline bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-info-light hover:bg-surface-container-low/40 hover:cursor-pointer disabled:opacity-50 transition-colors"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      {/* PREVIEWS LAST. They are the only part that varies in height, and with
          them above the fields every figure's controls sat at a different
          place down the page — so nothing could be found by muscle memory.
          They are also the output rather than the input: you upload, then you
          check what you got. */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-outline/40 pt-2.5">
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

      {error && <p className="text-[13px] text-error">{error}</p>}
    </div>
  );
}

/** A right-aligned label in the figure's own two-column grid. */
function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="text-[12px] text-info-light">
      {children}
    </label>
  );
}
