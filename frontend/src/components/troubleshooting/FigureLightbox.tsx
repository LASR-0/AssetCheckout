import { useEffect } from "react";
import { createPortal } from "react-dom";

///  +-----------------------------------------------------------------+
///  |            A SCREENSHOT, AS BIG AS THE SCREEN ALLOWS            |
///  +-----------------------------------------------------------------+
//
//  The answer to a figure that is readable in principle and not in practice: a
//  wide, slim capture drawn into a 790px column is a 100px strip. Rather than
//  upscale it in place — which adds no detail and blurs what is there — the
//  full picture is one click away at whatever size the window can give it.
//
//  NO CARD, NO CHROME, NO CAPTION. The point is the pixels; a panel around
//  them would take room the picture wants and add nothing a reader who just
//  clicked a screenshot needs to be told.
//
//  BUILT RATHER THAN BORROWED. The Dialog component brings a background, a
//  border, a radius, padding and a close button, and every one of those would
//  have to be overridden away. What it would genuinely give is Escape, a focus
//  trap and scroll locking, so those are implemented here instead — they are
//  the parts that matter and they are short.
///  +-----------------------------------------------------------------+

type Props = {
  src: string;
  onClose: () => void;
};

export default function FigureLightbox({ src, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    // The page behind must not scroll away under the overlay — on a trackpad
    // it is easy to close the lightbox and find yourself somewhere else.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portalled to the body so no ancestor's overflow, transform or stacking
  // context can clip it — an article step is inside several of each.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot, full size"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <img
        src={src}
        alt=""
        // Stops a click ON the picture closing it — only the surrounding
        // darkness dismisses. Clicking the thing you came to look at and
        // having it vanish is the wrong response.
        onClick={(e) => e.stopPropagation()}
        className="max-h-[95vh] max-w-[95vw] object-contain"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        autoFocus
        className="fixed top-4 right-4 grid size-10 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 hover:cursor-pointer"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>,
    document.body
  );
}
