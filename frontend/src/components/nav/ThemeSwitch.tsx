import { Switch } from "@/components/ui/switch";
import { withThemeReveal } from "@/lib/theme-transition";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

export default function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // onCheckedChange hands back the value, not the event, so the reveal origin
  // has to come from a ref on the switch itself.
  const switchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <div className="flex items-center justify-between">
        <div className="hidden data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
        <span className="material-symbols-outlined my-auto mr-5 text-theme-sun !text-[22px]"
              style={{ fontVariationSettings: `'FILL' 1` }}> sunny </span>
        <Switch
            ref={switchRef}
            className="bg-status-pending border-2 border-outline/80 hover:cursor-pointer"
            id=""
            checked={isDark}
            onCheckedChange={(checked) => {
            const next = checked ? "dark" : "light";
            withThemeReveal(next, () => setTheme(next), switchRef.current);
            }}
        />
        <span className="material-symbols-outlined ml-5 my-auto text-theme-moon !text-[22px]"
              style={{ fontVariationSettings: `'FILL' 1` }}> dark_mode </span>
    </div>
  );
}