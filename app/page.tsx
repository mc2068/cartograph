import { auth } from "@clerk/nextjs/server";

export default async function WorkspacePage() {
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

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-3 text-xs">
      {orgName ? (
        <>
          <dt className="text-muted">Organization</dt>
          <dd className="font-medium">{orgName}</dd>
        </>
      ) : null}
      <dt className="text-muted">Organization ID</dt>
      <dd className="font-mono">{orgId}</dd>
    </dl>
  );
}
