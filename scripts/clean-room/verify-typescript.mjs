/**
 * Verify the study records with the TypeScript half of the release, as a
 * consumer holding only the npm tarball.
 *
 * Every record read here comes off disk as JSON, never handed over in memory
 * from the builder: a recipient has a file, and a verifier that only ever sees
 * the object its own builder produced cannot tell you whether the file survives
 * the round trip.
 *
 * The last section writes `digests-node.json`. That file is the TypeScript side
 * of the parity claim, and `compare-languages.mjs` is where it meets Python's.
 * It is written even when a purpose refuses, with the refusal *code* in place of
 * a digest, because "both languages refuse this projection, with the same code"
 * is as much a parity statement as "both languages produce this hex" -- and a
 * corpus that silently dropped the refusing cases would be a corpus selected for
 * agreeing.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  CONFIRMATION_RECEIPT_LIMITATIONS,
  STUDY_HASH_RULES_ID,
  STUDY_RECORD_KINDS,
  StudySchema,
  receiptGrantsScope,
  recordHash,
  receiptHash,
  semanticHash,
  studySelfHash,
  planExecutability,
  verifyConfirmationReceipt,
  verifyEvidenceGraph,
  verifyExecutionCapsule,
  verifyPlanConfirmation,
  verifyResearchPackage,
  verifyStudyEventChain,
  verifyStudySelfHash,
} from "ketqat-sdk/study"

import { clearRecord, done, must, readRecord, writeRecord } from "./support.mjs"

// Before anything: this run's output, gone, so a failure here cannot leave a
// previous run's digests behind for `compare-languages.mjs` to read as ours.
clearRecord("digests-node")

const AT = { used: "2026-09-02T09:00:00.000Z", afterExpiry: "2026-09-09T09:00:00.000Z" }

// ------------------------------------------------------------ where this came from
//
// The installed package's own root, derived from the resolution rather than
// assumed. Everything below that needs a *file* from the package -- the shipped
// JSON Schemas, the exports map -- is read relative to this, so a wrong answer
// here fails loudly rather than reading some other copy.
const studyEntry = fileURLToPath(import.meta.resolve("ketqat-sdk/study"))
const packageRoot = dirname(dirname(dirname(studyEntry)))
const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
must(
  installed.name === "ketqat-sdk" && studyEntry.includes(`${join("node_modules", "ketqat-sdk")}`),
  `ketqat-sdk/study resolves to ${studyEntry}, inside an installed package`,
)

// --------------------------------------------------------------------- the study

const study = readRecord("study")
const parsedStudy = StudySchema.parse(study)
must(parsedStudy.study_id === study.study_id, "a Study record read from JSON parses against the shipped contract")

const studyHash = verifyStudySelfHash("study", study)
must(
  studyHash.valid && studyHash.purpose === "semantic",
  `the study's ${studyHash.self_hash_field} is its semantic digest and matches (${studyHash.expected.slice(0, 16)}…)`,
)

// A study's identity is its id and its immutable core, so renaming it must not
// move the digest. Checked here rather than trusted, because this is the one
// property the family states most loudly and the one a projection change would
// break silently.
const renamed = { ...study, presentation: { ...study.presentation, title: "A different title" } }
must(
  studySelfHash("study", renamed) === study.content_hash,
  "renaming a study leaves its identity where it was",
)

const chain = verifyStudyEventChain([readRecord("study-event")], null)
must(chain.valid, `the study's event trail verifies (${chain.problems.length} problem(s))`)

// ---------------------------------------------------------------------- the plan

const plan = readRecord("study-plan")
const revised = readRecord("study-plan-revision-2")

const planHash = verifyStudySelfHash("study_plan", plan)
must(planHash.valid, `the plan's content hash matches its contents (${planHash.expected.slice(0, 16)}…)`)

const executability = planExecutability(plan)
must(
  executability.executable,
  `the plan's pins name programs rather than labels (${executability.shortfalls.length} shortfall(s))`,
)

const confirmed = verifyPlanConfirmation(plan, plan.content_hash, {
  revision_hash: plan.content_hash,
  revision: plan.revision,
})
must(confirmed.ok, "a confirmation naming this plan's own digest authorises it")

// The property a bare hash comparison cannot have: the plan moved, so the
// approval has to. Nothing revoked anything.
const stale = verifyPlanConfirmation(revised, plan.content_hash, {
  revision_hash: revised.content_hash,
  revision: revised.revision,
})
must(
  !stale.ok && stale.refusal.code === "PLAN_REVISION_SUPERSEDED",
  `a confirmation of revision ${plan.revision} does not carry to revision ${revised.revision} (${stale.ok ? "accepted" : stale.refusal.code})`,
)

// ------------------------------------------------------- the confirmation receipt
//
// The low-level contract underneath every hosted run: what a plan hash could not
// say -- who approved, through which client, under which scope, having been
// shown what, until when -- and, in the record itself, that none of it is a
// signature.

const receipt = readRecord("confirmation-receipt")

must(
  verifyStudySelfHash("confirmation_receipt", receipt).valid,
  "the receipt's content hash matches its contents",
)
must(
  receipt.plan_semantic_hash === semanticHash("study_plan", plan),
  "the receipt binds to the plan's semantic content, not only to its revision pointer",
)
must(
  receipt.max_credits === plan.max_credits,
  `the receipt's ceiling is the plan's own (${receipt.max_credits}), never the caller's`,
)
must(receipt.attestation_level === "hash_only", "the receipt claims attestation_level hash_only and nothing more")
must(
  CONFIRMATION_RECEIPT_LIMITATIONS.every((limitation) => receipt.limitations.includes(limitation)),
  `the receipt carries all ${CONFIRMATION_RECEIPT_LIMITATIONS.length} standing limitations in the record itself`,
)
must(
  Object.keys(receipt).filter((key) => /signature|signed|certificate/.test(key)).length === 0,
  "no field of the receipt is shaped like a signature",
)
must(
  receiptGrantsScope(receipt, "study:execute") && !receiptGrantsScope(receipt, "study:execute_all"),
  "scope is a membership test: study:execute does not widen to study:execute_all",
)

const live = verifyConfirmationReceipt(receipt, plan, { at: AT.used })
must(live.ok, "the receipt authorises the plan it was given for, inside its window")

const expired = verifyConfirmationReceipt(receipt, plan, { at: AT.afterExpiry })
must(
  !expired.ok && expired.refusal.code === "CONFIRMATION_RECEIPT_EXPIRED",
  `the receipt stops authorising after it expires (${expired.ok ? "accepted" : expired.refusal.code})`,
)

const superseded = verifyConfirmationReceipt(receipt, revised, { at: AT.used })
must(
  !superseded.ok && superseded.refusal.code === "PLAN_REVISION_SUPERSEDED",
  `the receipt does not authorise the revised plan (${superseded.ok ? "accepted" : superseded.refusal.code})`,
)

// --------------------------------------------------------------------- the capsule

const capsule = readRecord("execution-capsule")
const capsuleVerdict = verifyExecutionCapsule(capsule)
must(
  capsuleVerdict.valid && capsuleVerdict.hash_matches,
  "the execution capsule verifies",
  `expected ${capsuleVerdict.expected_hash}, recorded ${capsuleVerdict.actual_hash}; ` +
    `${capsuleVerdict.problems.join("; ") || "no problems reported"}`,
)
must(
  capsuleVerdict.rules_id === STUDY_HASH_RULES_ID,
  `the capsule verified under the rules it names (${capsuleVerdict.rules_id})`,
)
// Two 64-bit values that a canonicalizer built on doubles would round. They are
// carried as exact decimal strings and must survive the file round trip.
must(
  capsule.seed === "18446744073709551615" && capsule.inputs[0].byte_size === "18446744073709551615",
  "64-bit exact values survive the JSON round trip unrounded",
)

// The other question a reader has about a capsule -- did this describe the same
// computation -- ignores who ran it and when.
const reattempted = { ...capsule, execution_receipt: { ...capsule.execution_receipt, attempt: 2 } }
must(
  semanticHash("execution_capsule", reattempted) === semanticHash("execution_capsule", capsule) &&
    recordHash("execution_capsule", reattempted) !== recordHash("execution_capsule", capsule),
  "a second attempt is the same computation and a different record",
)

// -------------------------------------------------------------- the evidence graph

const nodes = readRecord("evidence-nodes")
const edges = readRecord("evidence-edges")
const graph = verifyEvidenceGraph(nodes, edges)
must(
  graph.valid && graph.hashes_match && graph.edges_resolve && graph.edges_permitted && graph.claims_grounded,
  `the evidence graph verifies: ${nodes.length} nodes, ${edges.length} edges, ${graph.problems.length} problem(s)`,
  graph.problems.join("; "),
)

// Edit a node and leave its hash: identity in this graph *is* the hash, so the
// node stops being the node every edge names.
const editedNodes = structuredClone(nodes)
editedNodes[1].label = "Total physical qubits, restated"
const editedGraph = verifyEvidenceGraph(editedNodes, edges)
must(!editedGraph.valid && !editedGraph.hashes_match, "an edited node fails the graph it belongs to")

// ------------------------------------------------------------ the research package

const pkg = readRecord("research-package")
const verdict = verifyResearchPackage(pkg)
must(
  verdict.levels.schema_valid &&
    verdict.levels.canonicalizable &&
    verdict.levels.hash_matches &&
    verdict.levels.record_integrity_valid &&
    verdict.levels.graph_structurally_valid &&
    verdict.levels.provenance_closed &&
    verdict.levels.claims_resolve &&
    verdict.levels.bundles_resolve,
  `the research package verifies to ${verdict.status} (${verdict.findings.length} finding(s))`,
  verdict.findings.map((finding) => `${finding.code} ${finding.path}`).join("; "),
)
must(
  verdict.verification_performed === "INTEGRITY_STRUCTURE_AND_SCIENCE",
  `TypeScript reports what it did: ${verdict.verification_performed}`,
)
// A ladder is only safe to render beside what it does not establish, and the
// shipped build must still be able to say what that is.
must(
  Array.isArray(verdict.not_established) && verdict.not_established.length > 0,
  `the verdict names ${verdict.not_established.length} thing(s) it does not establish`,
)

const tampered = readRecord("research-package-tampered")
const rejected = verifyResearchPackage(tampered)
must(
  !rejected.levels.hash_matches && rejected.status !== "STRUCTURE_VERIFIED",
  `the tampered package is rejected: status ${rejected.status}, hash_matches ${rejected.levels.hash_matches}`,
  `expected ${rejected.expected_hash}, the file claims ${rejected.actual_hash}`,
)
must(
  rejected.findings.some((finding) => finding.path === "$.reproducibility_hash"),
  "the rejection is addressed to the digest that no longer describes the file",
)

// ------------------------------------------------------- the shipped JSON Schemas
//
// Resolved from the installed package, never from a checkout. This half proves
// the files are *there*; `verify_python.py` validates against them with the
// shipped validator, and `compare-languages.mjs` proves the wheel ships the same
// bytes -- so "the shipped schemas" is one set of files in two artifacts rather
// than two sets that happen to share names.
must(
  Array.isArray(installed.files) && installed.files.includes("schemas"),
  "the installed package declares schemas/ among its files",
)
const schemaDirectory = join(packageRoot, "schemas")
const shippedSchemas = STUDY_RECORD_KINDS.map((entry) => entry.record_kind)
  .map((kind) => `${kind.replace(/_/g, "-")}.schema.json`)
  .map((filename) => {
    try {
      return { filename, schema: JSON.parse(readFileSync(join(schemaDirectory, filename), "utf8")) }
    } catch (error) {
      // Named, not left as an ENOENT. A schema that exists only in a checkout
      // validates for maintainers and for nobody else, and the reader of this
      // failure needs to be sent to the `files` list rather than to the schema.
      throw new Error(
        `${filename} is not in the installed package (${schemaDirectory}): ${error.code ?? error.message}. ` +
          "The record kind is declared, so a consumer has nothing to validate it against.",
      )
    }
  })

/**
 * Does this schema pin `hash_rules_id` to the rules this build hashes under?
 *
 * Walked rather than read at a fixed path: the generator emits `$ref` into
 * `definitions`, and the definition's name is the contract's, so a lookup by
 * path would be a second place the naming convention is written down. The pin
 * itself is the thing worth checking -- a schema that accepted any rules id
 * would validate a record this build cannot hash, and validation would then be
 * reporting on a record nobody can address.
 */
