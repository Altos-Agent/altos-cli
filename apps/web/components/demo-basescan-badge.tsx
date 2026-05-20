export const isDemoBasescanUrl = (value: string | null | undefined) =>
  Boolean(value?.includes("demo=true"));

export const DemoBasescanBadge = () => (
  <span
    className="inline-flex rounded-xs border border-accent-yellow/30 bg-accent-yellow-soft px-2 py-1 text-xs font-semibold text-accent-yellow"
    title="This is seeded demo data, not a real submitted transaction."
  >
    DEMO
  </span>
);