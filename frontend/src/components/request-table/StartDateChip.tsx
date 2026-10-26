import { formatStartLong, formatStartShort, isStartPending } from "@/lib/startDate";

///  +-----------------------------------------------------------------+
///  |                       "STARTS 12 NOV"                           |
///  +-----------------------------------------------------------------+
//
//  Shown while a new starter's first day is still ahead, which is exactly the
//  window in which their request is quiet: no reminders, no escalation. A
//  keeper looking at a device that has sat on the shelf for three weeks with
//  no chasing needs to see why, and when it will start.
//
//  Renders nothing once the day arrives — from then on the request is an
//  ordinary one and the chip would only be clutter.
//
//  `onClick` makes it the admin's way in to the date: the edit dialog refuses
//  fulfilled requests, and this one matters most after fulfilment.
///  +-----------------------------------------------------------------+

type Props = {
  startDate: string | null | undefined;
  onClick?: () => void;
};

const CHIP =
  "inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide " +
  "bg-status-pending/10 text-status-pending border border-status-pending/30";

export default function StartDateChip({ startDate, onClick }: Props) {
  if (!startDate || !isStartPending(startDate)) return null;

  const title = `Starts ${formatStartLong(startDate)}. Reminders are held until then.`;
  const content = (
    <>
      <span className="material-symbols-outlined !text-[11px]">event_upcoming</span>
      Starts {formatStartShort(startDate)}
    </>
  );

  if (!onClick) {
    return (
      <span className={CHIP} title={title}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${CHIP} hover:cursor-pointer hover:bg-status-pending/20 transition-colors`}
      title={`${title} Click to change it.`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {content}
    </button>
  );
}
