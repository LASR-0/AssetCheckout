import type { TourDefinition } from "./types";

///  +-----------------------------------------------------------------+
///  |                 THE TROUBLESHOOTING TOUR                        |
///  +-----------------------------------------------------------------+
//
//  BEHIND THE BUTTON ONLY — see NEVER_AUTO in registry.ts. Somebody reaching
//  this page has a broken device in front of them and is trying to fix it.
//  Interrupting that with an unrequested walkthrough is worse than not having
//  one, so this waits to be asked for.
//
//  Which also shapes the copy: whoever runs this has pressed a button saying
//  "show me around", so it can be brief and assume they are looking rather
//  than being sold the feature.
///  +-----------------------------------------------------------------+

export const troubleshootingTour: TourDefinition = {
  id: "troubleshooting",
  steps: [
    {
      id: "subject",
      anchors: ['[data-tour="ts-subject"]'],
      title: "Start with the device",
      description:
        "Pick what's giving you trouble. The steps that follow are written for that device specifically.",
      side: "bottom",
      required: true,
    },
    {
      id: "symptoms",
      anchors: ['[data-tour="ts-symptoms"]', '[data-tour="ts-subject"]'],
      title: "Then what it's doing",
      description:
        "Grouped by the kind of problem. Each one opens a short set of steps you can work through yourself.",
      side: "top",
    },
    {
      id: "escape",
      anchors: ['[data-tour="ts-escape"]'],
      title: "When none of it helps",
      description:
        "Call IT, or send them a message with the steps you've already tried filled in — so nobody asks you to do them twice.",
      side: "top",
      required: true,
    },
  ],
};
