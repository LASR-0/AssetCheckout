///  +-----------------------------------------------------------------+
///  |                     WHAT SCROLLS                                |
///  +-----------------------------------------------------------------+
//
//  Not the window. The shell fills the viewport (bar, page, footer) and
//  only the page between them scrolls, as in the designs. That is what lets
//  Requests and Settings dock an inspector beside a list that scrolls on its
//  own. Anything that used to read or move window.scrollY reads this instead.
///  +-----------------------------------------------------------------+

export const SCROLL_ROOT_ID = "app-main";

/** The page's scroll container, once the shell has mounted. */
export function scrollRoot(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById(SCROLL_ROOT_ID);
}