const pinsRules = (value) => {
  if (value === null || typeof value !== "object") return false
  if (value.hash_rules_id?.const === STUDY_HASH_RULES_ID) return true
  return Object.values(value).some(pinsRules)
}
for (const { filename, schema } of shippedSchemas) {
  if (!pinsRules(schema)) throw new Error(`${filename} does not pin hash_rules_id to ${STUDY_HASH_RULES_ID}`)
}
must(
  shippedSchemas.length === STUDY_RECORD_KINDS.length,
  `all ${shippedSchemas.length} study record kinds have a shipped JSON Schema pinning ${STUDY_HASH_RULES_ID}`,
)

// -------------------------------------------------------- the declared subpaths
//
// Imported by name, so npm's exports map is what resolves them. A subpath that
// points at something the `files` list never packed resolves here and nowhere in
// `npm test`, which imports `../dist/` by relative path.
const subpaths = Object.keys(installed.exports).map((subpath) => subpath.replace(/^\./, "ketqat-sdk"))
const empty = []
for (const subpath of subpaths) {
  const loaded = await import(subpath)
  const resolved = fileURLToPath(import.meta.resolve(subpath))
  if (!resolved.startsWith(packageRoot)) {
    throw new Error(`${subpath} resolved to ${resolved}, outside the installed package`)
  }
  if (Object.keys(loaded).length === 0) empty.push(subpath)
}
must(
  empty.length === 0,
  `all ${subpaths.length} declared subpaths import and export bindings from the install`,
  `these resolved and exported nothing: ${empty.join(", ")}`,
)

