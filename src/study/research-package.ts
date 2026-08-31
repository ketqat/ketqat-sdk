import { z } from "zod"
import {
  CitationSchema,
  EnvironmentSchema,
  IsoDateTimeSchema,
  type Citation,
  type Environment,
} from "../contracts/common.js"
import { isKnown, type Contract } from "../intelligence/measurement.js"
import {
  ContentHashSchema,
  RevisionRefSchema,
  STUDY_SCHEMA_VERSION,
  type RevisionRef,
} from "./common.js"
import {
  EvidenceEdgeSchema,
  EvidenceNodeSchema,
  verifyEvidenceGraph,
  type EvidenceEdge,
  type EvidenceNode,
} from "./evidence.js"
import { STUDY_HASH_RULES_ID, calculateStudyHash, studyRulesIdOf } from "./hashing.js"
import type { StudyRefusal } from "./refusals.js"

/**
 * The bundle a study leaves the building in (ketqat-sdk#259, ADR 0010, RFC 0008 §7).
 *
 * A research package is what somebody actually receives: a report, a methods
 * section, tables of numbers, figures, a CSV, and the command that regenerates
 * all of it. Every one of those is a surface a number can be quoted from, and
 * the failure this module exists to prevent is the one that carries no error
 * message -- a figure in a table nobody can walk back to a run, sitting beside
 * four that they can, and indistinguishable from them to the reader.
 *
 * So the package carries its own evidence graph. `nodes` and `edges` travel with
 * the report rather than being resolved out of a store the recipient does not
 * have, and every table row names a node by hash instead of restating its value.
 * A number in a table *is* a node. A number without one is not a weaker
 * citation; it is unrepresentable.
 *
 * `buildResearchPackage` refuses. It does not warn, it does not drop the
 * offending row, and it does not export with a caveat attached: it returns the
 * refusals and no package at all. A warning is something a pipeline logs and a
 * reader never sees, and the property this family exists to hold is that the
 * caveat and the number cannot become separated.
 *
 * `verifyResearchPackage` recomputes rather than reads, for the same reason
 * `verifyBundle` does. A hash check alone catches an edit; it does not catch an
 * edit followed by a re-hash, which is what fabricating a result actually looks
 * like. Identity in this graph *is* the content hash, so re-hashing an edited
 * node changes what that node is, and every row, edge and claim-map entry naming
 * the old hash stops resolving. That structural check is reported separately
 * from the cryptographic one, because "this file was edited" and "these numbers
 * do not join up" send a reader to different places.
 */

export const ResultRowSchema = z.object({
  /** What the row is called in the table a reader sees. */
  label: z.string().min(1),
  /**
   * The node the value is read from. There is deliberately no `value` field
   * beside it: a row that carried its own copy of the number could disagree with
   * the node, and the copy is what would end up in the slide.
   */
  node_hash: ContentHashSchema,
})
export type ResultRow = z.infer<typeof ResultRowSchema>

export const FigureSchema = z.object({
  label: z.string().min(1),
  /** Inline SVG, so a figure cannot resolve to a different picture later. */
  svg: z.string().min(1),
})
export type Figure = z.infer<typeof FigureSchema>

/**
 * What one claim in the package rests on, stated rather than inferred.
 *
 * The graph already holds the edges, so this map is redundant -- and that is the
 * point. It is the export's own assertion about which evidence it believes backs
 * which claim, written down where it can be checked against the graph instead of
 * recomputed from it by every consumer with its own idea of what "supports"
 * means. The two disagreeing is a finding, not a rounding error.
 */
export const ClaimEvidenceEntrySchema = z.object({
  claim_node_hash: ContentHashSchema,
  /** At least one: an entry with an empty list is the absence this family refuses. */
  evidence_node_hashes: z.array(ContentHashSchema).min(1),
  /** The edges that carry the relation, so a reader can read the rationale rather than guess it. */
  edge_hashes: z.array(ContentHashSchema),
})
export type ClaimEvidenceEntry = z.infer<typeof ClaimEvidenceEntrySchema>

