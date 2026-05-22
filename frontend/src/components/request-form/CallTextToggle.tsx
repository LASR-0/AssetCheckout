type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
};

export default function CallTextToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <input
        id="call_text"
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 rounded border-outline-variant/50 bg-surface-container-lowest text-twilight-purple"
      />

      <label
        htmlFor="call_text"
        className="text-sm font-medium text-on-surface"
      >
        Call and Text capabilities
      </label>
    </div>
  );
}