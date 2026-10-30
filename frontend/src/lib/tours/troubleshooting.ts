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
      id: "search",
      anchors: ['[data-tour="ts-search"]'],
      title: "Describe what's wrong",
      description:
        "In your own words. It searches every fix IT has written, whatever the device or app.",
      side: "bottom",
    },
    {
      id: "subject",
      anchors: ['[data-tour="ts-subject"]'],
      title: "Or browse by device",
      description: "Pick what's giving you trouble to see every problem IT has written up for it.",
      side: "right",
    },
    {
      id: "symptoms",
      anchors: ['[data-tour="ts-symptoms"]'],
      title: "Then what it's doing",
      description:
        "Grouped by the kind of problem. Each one opens a short set of steps you can work through yourself.",
      side: "top",
    },
    {
      id: "modes",
      anchors: ['[data-tour="ts-article-modes"]'],
      title: "One step at a time, or all at once",
      description:
        "Guided asks after each step whether it fixed it. All steps shows the whole article to scan ahead.",
      side: "bottom",
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