export interface ResearchPackage {
  schema_version: string
  hash_rules_id: "study-v1"
  package_kind: "KETQAT_RESEARCH_PACKAGE"
  study_ref: string
  plan_ref: RevisionRef
  report_markdown: string
  methods: string
  assumption_rows: ResultRow[]
  result_rows: ResultRow[]
  csv: string
  figures: Figure[]
  references: Citation[]
  bundle_refs: string[]
  environment: Environment
  reproduction_command: string
  nodes: EvidenceNode[]
  edges: EvidenceEdge[]
  claim_evidence_map: ClaimEvidenceEntry[]
  limitations: string[]
  failed_checks: string[]
  is_demo: boolean
  created_at?: string
  reproducibility_hash: string
}

export const ResearchPackageSchema: Contract<ResearchPackage> = z.object({
  schema_version: z.string().min(1),
  /** Required, never inferred. A package that does not name its rules is refused, not defaulted. */
  hash_rules_id: z.literal(STUDY_HASH_RULES_ID),
  /** The discriminant, in the `bundle_kind` idiom: one string that says what this file is. */
  package_kind: z.literal("KETQAT_RESEARCH_PACKAGE"),
  study_ref: ContentHashSchema,
  /** The confirmed plan revision this package answers. A report for a plan nobody approved has no provenance. */
  plan_ref: RevisionRefSchema,
  report_markdown: z.string().min(1),
  /** How the numbers were produced, in prose. Required: a result with no method is an anecdote. */
  methods: z.string().min(1),
  assumption_rows: z.array(ResultRowSchema),
  /** Numbers in tables are nodes. The build refuses any row whose node the package does not carry. */
  result_rows: z.array(ResultRowSchema),
  csv: z.string(),
  figures: z.array(FigureSchema),
  references: z.array(CitationSchema),
  /** Hashes of the `ResourceIntelligenceBundle` records behind this package. Referenced, never inlined. */
  bundle_refs: z.array(ContentHashSchema),
  environment: EnvironmentSchema,
  /** The command that regenerates this package from itself. */
  reproduction_command: z.string().min(1),
  /**
   * The graph travels with the report. A package whose evidence lived in a
   * database the recipient cannot reach would be a report with footnotes nobody
   * can follow, which is the state this family was built to end.
   */
  nodes: z.array(EvidenceNodeSchema),
  edges: z.array(EvidenceEdgeSchema),
  claim_evidence_map: z.array(ClaimEvidenceEntrySchema),
  /** What this package does not establish. Required and non-empty: every study has some. */
  limitations: z.array(z.string().min(1)).min(1),
  /**
   * Checks that ran and did not pass, carried rather than dropped (RFC §7). An
   * export that quietly omits its failures reads exactly like one that had none.
   */
  failed_checks: z.array(z.string().min(1)),
  is_demo: z.boolean(),
  /** Excluded from the hash by name, like every other timestamp in this family. */
  created_at: IsoDateTimeSchema.optional(),
  /** SHA-256 over the canonical form of this package under `study-v1`. Excluded from itself. */
  reproducibility_hash: ContentHashSchema,
})

/** Constructor input: camelCase, and no hash -- the builder computes that. */
export interface ResearchPackageInput {
  studyRef: string
  planRef: RevisionRef
  reportMarkdown: string
  methods: string
  assumptionRows?: ResultRow[]
  resultRows?: ResultRow[]
  csv?: string
  figures?: Figure[]
  references?: Citation[]
  bundleRefs?: string[]
  environment: Environment
  reproductionCommand: string
  nodes: EvidenceNode[]
  edges: EvidenceEdge[]
  claimEvidenceMap: ClaimEvidenceEntry[]
  limitations: string[]
  /** Recorded, never omitted. Absent means no check failed, not that none was run. */
  failedChecks?: string[]
  isDemo: boolean
  /** Recorded but excluded from the hash. Omit for a byte-stable artifact. */
  createdAt?: string
}

/** The part of a package the structural checks read. Both the builder and the verifier hand it this. */
interface PackageBody {
  nodes: readonly EvidenceNode[]
  edges: readonly EvidenceEdge[]
  assumption_rows: readonly ResultRow[]
  result_rows: readonly ResultRow[]
  claim_evidence_map: readonly ClaimEvidenceEntry[]
}

function nodesByHash(nodes: readonly EvidenceNode[]): Map<string, EvidenceNode> {
  const index = new Map<string, EvidenceNode>()
  for (const node of nodes) {
    if (!index.has(node.content_hash)) index.set(node.content_hash, node)
  }
  return index
}

