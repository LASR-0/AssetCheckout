type Props = {
  assetTag: string;
  modelName: string;
  userName: string;
  onDismiss: () => void;
};
 
export default function DeploymentSuccess({
  assetTag,
  modelName,
  userName,
  onDismiss,
}: Props) {
  return (
    <div className="bg-success-form rounded-xl px-10 py-10 text-center">
      {/* icon */}
      <div className="mb-6 flex mx-auto bg-surface w-32 h-32 rounded-[100%] justify-center">
        <span className="my-auto material-symbols-outlined !text-6xl text-purple-700">
          check_circle
        </span>
      </div>
 
      {/* Title */}
      <h1 className="text-3xl text-on-surface-variant font-bold mb-3">
        Asset deployed!
      </h1>
 
      {/* Description */}
      <p className="text-on-surface-variant mb-8 max-w-md mx-auto">
        The asset has been checked out to{" "}
        <span className="font-semibold text-nav-text">{userName}</span>{" "}
        and is now assigned to them in Snipe-IT.
      </p>
 
      {/* Asset info card */}
      <div className="bg-surface rounded-lg p-5 text-left mb-8">
        <p className="text-xs uppercase text-on-surface-variant mb-1">
          Deployed asset
        </p>
        <p className="text-lg text-on-surface-variant font-semibold">
          {modelName}
        </p>
        <p className="text-sm text-on-surface-variant">
          Asset Tag: {assetTag}
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