// ----------------------------------------------------------------- the corpus
//
// Every record built in the clean room, under every purpose, plus the four
// artifact-digest cases. Written for `compare-languages.mjs`.
const CORPUS = [
  ["study", "study"],
  ["study_event", "study-event"],
  ["study_plan", "study-plan"],
  ["study_plan", "study-plan-revision-2"],
  ["confirmation_receipt", "confirmation-receipt"],
  ["study_task_authorization", "study-task-authorization"],
  ["task_outcome", "task-outcome"],
  ["execution_capsule", "execution-capsule"],
  ["research_package", "research-package"],
  ["research_package", "research-package-tampered"],
]

const digestsOf = (recordKind, record) => {
  const answers = { self: null, semantic: null, record: null, receipt: null }
  for (const [name, compute] of [
    ["self", () => studySelfHash(recordKind, record)],
    ["semantic", () => semanticHash(recordKind, record)],
    ["record", () => recordHash(recordKind, record)],
    ["receipt", () => receiptHash(recordKind, record)],
  ]) {
    try {
      answers[name] = compute()
    } catch (error) {
      // The refusal code, not the message. A message is written for a reader and
      // is deliberately not a contract between the two languages; a code is.
      answers[name] = `refused:${error.code ?? error.name}`
    }
  }
  return answers
}

const digests = {}
for (const [recordKind, name] of CORPUS) {
  digests[`${recordKind}/${name}`] = digestsOf(recordKind, readRecord(name))
}
for (const [recordKind, name] of [
  ["evidence_node", "evidence-nodes"],
  ["evidence_edge", "evidence-edges"],
]) {
  readRecord(name).forEach((entry, index) => {
    digests[`${recordKind}/${name}[${index}]`] = digestsOf(recordKind, entry)
  })
}

// Stamped with the corpus the records came from. `compare-languages.mjs` will
// not compare two halves that were not computed from the same records, and this
// is what lets it tell.
const corpus = readRecord("corpus")
writeRecord("digests-node", { corpus_id: corpus.corpus_id, digests })
must(
  Object.keys(digests).length === CORPUS.length + nodes.length + edges.length,
  `${Object.keys(digests).length} records hashed under 4 purposes each, for the parity comparison`,
  `corpus ${corpus.corpus_id.slice(0, 16)}… over ${corpus.records.length} files`,
)

done("the TypeScript contracts, from the installed npm tarball")
