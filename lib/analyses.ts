import { createSupabaseClient } from "./supabase";

// How many rows the dashboard reads at once. The total comes back alongside, so
// a longer list is reported as cut off rather than looking complete.
const LIST_LIMIT = 50;

type AnalysisListItem = {
  id: string;
  status: string;
  created_at: string;
  project: { repo_owner: string; repo_name: string };
};

type AnalysisList =
  | { ok: true; analyses: AnalysisListItem[]; total: number }
  | { ok: false; message: string };

// There is no organization filter here, on purpose. The policy on each table
// returns only the rows of the organization on the session token, so the same
// query shows a different list after switching. A filter in this function
// would hide a wrong policy instead of exposing it.
export async function listAnalyses(): Promise<AnalysisList> {
  const { data, count, error } = await createSupabaseClient()
    .from("analyses")
    .select("id, status, created_at, project:projects (repo_owner, repo_name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return { ok: false, message: error.message };
  }
  // Without the total there is no telling whether the list was cut off, so a
  // missing one is a failed read rather than a guess at the row count.
  if (count === null) {
    return { ok: false, message: "The total number of analyses did not come back." };
  }
  return { ok: true, analyses: data, total: count };
}
