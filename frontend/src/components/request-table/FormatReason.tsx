export const formatReason = (text?: string) => {
  if (!text) return ["—"];

  return text.split(/(REJECTED|REQUEST)/g).map((part, i) => {
    if (part === "REJECTED") {
      return (
        <span key={i} className="text-error text-xs bg-error/10 border-[0.5px] border-error py-0.5 px-1 rounded-lg font-semibold mr-1">
          REJECTED
        </span>
      );
    }

    if (part === "REQUEST") {
      return (
        <span key={i} className="text-blue-400 text-xs bg-blue-500/10 border-[0.5px] border-blue-500 py-0.5 px-1 rounded-lg font-semibold mr-1">
          REQUEST
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
};