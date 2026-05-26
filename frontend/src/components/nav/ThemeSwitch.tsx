import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <div className="flex items-center justify-between">
        <div className="hidden data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
        <span className="material-symbols-outlined my-auto mr-5 text-theme-sun !text-[22px]"
              style={{ fontVariationSettings: `'FILL' 1` }}> sunny </span>
        <Switch
            className="bg-theme-bg hover:cursor-pointer"
            id=""
            checked={isDark}
            onCheckedChange={(checked) => {
            setTheme(checked ? "dark" : "light");
            }}
        />
        <span className="material-symbols-outlined ml-5 my-auto text-theme-moon !text-[22px]"
              style={{ fontVariationSettings: `'FILL' 1` }}> dark_mode </span>
    </div>
  );
}