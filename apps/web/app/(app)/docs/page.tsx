import Link from "next/link";
import { Card, PageHeader } from "../../../components/ui";

const docs = [
  ["Local setup", "/docs/LOCAL_SETUP.md"],
  ["Operations runbook", "/docs/OPERATIONS_RUNBOOK.md"],
  ["Basescan links", "/docs/BASESCAN_LINKS.md"],
  ["Wallet security", "/architecture/01-wallet-security.md"]
] as const;

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Docs"
        description="Reference points for local operation, security rules, and read-only Base integrations."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {docs.map(([title, path]) => (
          <Card key={path} className="p-5">
            <h2 className="font-semibold text-slate-50">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{path}</p>
            <Link
              className="mt-4 inline-flex text-sm font-medium text-blue-300 hover:text-blue-100"
              href="#"
            >
              Available in repository
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
