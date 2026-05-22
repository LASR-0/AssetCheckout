type Props = {
  page: number;
  setPage: (p: number) => void;
  count: number;
  total: number;
  totalItems: number;
};

export default function RequestsPagination({
  page,
  setPage,
  count,
  total,
  totalItems
}: Props) {

  const start = (page - 1) * total + 1;
  const end = Math.min(page * total, totalItems);

  const label = `Showing ${start}-${end} requests, page ${page} of ${count}`;

  return (
    
    <div className="p-4 bg-surface-container-low/100 border-t border-outline flex justify-between items-center rounded-bl-xl rounded-br-xl">

      {/* LEFT TEXT */}
      <span className="text-xs text-info-light font-label">
        {label}
      </span>

      {/* RIGHT CONTROLS */}
      <div className="flex gap-1">

        {/* PREV */}
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          className="p-1 rounded hover:cursor-pointer transition-colors text-on-surface-variant disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_left
          </span>
        </button>

        {/* NEXT */}
        <button
          onClick={() => setPage(page + 1)}
          disabled={page === count }
          className="p-1 rounded hover:cursor-pointer transition-colors text-on-surface-variant disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-sm">
            chevron_right
          </span>
        </button>

      </div>
    </div>
  );
}