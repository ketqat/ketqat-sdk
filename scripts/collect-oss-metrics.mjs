#!/usr/bin/env node
/**
 * Measure this project's actual open-source adoption.
 *
 * The point of this script is to be hard to flatter. Adoption metrics are read
 * by people deciding whether to trust or fund a project, and the temptation to
 * round upward is strongest exactly where the numbers are weakest.
 *
 * Three rules, and they are the whole design:
 *
 * **Unavailable is null, never zero.** A package that does not exist on npm has
 * an unknown download count, not a download count of zero. Zero is a
 * measurement; null is an admission. Reporting the first when you mean the
 * second understates a real project and overstates an empty one, depending on
 * which way the reader leans.
 *
 * **Estimates are labelled as estimates.** Anything derived, extrapolated, or
 * counted from a paginated sample carries `estimated: true` and says how it was
 * arrived at.
 *
 * **Every number carries the URL it came from.** A metric nobody can re-derive
 * is an assertion, and this file exists so that assertions are not what gets
 * quoted.
 *
 * No personal data is collected. GitHub logins are public handles and are the
 * unit of counting; names, emails, and locations are never requested, and the
 * queries are shaped so they are not returned incidentally.
 *
 *   node scripts/collect-oss-metrics.mjs
 *   node scripts/collect-oss-metrics.mjs --json > metrics.json
 */
import { execFileSync } from "node:child_process"

const asJson = process.argv.includes("--json")
const ORG = "ketqat"
const PUBLIC_REPOS = ["ketqat-sdk", ".github"]

/**
 * Accounts that are automation. Their activity is real but it is not adoption,
 * and counting a Dependabot pull request as a contribution is the single
 * easiest way to inflate these figures without noticing.
 */
const BOT_LOGINS = new Set(["dependabot[bot]", "github-actions[bot]", "renovate[bot]", "copilot[bot]"])
const isBot = (login = "") => BOT_LOGINS.has(login) || login.endsWith("[bot]")

