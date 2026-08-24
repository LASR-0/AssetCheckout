import type { TourDefinition } from "./types";

///  +-----------------------------------------------------------------+
///  |                       THE HOME TOUR                             |
///  +-----------------------------------------------------------------+
//
//  Ten steps, and the only tour that mentions the tour button — teaching it
//  once is enough, and repeating it on every page would make each of the
//  others one step longer for nothing.
//
//  WRITTEN FOR SOMEBODY WHO HAS NOTHING. Almost every anchor here has a
//  fallback, because the sections this points at are exactly the ones that do
//  not render for a new account. Where the fallback changes what is true, the
//  words change with it — see copyByAnchor.
//
//  NO SPATIAL LANGUAGE. Not "on the right", not "the four tiles above": the
//  holdings grid is four across on a desktop and two on a phone, and the
//  greeting stacks. Every sentence here has to be true at both.
///  +-----------------------------------------------------------------+

export const homeTour: TourDefinition = {
  id: "home",
  steps: [
    {
      id: "welcome",
      anchors: ['[data-tour="home-greeting"]'],
      title: "Welcome to KSB Checkout",
      description:
        "A quick look around — under a minute. You can close this at any point and pick it up again later.",
      side: "bottom",
      align: "start",
      required: true,
    },
    {
      id: "my-stuff",
      anchors: ['[data-tour="home-my-stuff"]', '[data-tour="home-my-stuff-empty"]'],
      title: "What you already have",
      description:
        "Everything recorded against your name — laptops, phones, accessories. If something here looks wrong, select it and tell us.",
      side: "top",
      copyByAnchor: {
        '[data-tour="home-my-stuff-empty"]': {
          description:
            "Anything recorded against your name shows up here. Nothing is yet — if that's wrong, this is where you say so.",
        },
      },
    },
    {
      id: "see-all",
      anchors: [
        '[data-tour="home-see-all-devices"]',
        '[data-tour="home-see-all-accessories"]',
        '[data-tour="home-my-stuff"]',
      ],
      title: "The full list",
      description:
        "Opens everything assigned to you in one place, devices and accessories, with the serial numbers we hold.",
      side: "bottom",
      align: "end",
    },
    {
      id: "report-fault",
      anchors: [
        '[data-tour="home-my-stuff-item"]',
        '[data-tour="home-report-unlogged"]',
        '[data-tour="home-see-all-devices"]',
      ],
      title: "Something not working?",
      description:
        "Pick the item that's playing up and tell us what it's doing. It reaches IT with the serial already attached, so nobody has to ask you for it.",
      side: "bottom",
      required: true,
      copyByAnchor: {
        '[data-tour="home-see-all-devices"]': {
          description:
            "Open your list, pick the item that's playing up, and tell us what it's doing. It reaches IT with the serial already attached.",
        },
      },
    },
    {
      id: "report-unlogged",
      anchors: ['[data-tour="home-report-unlogged"]', '[data-tour="home-see-all-devices"]'],
      title: "Got something we haven't recorded?",
      description:
        "If you're using a device that never made it onto our records, tell us here and we'll add it.",
      side: "bottom",
      required: true,
    },
    {
      id: "request-assets",
      anchors: ['[data-tour="home-request-assets"]', '[data-tour="nav-requests"]'],
      title: "Asking for something new",
      description:
        "Start here for a laptop, phone or anything else. Pick what you need and it routes to the right approver automatically.",
      side: "top",
      required: true,
    },
    {
      id: "request-accessories",
      anchors: ['[data-tour="home-request-accessories"]'],
      title: "Accessories",
      description:
        "Chargers, docks, keyboards and the like — suggested from the equipment you already hold.",
      side: "top",
    },
    {
      id: "nav-assets",
      anchors: ['[data-tour="nav-assets"]', '[data-tour="nav-menu"]'],
      title: "Or from the top bar",
      description:
        "Assets is the same form, reachable from any page — laptops, phones, monitors, anything we issue.",
      side: "bottom",
      align: "start",
      copyByAnchor: {
        // Below md the nav links live behind the burger, so the step points
        // at the way in rather than at a link that is not on screen.
        '[data-tour="nav-menu"]': {
          title: "Or from the menu",
          description:
            "This opens the same links from any page — Assets for anything we issue you,",
        },
      },
    },
    {
      id: "nav-accessories",
      anchors: ['[data-tour="nav-accessories"]', '[data-tour="nav-menu"]'],
      title: "And accessories",
      description:
        "Accessories is next to it — chargers, docks, cables, keyboards. Both forms ask who it's for and route it onwards.",
      side: "bottom",
      align: "start",
      copyByAnchor: {
        // Folded into the step above on mobile, where both land here — see
        // dedupeAdjacent. Written to read as the end of that sentence.
        '[data-tour="nav-menu"]': {
          description: "and Accessories for chargers, docks and cables.",
        },
      },
    },
    {
      id: "your-requests",
      anchors: ['[data-tour="home-recent-requests"]'],
      title: "Keeping track",
      description:
        "The last few things you've asked for. Select any one to open it in the full request log.",
      side: "top",
      required: true,
    },
    {
      id: "statuses",
      anchors: ['[data-tour="home-status-badge"]', '[data-tour="home-stats"]'],
      title: "Where a request has got to",
      description:
        "The badge tells you the stage — waiting on an approver, with IT, on its way, or ready to collect. You'll be emailed as it moves.",
      side: "left",
      copyByAnchor: {
        '[data-tour="home-stats"]': {
          title: "Where your requests have got to",
          description:
            "These count what's in flight, what's landed and what was turned down. Select one to see just those.",
        },
      },
    },
    {
      id: "feedback",
      anchors: ['[data-tour="home-feedback"]', '[data-tour="home-quick-links"]'],
      title: "Tell us how it's going",
      description:
        "Anonymous, and genuinely read — it's how this gets better. There's also a link in the footer of every page.",
      side: "top",
    },
    {
      id: "tour-button",
      anchors: ['[data-tour="nav-tour"]'],
      title: "Lost? Press this",
      description:
        "It walks you through whichever page you're on. Every page has its own, so you never have to remember where something was.",
      side: "bottom",
      align: "end",
      required: true,
    },
  ],
};