/**
 * Claim nodes asserting a value nobody knows.
 *
 * Checked against the raw input, before `EvidenceNodeSchema` sees it, and that
 * order is the whole reason this is a separate function. The node schema refuses
 * an unknown claim by throwing, which is right for a parser and wrong for an
 * export boundary: a caller assembling a package deserves a refusal it can read
 * beside the other refusals, not an exception it has to catch to find out that
 * one sentence in its report was never established.
 */
function unknownClaimRefusals(nodes: readonly EvidenceNode[]): StudyRefusal[] {
  const refusals: StudyRefusal[] = []
  for (const node of nodes) {
    if (node.kind !== "claim" || node.claim === null) continue
    if (isKnown(node.claim.value)) continue
    refusals.push({
      subject: node.label,
      code: "CLAIM_VALUE_UNKNOWN",
      message:
        `The claim '${node.claim.subject}.${node.claim.metric}' asserts a value that is UNKNOWN. An unknown is not ` +
        "a weaker claim, it is the absence of one, and it belongs in a quantity node or the study's open questions " +
        "rather than in a sentence this package would export as a finding.",
    })
  }
  return refusals
}

/**
 * Whether every number in the package can be walked back to a node in it.
 *
 * Four different ways the walk can fail, kept as four codes because they need
 * four different fixes: a row naming a node that was never included, a claim
 * nobody wired up at all, an entry whose evidence list is empty, and an entry
 * citing an edge the package does not carry. Collapsing them into one "export
 * failed" would leave the author guessing which of their tables is the problem.
 */
function claimMapRefusals(body: PackageBody): StudyRefusal[] {
  const refusals: StudyRefusal[] = []
  const index = nodesByHash(body.nodes)
  const edgeHashes = new Set(body.edges.map((edge) => edge.content_hash))

  const sections: readonly (readonly [string, readonly ResultRow[]])[] = [
    ["assumption_rows", body.assumption_rows],
    ["result_rows", body.result_rows],
  ]
  for (const [section, rows] of sections) {
    for (const row of rows) {
      if (index.has(row.node_hash)) continue
      refusals.push({
        subject: `${section}: ${row.label}`,
        code: "EVIDENCE_NODE_UNRESOLVED",
        message:
          `The row names node ${row.node_hash}, and the package does not carry it. A table cell whose node is ` +
          "missing renders as a number like any other, and a reader has no way to discover that it stands alone.",
      })
    }
  }

  const mapped = new Set(body.claim_evidence_map.map((entry) => entry.claim_node_hash))
  for (const node of body.nodes) {
    if (node.kind !== "claim") continue
    if (mapped.has(node.content_hash)) continue
    refusals.push({
      subject: node.label,
      code: "CLAIM_WITHOUT_EVIDENCE_NODE",
      message:
        "This claim node appears in the package with no entry in the claim evidence map, so nothing states what it " +
        "rests on. The export refuses rather than shipping the sentence with the reasons left behind.",
    })
  }

  for (const entry of body.claim_evidence_map) {
    const claim = index.get(entry.claim_node_hash)
    if (!claim) {
      refusals.push({
        subject: entry.claim_node_hash,
        code: "EVIDENCE_NODE_UNRESOLVED",
        message:
          "The claim evidence map names a claim node the package does not carry. The map would resolve to nothing " +
          "for a recipient who has only this file, which is every recipient.",
      })
    }

    if (entry.evidence_node_hashes.length === 0) {
      refusals.push({
        subject: claim?.label ?? entry.claim_node_hash,
        code: "CLAIM_WITHOUT_EVIDENCE_NODE",
        message:
          "The claim evidence map lists this claim with no evidence nodes at all. An empty list is a claim that was " +
          "walked back to nothing, recorded as though it had been checked.",
      })
    }

    for (const hash of entry.evidence_node_hashes) {
      if (index.has(hash)) continue
      refusals.push({
        subject: claim?.label ?? entry.claim_node_hash,
        code: "EVIDENCE_NODE_UNRESOLVED",
        message:
          `The claim is said to rest on node ${hash}, and the package does not carry it. Evidence that cannot be ` +
          "opened supports a claim exactly as much as no evidence does.",
      })
    }

    for (const hash of entry.edge_hashes) {
      if (edgeHashes.has(hash)) continue
      // The vocabulary has one code for an edge that does not join up, and this
      // is that failure seen from the map's side: the relation the entry cites
      // has no edge in the package, so its rationale and its asserter are gone.
      refusals.push({
        subject: claim?.label ?? entry.claim_node_hash,
        code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
        message:
          `The claim evidence map cites edge ${hash}, and no edge in this package has that hash. The relation it ` +
          "names cannot be read, so neither can who asserted it or why.",
      })
    }
  }

  return refusals
}

