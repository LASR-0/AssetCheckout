import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function NoAccessPage() {
  // Optional admin-provided watermarks. Two env vars to support different
  // images for each theme — a single image rarely reads well on both light
  // and dark backgrounds. If neither is set (or the relevant one is empty
  // for the current theme), we fall back to the "4 [block] 3" treatment.
  const watermarkLight = import.meta.env.VITE_NO_ACCESS_WATERMARK_LIGHT;
  const watermarkDark = import.meta.env.VITE_NO_ACCESS_WATERMARK_DARK;

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Hydration guard: next-themes can't resolve the theme until after mount,
  // and we don't want to flash the wrong image (or briefly show the fallback
  // icon and then swap to an image).
  useEffect(() => setMounted(true), []);

  const watermark =
    resolvedTheme === "dark" ? watermarkDark : watermarkLight;

  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center text-on-background gap-4 px-6">
      {/* Show nothing until mounted; then swap to image or fallback "4 [block] 3". */}
      {mounted &&
        (watermark ? (
          <img
            src={watermark}
            alt=""
            className="h-64 md:h-124 w-auto"
          />
        ) : (
          // Digits + icon scale down on mobile to fit narrow viewports.
          // !text-[120px] mobile keeps the treatment visible without overflowing;
          // md:!text-[250px] restores the full visual on tablet+.
          <div className="flex items-center justify-center gap-2">
            <span className="!text-[120px] md:!text-[250px] font-bold text-not-found-text/50 leading-none">
              4
            </span>
            <span className="material-symbols-outlined !text-[110px] md:!text-[230px] text-not-found-text leading-none">
              block
            </span>
            <span className="!text-[120px] md:!text-[250px] font-bold text-not-found-text/50 leading-none">
              3
            </span>
          </div>
        ))}

      <h1 className="text-3xl md:text-5xl mt-[-20px] font-mono text-not-found-text font-bold text-center">
        Unauthorised Access
      </h1>

      <p className="text-info-light text-center max-w-md">
        You don't have permission to view this page. If you believe this is a
        mistake, contact IT to be added as an admin or assigned as a manager
        on at least one request.
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