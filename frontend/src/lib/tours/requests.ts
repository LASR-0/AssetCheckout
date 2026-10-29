import type { TourDefinition } from "./types";

///  +-----------------------------------------------------------------+
///  |                   THE REQUEST LOG TOURS                         |
///  +-----------------------------------------------------------------+
//
//  TWO TOURS, ONE PAGE. Everybody gets `requests` — finding a row, narrowing
//  the list, reading a status. Managers additionally get `requests-manager`,
//  which is the two actions only they can take.
//
//  They are separate rather than one tour with conditional steps because of
//  when they run. A manager is not a manager on their first visit: the role
//  only exists once a request nominates them. By the time they are one they
//  have usually seen the page already, so replaying the whole thing to add
//  two steps would be a tour they have to sit through to reach the new part.
//  Split, the checklist gives them only the part they have not had.
//
//  THE DOCKET is where a request is worked: its step opens there in place of
//  a dialog. The tour points at it rather than explaining each step.
//
//  THE APPROVE STEP DOES NOT ASSUME A PENDING ROW. A cleared queue is the
//  normal state of an approver's day, not an edge case, so the fallback is
//  the column header — which is present whenever the column is — and it is
//  written to describe what will appear rather than what is there.
///  +-----------------------------------------------------------------+

export const requestsTour: TourDefinition = {
  id: "requests",
  steps: [
    {
      id: "table",
      anchors: ['[data-tour="requests-table"]'],
      title: "Every request you can see",
      description:
        "Yours, and anything waiting on you. Each row says whose move it is; when it's yours, the button there takes it. Arriving from an email pins the list to that one request.",
      side: "right",
      required: true,
    },
    {
      id: "views",
      anchors: ['[data-tour="requests-views"]', '[data-tour="requests-table"]'],
      title: "Views",
      description:
        "Needs you is what you can act on now. In progress is everything still open, Done and Rejected are how requests close.",
      side: "bottom",
      align: "start",
      required: true,
    },
    {
      id: "filter",
      anchors: ['[data-tour="requests-filter"]', '[data-tour="requests-search"]'],
      title: "Narrowing it down",
      description: "Pick one stage, such as Shipped or Overdue, within whichever view you're on.",
      side: "bottom",
    },
    {
      id: "search",
      anchors: ['[data-tour="requests-search"]'],
      title: "Finding one",
      description: "Searches people, items, sites and request numbers. Press / to jump here from anywhere on the page.",
      side: "bottom",
      align: "end",
      required: true,
    },
    {
      id: "docket",
      anchors: ['[data-tour="requests-docket"]'],
      title: "The docket",
      description:
        "The request you've picked: whose move it is, its chain of custody, and the details. Your next step happens right here. On a keyboard, j and k move between rows.",
      side: "left",
    },
  ],
};

export const requestsManagerTour: TourDefinition = {
  id: "requests-manager",
  steps: [
    {
      id: "approve",
      anchors: [
        '[data-tour="requests-approve"]',
        '[data-tour="requests-row-actions"]',
        '[data-tour="requests-actions-header"]',
      ],
      title: "Requests waiting on you",
      description:
        "You've been named as the approver on these. Approve opens it with a confirm; it then goes to IT to fulfil, and the requester is emailed either way.",
      side: "left",
      required: true,
      copyByAnchor: {
        '[data-tour="requests-actions-header"]': {
          title: "Approving requests",
          description:
            "Nothing is waiting on you right now. When something is, it shows here and its docket offers Approve and Reject. You'll get an email as well.",
        },
        '[data-tour="requests-row-actions"]': {
          description:
            "Your move on a row is a button here. When you're named as approver on a request, its docket offers Approve and Reject.",
        },
      },
    },
    {
      // NO FALLBACK, deliberately. Giving this the actions-column header as a
      // second anchor meant that whenever the queue was clear BOTH manager
      // steps landed on the same element, and dedupeAdjacent folded them into
      // one step carrying two descriptions. Better to drop it: the step above
      // already names Reject in both of its fallback wordings, so nothing is
      // left unsaid, and every state produces copy written for that state
      // rather than two sentences stitched together.
      id: "reject",
      anchors: ['[data-tour="requests-reject"]'],
      title: "Turning one down",
      description:
        "Reject is beside Approve in the docket. Give a reason: it's what the requester reads, so it's worth a sentence.",
      side: "left",
    },
  ],
};