/**
 * Nodes and edges whose stated identity is not the identity of their contents.
 *
 * A node *is* its hash here, so this is not a redundant integrity check bolted
 * onto a graph that was already valid: a node claiming a hash its contents do
 * not produce is not the node any row or edge naming that hash refers to, and
 * the package would ship with a table cell pointing at something else entirely.
 * Refused at build rather than left for the verifier, so a package that would
 * fail verification is never written in the first place.
 */
function identityRefusals(nodes: readonly EvidenceNode[], edges: readonly EvidenceEdge[]): StudyRefusal[] {
  const refusals: StudyRefusal[] = []
  for (const node of nodes) {
    const expected = calculateStudyHash(node)
    if (expected === node.content_hash) continue
    refusals.push({
      subject: node.label,
      code: "EVIDENCE_NODE_UNRESOLVED",
      message:
        `The node states hash ${node.content_hash} and its own contents canonicalize to ${expected}. Identity in ` +
        "this graph is the content hash, so the node this package carries is not the node its rows name.",
    })
  }
  for (const edge of edges) {
    const expected = calculateStudyHash(edge)
    if (expected === edge.content_hash) continue
    refusals.push({
      subject: edge.content_hash,
      code: "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
      message:
        `The ${edge.kind} edge states hash ${edge.content_hash} and canonicalizes to ${expected}. An edge that is ` +
        "not what it says it is cannot be cited by a claim map that names it.",
    })
  }
  return refusals
}

/**
 * Assemble a package, or say why there is nothing to assemble.
 *
 * The order is `buildBundle`'s and the order is the contract. Inputs are parsed
 * first so that anything the schemas normalise -- an omitted citation author
 * list, an environment's empty package map -- is normalised *before* it is
 * hashed; hashing first and parsing afterwards would stamp a digest onto a
 * record the final parse then quietly changes, and the package would fail its
 * own verifier the moment it was written.
 *
 * Everything structural is then checked before the hash exists, because a
 * refusal is meant to be the ordinary outcome here rather than the error case. A
 * study with a number nobody wired up is not a broken program; it is a study
 * that is not finished, and the refusals say which part.
 */
