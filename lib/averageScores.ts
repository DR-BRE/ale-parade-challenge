// Average Rate-my-G accuracy per person. Given a flat list of score rows,
// return each profile's mean score rounded to a whole percent. Profiles with
// no rows are simply absent from the result (the UI shows a dash).
export function averagesByProfile(
  rows: { profile_id: string; score: number }[]
): Record<string, number> {
  const sum: Record<string, number> = {};
  const n: Record<string, number> = {};
  for (const r of rows) {
    sum[r.profile_id] = (sum[r.profile_id] || 0) + r.score;
    n[r.profile_id] = (n[r.profile_id] || 0) + 1;
  }
  const avg: Record<string, number> = {};
  for (const id in sum) avg[id] = Math.round(sum[id] / n[id]);
  return avg;
}
