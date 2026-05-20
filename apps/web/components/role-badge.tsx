import type { OperatorRole } from "../lib/types";

const roleConfig: Record<OperatorRole, { label: string; color: string }> = {
  admin: { label: "ADMIN", color: "bg-red-900 text-red-200" },
  operator: { label: "OPERATOR", color: "bg-blue-900 text-blue-200" },
  viewer: { label: "VIEWER", color: "bg-gray-700 text-gray-300" },
};

interface RoleBadgeProps {
  role: OperatorRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfig[role] ?? roleConfig.viewer;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${config.color}`}>
      {config.label}
    </span>
  );
}