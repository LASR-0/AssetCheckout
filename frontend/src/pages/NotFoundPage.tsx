import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function NotFoundPage() {
  // Optional admin-provided watermark image. When set in the frontend .env as
  // VITE_CATCH_ALL_WATERMARK_LIGHT / _DARK, render it in place of the fallback icon.
  const watermarkLight = import.meta.env.VITE_CATCH_ALL_WATERMARK;
  const watermarkDark = import.meta.env.VITE_CATCH_ALL_WATERMARK_DARK;

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Hydration guard: next-themes can't resolve the theme until after mount,
  // and we don't want to flash the wrong image (or briefly show the fallback
  // icon and then swap to an image).
  useEffect(() => setMounted(true), []);

  const watermark =
    resolvedTheme === "dark" ? watermarkDark : watermarkLight;

  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-background gap-3 px-6">
      {mounted &&
        (watermark ? (
          <img
            src={watermark}
            alt=""
            // Image shrinks substantially on mobile so the heading and button
            // remain visible without scrolling on iPhone-sized screens.
            className="h-64 md:h-124 w-auto"
          />
        ) : (
          <span className="material-symbols-outlined !text-[140px] md:!text-[250px] text-not-found-text/70">
            travel_explore
          </span>
        ))}

      {/* Negative margin scales with image size — smaller image needs less
          overlap to maintain the same visual relationship between art and
          heading. */}
      <h1 className="text-2xl md:text-4xl text-not-found-text mt-[-30px] md:mt-[-100px] font-mono font-bold text-center">
        Oops... Looks like you got lost
      </h1>

      <p className="text-info-light text-center max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>

      <Link
        to="/"
        className="mt-2 px-8 py-2 text-md rounded-full font-bold not-found hover:brightness-110 hover:shadow-md text-white hover:cursor-pointer inline-flex items-center gap-2"
      >
        Back to home
        <span
          className="material-symbols-outlined !text-2xl leading-none"
          style={{ fontVariationSettings: `'FILL' 1` }}
        >
          reply
        </span>
      </Link>
    </main>
  );
}