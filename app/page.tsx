import { auth } from "@clerk/nextjs/server";
import { listAnalyses } from "../lib/analyses";

// Rendered on the server, so it is fixed to UTC rather than the server's own
// timezone, and says so.
function formatStarted(timestamp: string) {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function DashboardPage() {
  // Both values come off the session token, so they are in the first HTML
  // response and nothing here calls Clerk.
  const { orgId, sessionClaims } = await auth();
  const orgName = sessionClaims?.org_name;

  if (!orgId) {
    return (
      <p className="p-3 text-xs text-muted">
        This session has no organization. Pick one from the switcher above.
      </p>
    );
  }

  const result = await listAnalyses();

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-baseline gap-3">
        <h1 className="font-medium">Analyses</h1>
        {orgName ? <span>{orgName}</span> : null}
        <span className="font-mono text-muted">{orgId}</span>
      </div>

      {!result.ok ? (
        // A failed read must not look like a team with no analyses.
        <p role="alert">Could not load analyses: {result.message}</p>
      ) : result.analyses.length === 0 ? (
        <p className="text-muted">This organization has no analyses yet.</p>
      ) : (
        <>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-1 pr-4 font-normal">Repository</th>
                <th className="py-1 pr-4 font-normal">State</th>
                <th className="py-1 font-normal">Started</th>
              </tr>
            </thead>
            <tbody>
              {result.analyses.map((analysis) => (
                <tr key={analysis.id} className="border-b border-border">
                  <td className="py-1 pr-4 font-mono">
                    {analysis.project.repo_owner}/{analysis.project.repo_name}
                  </td>
                  <td className="py-1 pr-4">{analysis.status}</td>
                  <td className="py-1 tabular-nums text-muted">
                    {formatStarted(analysis.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.total > result.analyses.length ? (
            <p className="text-muted">
              Showing the latest {result.analyses.length} of {result.total}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
