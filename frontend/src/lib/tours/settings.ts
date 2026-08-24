import type { TourDefinition } from "./types";

///  +-----------------------------------------------------------------+
///  |                     THE SETTINGS TOUR                           |
///  +-----------------------------------------------------------------+
//
//  Two steps, and deliberately only two. Everything else on this page is
//  admin-only and admins get no tour, so for the people who see this tour the
//  page IS appearance — a longer tour would be padding.
///  +-----------------------------------------------------------------+

export const settingsTour: TourDefinition = {
  id: "settings",
  steps: [
    {
      id: "theme",
      anchors: ['[data-tour="settings-theme"]', '[data-tour="nav-theme"]'],
      title: "Light or dark",
      description:
        "Switch whenever you like — there's a shortcut in the top bar too, on every page.",
      side: "bottom",
      align: "start",
      required: true,
    },
    {
      id: "palette",
      anchors: ['[data-tour="settings-palette"]'],
      title: "Colours",
      description:
        "Each palette has its own light and dark version, so this and the switch above work together. It's remembered on this device.",
      side: "top",
      align: "start",
    },
  ],
};
