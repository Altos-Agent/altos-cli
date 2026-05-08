export const ToggleRow = ({
  label,
  description,
  checked = false
}: {
  label: string;
  description: string;
  checked?: boolean;
}) => (
  <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/35 p-4">
    <span>
      <span className="block text-sm font-medium text-slate-100">{label}</span>
      <span className="mt-1 block text-sm text-slate-500">{description}</span>
    </span>
    <input
      checked={checked}
      className="h-5 w-5 accent-blue-500"
      readOnly
      type="checkbox"
    />
  </label>
);
