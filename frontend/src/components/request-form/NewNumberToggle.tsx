export default function NewNumberToggle() {
  return (
    <div className="flex items-center gap-3">
      <input
        id="new_number"
        type="checkbox"
        className="w-5 h-5 rounded border-outline-variant/50 bg-surface-container-lowest text-twilight-purple"
      />

      <label
        htmlFor="new_number"
        className="text-sm font-medium text-on-surface"
      >
        New Number Required
      </label>
    </div>
  );
}