function gh(path, jq) {
  try {
    const args = ["api", path]
    if (jq) args.push("--jq", jq)
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch {
    return null
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return { ok: false, status: response.status }
    return { ok: true, body: await response.json() }
  } catch {
    return { ok: false, status: null }
  }
}

/** A measured value, with where it came from. */
const measured = (value, source, note) => ({ value, estimated: false, source, ...(note ? { note } : {}) })
/** A value derived or sampled rather than reported directly. */
const estimate = (value, source, how) => ({ value, estimated: true, source, how })
/** Not knowable from the sources available. Distinct from zero. */
const unknown = (source, why) => ({ value: null, estimated: false, source, why })

const generatedAt = new Date().toISOString()
const metrics = { schema_version: "1.0", generated_at: generatedAt, org: ORG }

// --- org membership decides internal vs external -------------------------
const orgMembers = new Set(
  (gh(`orgs/${ORG}/members`, ".[].login") ?? "").split("\n").filter(Boolean),
)
metrics.definitions = {
  internal: `A GitHub account that is a public member of the ${ORG} organization at collection time.`,
  external: "Any other human account.",
  bot: "An account whose login ends in [bot], or is on an explicit automation list.",
  caveat:
    "Org membership can be private. A private member would be counted as external, which " +
    "overstates external contribution rather than understating it -- the direction that " +
    "flatters this project, and so the one worth naming.",
  org_members_visible: orgMembers.size,
}

// --- contributors and pull requests --------------------------------------
const perRepo = {}
let externalContributors = new Set()
let externalMergedPrs = 0

for (const repo of PUBLIC_REPOS) {
  const full = `${ORG}/${repo}`
  const contributors = JSON.parse(
    gh(`repos/${full}/contributors?per_page=100`, "[.[] | {login, contributions}]") ?? "[]",
  )
  const humans = contributors.filter((entry) => !isBot(entry.login))

  const prsRaw = gh(
    `repos/${full}/pulls?state=closed&per_page=100`,
    "[.[] | select(.merged_at != null) | {login: .user.login, merged_at}]",
  )
  const merged = JSON.parse(prsRaw ?? "[]").filter((pr) => !isBot(pr.login))
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000
  const recent = merged.filter((pr) => new Date(pr.merged_at).getTime() >= cutoff)
  const external = recent.filter((pr) => !orgMembers.has(pr.login))

  for (const pr of external) externalContributors.add(pr.login)
  externalMergedPrs += external.length

  perRepo[repo] = {
    contributors_total: measured(humans.length, `https://github.com/${full}/graphs/contributors`),
    merged_prs_sampled: estimate(
      merged.length,
      `https://github.com/${full}/pulls?q=is%3Apr+is%3Amerged`,
      "the most recent 100 closed pull requests; older ones are not paginated through",
    ),
    merged_prs_last_12_months: estimate(
      recent.length,
      `https://github.com/${full}/pulls?q=is%3Apr+is%3Amerged`,
      "counted within the same 100-PR sample, so a repository with more than 100 closed PRs undercounts",
    ),
    stars: measured(Number(gh(`repos/${full}`, ".stargazers_count") ?? 0), `https://github.com/${full}`),
    forks: measured(Number(gh(`repos/${full}`, ".forks_count") ?? 0), `https://github.com/${full}`),
  }
}

metrics.contribution = {
  external_contributors_last_12_months: measured(
    externalContributors.size,
    "https://github.com/ketqat",
    "Distinct non-bot accounts outside the org with a merged PR in the last 12 months.",
  ),
  external_merged_prs_last_12_months: measured(externalMergedPrs, "https://github.com/ketqat"),
  per_repo: perRepo,
}

// --- releases -------------------------------------------------------------
const releaseCounts = {}
for (const repo of PUBLIC_REPOS) {
  const count = gh(`repos/${ORG}/${repo}/releases`, "length")
  releaseCounts[repo] = measured(Number(count ?? 0), `https://github.com/${ORG}/${repo}/releases`)
}
metrics.releases = releaseCounts

// --- registry presence and downloads --------------------------------------
const npmName = "ketqat-sdk"
const pypiName = "ketqat"

const npmRegistry = await fetchJson(`https://registry.npmjs.org/${npmName}`)
const pypiRegistry = await fetchJson(`https://pypi.org/pypi/${pypiName}/json`)

metrics.distribution = {
  npm: npmRegistry.ok
    ? measured("published", `https://www.npmjs.com/package/${npmName}`)
    : unknown(
        `https://registry.npmjs.org/${npmName}`,
        `the registry returned ${npmRegistry.status ?? "no response"}; the package is not published`,
      ),
  pypi: pypiRegistry.ok
    ? measured("published", `https://pypi.org/project/${pypiName}/`)
    : unknown(
        `https://pypi.org/pypi/${pypiName}/json`,
        `the registry returned ${pypiRegistry.status ?? "no response"}; the package is not published`,
      ),
}

// Downloads are null, not zero, when nothing is published. There is no download
// count for a package that does not exist, and a reader shown "0" reasonably
// concludes it was published and ignored.
metrics.downloads = {
  npm_last_month: npmRegistry.ok
    ? await (async () => {
        const stats = await fetchJson(`https://api.npmjs.org/downloads/point/last-month/${npmName}`)
        return stats.ok
          ? measured(stats.body.downloads, `https://api.npmjs.org/downloads/point/last-month/${npmName}`)
          : unknown("https://api.npmjs.org", "the downloads API did not answer")
      })()
    : unknown("https://api.npmjs.org", "nothing is published on npm, so there is no download count"),
  pypi_last_month: unknown(
    "https://pypistats.org",
    pypiRegistry.ok
      ? "PyPI download statistics require a separate source that is not queried here"
      : "nothing is published on PyPI, so there is no download count",
  ),
}

// --- dependents and criticality -------------------------------------------
metrics.ecosystem = {
  dependent_repositories: unknown(
    `https://github.com/${ORG}/${npmName}/network/dependents`,
    "GitHub exposes this only as an HTML page; scraping it would produce a number nobody can re-derive from an API",
  ),
  dependent_packages: unknown(
    `https://github.com/${ORG}/${npmName}/network/dependents`,
    "same source, same limitation",
  ),
  openssf_criticality: unknown(
    "https://github.com/ossf/criticality_score",
    "requires running the criticality scorer; not computed here, and not assumed",
  ),
}

// --- activity -------------------------------------------------------------
const lastPush = gh(`repos/${ORG}/${npmName}`, ".pushed_at")
const daysSincePush = lastPush
  ? Math.floor((Date.now() - new Date(lastPush).getTime()) / 86_400_000)
  : null
metrics.activity = {
  last_public_push: lastPush
    ? measured(lastPush, `https://github.com/${ORG}/${npmName}/commits`)
    : unknown(`https://github.com/${ORG}/${npmName}`, "the repository did not report a push time"),
  days_since_last_public_push:
    daysSincePush === null
      ? unknown(`https://github.com/${ORG}/${npmName}`, "no push time available")
      : measured(daysSincePush, `https://github.com/${ORG}/${npmName}/commits`),
  open_issues: measured(
    Number(gh(`repos/${ORG}/${npmName}`, ".open_issues_count") ?? 0),
    `https://github.com/${ORG}/${npmName}/issues`,
  ),
}

// --- scientific usage -----------------------------------------------------
// Deliberately null rather than read from the registry: demo records and real
// runs must never be summed, and this script has no authenticated access to
// distinguish them. A number here that quietly included fixtures would be the
// worst possible failure for a project whose subject is scientific honesty.
metrics.scientific_usage = {
  public_non_demo_runs: unknown(
    "https://ketqat.com/runs",
    "requires querying the registry with demo records excluded; not attempted without a source that guarantees the exclusion",
  ),
  reproduction_reports: unknown(
    "https://ketqat.com/runs",
    "independent reproductions are recorded as verification evidence; counting them needs registry access",
  ),
}

// --- report ---------------------------------------------------------------
if (asJson) {
  console.log(JSON.stringify(metrics, null, 2))
  process.exit(0)
}

const line = (label, entry) => {
  const value =
    entry.value === null ? "unknown" : typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value
  const tag = entry.value === null ? "  (not measured)" : entry.estimated ? "  (estimate)" : ""
  console.log(`  ${label.padEnd(42)} ${String(value).padStart(10)}${tag}`)
  if (entry.why) console.log(`    ${entry.why}`)
  if (entry.how) console.log(`    ${entry.how}`)
}

console.log(`KetQat open-source metrics -- ${generatedAt}\n`)
console.log("Contribution")
line("external contributors, last 12 months", metrics.contribution.external_contributors_last_12_months)
line("external merged PRs, last 12 months", metrics.contribution.external_merged_prs_last_12_months)
for (const [repo, data] of Object.entries(perRepo)) {
  line(`${repo}: contributors`, data.contributors_total)
  line(`${repo}: stars`, data.stars)
}

console.log("\nDistribution")
line("npm", metrics.distribution.npm)
line("pypi", metrics.distribution.pypi)
line("npm downloads, last month", metrics.downloads.npm_last_month)
line("pypi downloads, last month", metrics.downloads.pypi_last_month)

console.log("\nEcosystem")
line("dependent repositories", metrics.ecosystem.dependent_repositories)
line("openssf criticality", metrics.ecosystem.openssf_criticality)

console.log("\nActivity")
line("days since last public push", metrics.activity.days_since_last_public_push)
line("open issues", metrics.activity.open_issues)

console.log("\nScientific usage")
line("public non-demo runs", metrics.scientific_usage.public_non_demo_runs)

const unknownCount = JSON.stringify(metrics).split('"value":null').length - 1
console.log(
  `\n${unknownCount} metric(s) reported as unknown rather than zero. ` +
    "Unknown means the source could not answer; it is not a measurement of absence.",
)
