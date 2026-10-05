/**
 * Runs the pgTAP suites against the linked (hosted) project.
 *
 * Why not `supabase test db --linked`? Its runner can't see pgTAP's functions
 * on the hosted project ("function plan(integer) does not exist"), although
 * pgTAP itself works there. So each suite runs through `supabase db query`
 * instead, with its ending rewritten: rather than `finish(); rollback;`, the
 * last statement raises an error carrying the results. An error always aborts
 * the transaction, so nothing a test inserted can ever be committed to the
 * real database — the safe failure mode — and the results come back in the
 * error message.
 *
 * Usage: bun scripts/test-db-hosted.ts
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARKER = "MYPADDIE_TAP_RESULTS";
const dir = "supabase/tests";
const work = mkdtempSync(join(tmpdir(), "mypaddie-tap-"));

// pgTAP 1.3 keeps only counters during a run (temp table __tcache__: plan,
// curr_test, failed) — not each test's description. So this reports counts;
// to see *which* test failed, run the same suite locally.
const ending = `
do $tap$
declare
  planned int := (select value from __tcache__ where label = 'plan' limit 1);
  ran int := coalesce((select value from __tcache__ where label = 'curr_test' limit 1), 0);
  failed int := coalesce((select value from __tcache__ where label = 'failed' limit 1), 0);
begin
  -- Raising aborts the transaction: everything the test did is rolled back.
  raise exception '${MARKER} planned=% ran=% failed=%', planned, ran, failed;
end
$tap$;
`;

let failedSuites = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort()) {
  const sql = readFileSync(join(dir, file), "utf8");
  const end = sql.lastIndexOf("select * from finish();");
  if (end === -1) throw new Error(`${file}: no 'select * from finish();' to replace`);
  const path = join(work, file);
  writeFileSync(path, sql.slice(0, end) + ending);

  const proc = Bun.spawnSync(["bunx", "supabase", "db", "query", "--linked", "-f", path], { stdout: "pipe", stderr: "pipe" });
  const out = proc.stdout.toString() + proc.stderr.toString();
  const at = out.indexOf(MARKER);
  if (at === -1) {
    failedSuites++;
    console.log(`✗ ${file}: didn't finish\n${out.slice(-600)}`);
    continue;
  }
  const [, planned, ran, failed] = (out.slice(at).match(/planned=(\d+) ran=(\d+) failed=(\d+)/) ?? []).map(Number);
  const ok = failed === 0 && ran === planned;
  if (!ok) failedSuites++;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${ran! - failed!}/${planned} passed${ran !== planned ? ` (ran ${ran} of ${planned})` : ""}`);
}
process.exit(failedSuites ? 1 : 0);