export function buildResearchPackage(
  input: ResearchPackageInput,
): { ok: true; package: ResearchPackage } | { ok: false; refusals: StudyRefusal[] } {
  const unknownClaims = unknownClaimRefusals(input.nodes)
  if (unknownClaims.length > 0) return { ok: false, refusals: unknownClaims }

  const nodes = input.nodes.map((node) => EvidenceNodeSchema.parse(node))
  const edges = input.edges.map((edge) => EvidenceEdgeSchema.parse(edge))
  const environment = EnvironmentSchema.parse(input.environment)
  const references = (input.references ?? []).map((citation) => CitationSchema.parse(citation))

  const assumptionRows = input.assumptionRows ?? []
  const resultRows = input.resultRows ?? []

  const body: PackageBody = {
    nodes,
    edges,
    assumption_rows: assumptionRows,
    result_rows: resultRows,
    claim_evidence_map: input.claimEvidenceMap,
  }

  // The shared graph verifier reports an edge whose endpoint is missing; the
  // identity check names the node that lied about its own hash. Neither answers
  // for the other, and a package that would fail verification must not be
  // writable in the first place.
  const graph = verifyEvidenceGraph(nodes, edges)
  const refusals = [...identityRefusals(nodes, edges), ...graph.refusals, ...claimMapRefusals(body)]
  if (refusals.length > 0) return { ok: false, refusals }

  const withoutHash = {
    schema_version: STUDY_SCHEMA_VERSION,
    hash_rules_id: STUDY_HASH_RULES_ID,
    package_kind: "KETQAT_RESEARCH_PACKAGE" as const,
    study_ref: input.studyRef,
    plan_ref: input.planRef,
    report_markdown: input.reportMarkdown,
    methods: input.methods,
    assumption_rows: assumptionRows,
    result_rows: resultRows,
    csv: input.csv ?? "",
    figures: input.figures ?? [],
    references,
    bundle_refs: input.bundleRefs ?? [],
    environment,
    reproduction_command: input.reproductionCommand,
    nodes,
    edges,
    claim_evidence_map: input.claimEvidenceMap,
    limitations: input.limitations,
    failed_checks: input.failedChecks ?? [],
    is_demo: input.isDemo,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  const hash = calculateStudyHash(withoutHash, STUDY_HASH_RULES_ID)

  return {
    ok: true,
    package: ResearchPackageSchema.parse({ ...withoutHash, reproducibility_hash: hash }),
  }
}

export const StudyVerificationSchema = z.object({
  valid: z.boolean(),
  /** The file is unedited: its contents canonicalize to the hash it carries. */
  hash_matches: z.boolean(),
  /** Every row and every claim-map entry resolves to something the package carries. */
  claims_resolve: z.boolean(),
  /** Node and edge identities are their own contents, and every edge joins two nodes that are here. */
  graph_valid: z.boolean(),
  expected_hash: z.string(),
  actual_hash: z.string(),
  /** Every discrepancy found, named. Empty when `valid`. */
  problems: z.array(z.string().min(1)),
})
export type StudyVerification = z.infer<typeof StudyVerificationSchema>

/**
 * Check a package the way a recipient has to: from the file alone.
 *
 * Three questions, answered separately because they fail separately.
 *
 * `hash_matches` says the file was not edited after it was written. On its own
 * that is worth little -- anyone who edits a package can recompute its hash --
 * which is precisely why the other two exist.
 *
 * `graph_valid` and `claims_resolve` say the package still joins up. This is
 * where the edit-then-re-hash fabrication is caught: changing a node's value and
 * re-stamping it changes the node's identity, and every table row, edge endpoint
 * and claim-map entry that named the old hash now names something the package
 * does not contain. Making the numbers lie therefore means rewriting the whole
 * graph consistently, and a graph rewritten consistently is a different study
 * that says different things -- visibly, to a reader.
 *
 * What this does not do is recompute the science. Nothing here re-derives an
 * estimate from a scenario or re-runs a decision rule; `verifyBundle` does that
 * for the intelligence tier, and a package that carries `bundle_refs` is
 * pointing at bundles that can be verified that way. A valid result here means
 * the package is internally consistent and unedited, and no more than that.
 */
export function verifyResearchPackage(candidate: unknown): StudyVerification {
  const parsed = ResearchPackageSchema.safeParse(candidate)
  if (!parsed.success) {
    return StudyVerificationSchema.parse({
      valid: false,
      hash_matches: false,
      claims_resolve: false,
      graph_valid: false,
      expected_hash: "",
      actual_hash: "",
      problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    })
  }

  const pkg = parsed.data
  const problems: string[] = []

  // The literal on `hash_rules_id` has already refused a missing or unknown id,
  // so this reads the rules the record names rather than assuming the current
  // ones: a future `study-v2` package must be hashed the way it says it was.
  const rulesId = studyRulesIdOf(pkg)
  const expected = calculateStudyHash(pkg, rulesId)
  const hashMatches = expected === pkg.reproducibility_hash
  if (!hashMatches) {
    problems.push(
      `Reproducibility hash mismatch: the package claims ${pkg.reproducibility_hash} and its own contents ` +
        `canonicalize to ${expected} under ${rulesId}.`,
    )
  }

  const graph = verifyEvidenceGraph(pkg.nodes, pkg.edges)
  problems.push(...graph.problems)

  const refusals = claimMapRefusals(pkg)
  const claimsResolve = refusals.length === 0
  problems.push(...refusals.map((refusal) => `${refusal.code} (${refusal.subject}): ${refusal.message}`))

  return StudyVerificationSchema.parse({
    valid: problems.length === 0,
    hash_matches: hashMatches,
    claims_resolve: claimsResolve,
    graph_valid: graph.valid,
    expected_hash: expected,
    actual_hash: pkg.reproducibility_hash,
    problems,
  })
}
