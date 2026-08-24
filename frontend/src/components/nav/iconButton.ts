/**
 * Shared style for the square icon chips in the navbar's right-hand cluster —
 * rounded-md square, outline border, house shadow, 22px icon.
 *
 * Its own module rather than an export from Navbar, because TourButton needs
 * it and Navbar renders TourButton. Importing it back out of Navbar worked,
 * but only by accident: the cycle resolves because the constant is read
 * during render rather than at module evaluation, which is the kind of thing
 * that stops being true the first time somebody hoists it.
 */
export const ICON_BUTTON =
  "w-10 h-10 grid place-items-center rounded-md border border-outline shadow-sm hover:cursor-pointer transition";
