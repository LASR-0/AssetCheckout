import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/variants";
import { Page } from "./Page";

type Props = {
  /** Optional images from config, per mode. Without one, the icon. */
  watermark?: { light?: string; dark?: string };
  icon: string;
  title: string;
  children: ReactNode;
};

/**
 * A full-page dead end (not found, no access): calm, centred, with a way
 * home. No designs exist for these, so they are built from the system: the
 * head type, a tray-toned medallion, the primary button.
 */
export function StatusPage({ watermark, icon, title, children }: Props) {
  const { resolvedTheme } = useTheme();
  // Undefined until next-themes has read the stored mode; holding the image
  // back until then stops it flashing the other mode's variant.
  const mounted = resolvedTheme !== undefined;

  const image = resolvedTheme === "dark" ? watermark?.dark || watermark?.light : watermark?.light;

  return (
    // Grows like a full page; the column inside stays narrow.
    <Page max={1240} className="flex flex-col items-center px-5 pt-16 pb-24 text-center phone:pt-24">
      {image ? (
        <img
          src={mounted ? image : undefined}
          alt=""
          className={cn("h-40 w-auto phone:h-56", !mounted && "invisible")}
        />
      ) : (
        <span className="grid size-18 place-items-center rounded-full border border-line bg-tray text-tx3">
          <Icon name={icon} size={34} weight={300} />
        </span>
      )}
      <h1 className="mt-6 font-head fs-24 font-semibold tracking-head text-tx">{title}</h1>
      <div className="mt-2 max-w-[28rem] fs-14 leading-relaxed text-tx2">{children}</div>
      <Link to="/" className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-7")}>
        <Icon name="arrow_back" size={18} />
        Back to home
      </Link>
    </Page>
  );
}
