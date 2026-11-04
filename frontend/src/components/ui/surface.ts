///  +-----------------------------------------------------------------+
///  |                  FLOATING LAYERS                                |
///  +-----------------------------------------------------------------+
//
//  One spec for everything that floats above the page (select lists,
//  dropdown menus, popovers, combobox lists), so they cannot drift apart:
//  a sheet with a hairline, a 10 design px radius and the menu shadow. Rows
//  are 34 design px with a 7px radius and the hover tint when highlighted.
//  Shadows only ever appear on these layers; everywhere else, borders do
//  the work.
///  +-----------------------------------------------------------------+

export const FLOATING_SURFACE =
  "z-50 rounded-10 border border-line bg-sheet text-tx shadow-menu outline-none data-[state=open]:animate-pop-in motion-reduce:animate-none";

export const MENU_ROW =
  "relative flex min-h-8.5 w-full cursor-pointer items-center gap-2.5 rounded-7 px-2.5 py-1.5 text-left font-sans fs-13 text-tx outline-none select-none data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:text-dis";
