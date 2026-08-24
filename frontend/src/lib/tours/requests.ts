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
        "Yours, and anything waiting on you. Arriving from an email or the home page pins it to that one row — clear the pin to see the rest.",
      side: "top",
      required: true,
    },
    {
      id: "search",
      anchors: ['[data-tour="requests-search"]'],
      title: "Finding one",
      description:
        "Searches names, categories and models. Not request numbers — use the link in the email for those, it opens straight to the row.",
      side: "bottom",
      align: "start",
      required: true,
    },
    {
      id: "filter",
      anchors: ['[data-tour="requests-filter"]', '[data-tour="requests-search"]'],
      title: "Narrowing it down",
      description:
        "Filter by stage — still in progress, finished, turned down, or waiting at any particular point.",
      side: "bottom",
    },
    {
      id: "page-size",
      anchors: ['[data-tour="requests-page-size"]'],
      title: "How much at once",
      description: "Show more rows per page if you're scanning a long list.",
      side: "bottom",
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
        "You've been named as the approver on these. Approve sends it to IT to fulfil; the requester is emailed either way.",
      side: "left",
      required: true,
      copyByAnchor: {
        '[data-tour="requests-actions-header"]': {
          title: "Approving requests",
          description:
            "Nothing is waiting on you right now. When something is, Approve and Reject appear in this column — and you'll get an email as well.",
        },
        '[data-tour="requests-row-actions"]': {
          description:
            "Actions you can take on a row live here. When you're named as approver on a request, Approve and Reject appear among them.",
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
        "Reject asks you for a reason, and the reason is what the requester reads — so it's worth a sentence.",
      side: "left",
    },
  ],
};
