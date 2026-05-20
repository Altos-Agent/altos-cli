export const ToggleRow = ({
  label,
  description,
  checked = false
}: {
  label: string;
  description: string;
  checked?: boolean;
}) => (
  <label className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-surface-elevated p-4">
    <span>
      <span className="block text-sm font-medium text-ink">{label}</span>
      <span className="mt-1 block text-sm text-muted">{description}</span>
    </span>
    <input
      checked={checked}
      className="h-5 w-5 accent-accent-blue"
      readOnly
      type="checkbox"
    />
  </label>
);