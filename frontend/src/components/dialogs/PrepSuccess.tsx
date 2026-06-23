type Props = {
  stage: "SHIPPED" | "READY_FOR_COLLECTION";
  userName: string;
  categoryName: string;
  onDismiss: () => void;
};

export default function PrepSuccess({
  stage,
  userName,
  categoryName,
  onDismiss,
}: Props) {
  const shipped = stage === "SHIPPED";

  const icon = shipped ? "local_shipping" : "package_2";
  const title = shipped ? "On its way!" : "Ready for collection!";
  const description = shipped
    ? "has been marked as shipped. They've been notified that it's on the way."
    : "is ready to collect. They've been notified to come and pick it up.";
  const cardLabel = shipped ? "Shipped to" : "Ready for";

  return (
    <div className="bg-success-form rounded-xl px-10 py-10 text-center">
      {/* icon */}
      <div className="mb-6 flex mx-auto bg-surface w-32 h-32 rounded-[100%] justify-center">
        <span className="my-auto material-symbols-outlined !text-6xl text-purple-700">
          {icon}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-3xl text-on-surface-variant font-bold mb-3">
        {title}
      </h1>

      {/* Description */}
      <p className="text-on-surface-variant mb-8 max-w-md mx-auto">
        <span className="font-semibold text-nav-text">{userName}</span>'s{" "}
        <span className="font-semibold text-nav-text">{categoryName}</span>{" "}
        {description}
      </p>

      {/* Info card */}
      <div className="bg-surface rounded-lg p-5 text-left mb-8">
        <p className="text-xs uppercase text-on-surface-variant mb-1">
          {cardLabel}
        </p>
        <p className="text-lg text-on-surface-variant font-semibold">
          {userName}
        </p>
        <p className="text-sm text-on-surface-variant">
          {categoryName}
        </p>
      </div>

      {/* Back to requests button */}
      <button
        onClick={onDismiss}
        autoFocus
        className="bg-primary w-full text-white py-3 rounded-2xl font-semibold hover:cursor-pointer hover:brightness-110"
      >
        <span className="flex items-center justify-center">
          <span className="mr-2">Back to requests</span>
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: `'FILL' 1` }}
          >
            reply
          </span>
        </span>
      </button>
    </div>
  );
}