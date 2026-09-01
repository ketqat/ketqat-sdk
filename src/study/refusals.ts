import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { StudyHashRefusalError } from "./limits.js"
import { STUDY_HASH_RULES_KEY, STUDY_KNOWN_HASH_RULES_IDS } from "./rules.js"

/**
 * One refusal vocabulary for the whole family (ketqat-sdk#259).
 *
 * A study is built out of things that are not known yet, so refusing is the
 * normal case rather than the error case: no baseline, no confirmation, a claim
 * with nothing behind it. The intelligence tier already established the shape --
 * `computeAdvantageThresholds` records `{ threshold, code, message }` and returns
 * an UNKNOWN quantity rather than a plausible number -- and this is the same
 * shape one level up.
 *
 * Codes are the contract; messages are for people. Tests assert on `code`,
 * because a refusal a caller can only detect by matching prose is a refusal that
 * breaks the day someone improves the wording. The enum is closed for the same
 * reason: a free-string code cannot be exhaustively handled, and "handled every
 * case" is the property that makes refusing safe.
 */

export const StudyRefusalCodeSchema = z.enum([
  /** The record does not name its hash rules. Nothing is inferred from silence. */
  "STUDY_HASH_RULES_ID_MISSING",
  /** The record names rules this build does not have. Never treated as current. */
  "STUDY_HASH_RULES_ID_UNKNOWN",
  /**
   * The hashing core refused this record, so no digest exists to report.
   *
   * One code for the whole class, because the class is one thing: the record
   * cannot be projected and canonicalized, so there is nothing to compare a
   * stored hash against. The hashing core's own code -- `UNDECLARED_FIELD`,
   * `SHAPE_MISMATCH`, `NON_FINITE_NUMBER`, `LONE_SURROGATE`,
   * `MAX_DEPTH_EXCEEDED` and the rest of the closed list in `limits.ts` -- is
   * carried in the message, where it names the field and the path a reader has
   * to go and look at.
   *
   * It replaces two codes that named the retired rules rather than the failure:
   * `STUDY_EXCLUDED_KEY_NESTED` described a key the digest would have dropped,
   * and there is no such key any more -- the projection reads declared fields
   * and refuses the rest -- while `STUDY_VALUE_NOT_REPRESENTABLE` described a
   * blanket bound on integers that the typed number contracts replace.
   */
  "STUDY_RECORD_NOT_HASHABLE",
  /** The status an event records is not the one that event type produces from where the study was. */
  "INVALID_STATUS_TRANSITION",
  /**
   * This kind of event cannot be recorded from the status the study is in.
   *
   * Separate from `INVALID_STATUS_TRANSITION` because the two need different
   * fixes and used to be one answer. A pair of statuses was never the rule:
   * `task_started` and `study_superseded` both leave `RUNNING` and are not
   * interchangeable, so "a study at RUNNING may reach SUPERSEDED" was true and
   * useless when the question was whether *this* event belonged here.
   */
  "EVENT_TYPE_NOT_PERMITTED",
  /** An event does not follow the hash of the event before it. History was rewritten. */
  "EVENT_CHAIN_BROKEN",
  /**
   * The trail in hand does not end at the head the caller holds.
   *
   * Raised on append rather than on verification, and it is the stale-read case:
   * appending to a trail somebody else has already extended is how two events
   * come to name one predecessor, and each of the two chains that produces
   * verifies perfectly on its own.
   */
  "EVENT_HEAD_MISMATCH",
  /**
   * The record being revised does not hash to the hash written on it.
   *
   * The revision is refused before it exists, because a revision built on an
   * edited record would carry that edit forward under a `supersedes` pointer
   * that says it came from something else.
   */
  "REVISION_BASE_EDITED",
  /** The caller's asserted hash is not this record's hash. One of the two is a stale read. */
  "REVISION_BASE_MISMATCH",
  /**
   * The store's newest revision is not the one being revised.
   *
   * The concurrent case, named: two callers reading revision 2 at the same
   * moment each produce a well-formed revision 3, and neither can see the
   * other. This is what the SDK can detect when the caller supplies the latest
   * revision it read; the compare-and-set that closes the remaining window is
   * the store's, and `persistence.ts` says so.
   */
  "REVISION_BRANCH_DETECTED",
  /**
   * The confirmed hash is not what the plan's own contents canonicalize to.
   *
   * Raised for the pointer and for the content separately: a receipt records
   * both the plan's record digest and its semantic digest, and a receipt whose
   * pointer matches while its semantic hash does not is the case a
   * revision-hash comparison alone would report as intact.
   */
  "CONFIRMATION_HASH_MISMATCH",
  /** The confirmation names a revision a later one has replaced. */
  "PLAN_REVISION_SUPERSEDED",
  /**
   * The receipt does not hash to the hash written on it.
   *
   * Separate from a plan that was edited, because the two point at different
   * culprits: one says the thing that was approved changed, the other says the
   * record of the approval changed. A receipt is only ever the server's record
   * of what it observed, and an edited one has stopped being that.
   */
  "CONFIRMATION_RECEIPT_EDITED",
  /**
   * The approval has lapsed.
   *
   * An expiry is not a formality. Prices, queue depths and what the actor
   * believed when they read the summary all move, so an approval given in March
   * is not evidence about a run starting in December.
   */
  "CONFIRMATION_RECEIPT_EXPIRED",
  /** The receipt and the plan belong to different studies. Two approvals, not one. */
  "CONFIRMATION_RECEIPT_STUDY_MISMATCH",
  /**
   * The confirmation did not carry the permission this operation needs.
   *
   * Replaces `PLAN_NOT_CONFIRMED`, which said only that nobody had approved
   * anything. There is no longer a path that reaches an authorization without a
   * receipt -- `authoriseStudyTask` takes one by type rather than accepting a
   * nullable hash -- so what remains to refuse is an approval that exists and
   * does not cover what is being asked for.
   */
  "CONFIRMATION_SCOPE_INSUFFICIENT",
  /**
   * Two records in one chain name different things where they must name the
   * same one.
   *
   * The failure this family exists to make visible: every record intact, every
   * hash recomputing, and the graph between them wrong. A capsule answering
   * some other authorization, an outcome closing some other run, a hardware
   * submission made under some other approval.
   */
  "TASK_REFERENCE_UNRESOLVED",
  /**
   * A run executed on a kind of machine the approval did not authorise.
   *
   * Which machine ran is not a detail a runner may settle afterwards. A
   * confirmation for a managed simulation is not a confirmation to spend money
   * on hardware, and the two are distinguishable only because the class is
   * carried on both records and compared.
   */
  "EXECUTION_CLASS_MISMATCH",
  /** The plan rests on a value that is UNKNOWN, so its conclusion cannot be drawn. */
  "PLAN_DEPENDS_ON_UNKNOWN",
  /** A claim is asserted with no evidence node behind it. The export refuses; it does not warn. */
  "CLAIM_WITHOUT_EVIDENCE_NODE",
  /**
   * The claim map cites evidence that no edge in the package joins to the claim.
   * Resolving a hash proves the record is carried; only an edge asserts that it
   * backs anything, and the edge is where the rationale and the asserter live.
   */
  "CLAIM_EVIDENCE_UNLINKED",
  /** A node is cited as its own evidence. Restating a claim establishes nothing. */
  "CLAIM_EVIDENCE_SELF_REFERENTIAL",
  /** A result row names a node that carries no value, so the row has no number to read. */
  "RESULT_ROW_WITHOUT_VALUE",
  /** A claim asserts an unknown value. An unknown belongs in a quantity node, not in an assertion. */
  "CLAIM_VALUE_UNKNOWN",
  /** A hash in a row or a claim map names a node the package does not carry. */
  "EVIDENCE_NODE_UNRESOLVED",
  /** An edge points at a node that is not in the graph. */
  "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
  /**
   * The claim's supporting chain does not terminate in anything that was
   * measured, run, cited, supplied or explicitly assumed.
   *
   * Distinct from `CLAIM_WITHOUT_EVIDENCE_NODE`, which is the claim with no
   * `supports` edge at all. This one is the claim that *has* support and whose
   * support rests on nothing: a chain of claims agreeing with each other, or a
   * quantity nobody says where they got. One direct edge is not grounding, and
   * a graph that treated it as grounding would certify exactly the sentence
   * this family exists to stop.
   */
  "CLAIM_NOT_GROUNDED",
  /**
   * One branch of a claim's supporting tree terminates in nothing, while
   * another grounds.
   *
   * Reported separately because the claim as a whole passes closure and a
   * reader would never find this by looking at the verdict. A branch that dead
   * ends is a reason the study wrote down and then did not follow, and it sits
   * in the same graph as the reasons it did.
   */
  "CLAIM_SUPPORT_BRANCH_UNGROUNDED",
  /**
   * The map counts evidence that argues with the claim as evidence for it.
   *
   * Support and contradiction are separate fields for this reason: a single
   * list of "evidence" lets a `contradicts` edge be totalled with the
   * `supports` ones, and the reader is shown a count in which an objection
   * raised the number.
   */
  "CLAIM_EVIDENCE_CONTRADICTS",
  /** Two entries in one claim map name the same claim, so the map has two answers for it. */
  "CLAIM_MAP_DUPLICATE_ENTRY",
  /**
   * The graph asserts a relation the edge matrix does not define.
   *
   * A triple of (from kind, edge kind, to kind) either means something in this
   * family or it does not, and which is which is declared data rather than a
   * reviewer's recollection. A `model_ref` that supersedes a `citation`, or a
   * `source` that derived from a `claim`, parses as an edge and reads in a
   * rendered graph exactly like an edge that means something.
   */
  "EVIDENCE_EDGE_NOT_PERMITTED",
  /**
   * One relation asserted twice.
   *
   * Either the same edge record twice, or two edge records carrying the same
   * `(from, kind, to)` triple with two rationales. Both are two answers to one
   * question, and any count of what supports a claim totals them both.
   */
  "EVIDENCE_EDGE_DUPLICATE",
  /** Two nodes in one graph carry one hash. A node is identified by its content. */
  "EVIDENCE_NODE_DUPLICATE",
  /**
   * A `derived_from` or `supersedes` chain returns to where it started.
   *
   * Both relations are meant to be one-way in time: a value cannot be computed
   * from itself and a record cannot replace its own replacement. A cycle makes
   * every traversal in this module either loop or stop at a point the graph did
   * not choose, and it makes provenance unanswerable rather than long.
   */
  "EVIDENCE_GRAPH_CYCLE",
  /** Two nodes supersede one node, so the history a reader follows forward forks. */
  "EVIDENCE_SUPERSESSION_BRANCH",
  /** A node or edge in this graph belongs to a different study. One graph, one study. */
  "EVIDENCE_GRAPH_STUDY_MISMATCH",
  /**
   * Two references to one record disagree about what it is or what it is called.
   *
   * A reference may name a record by content hash, by registry slug, or by
   * both. Two of them naming one hash under two slugs -- or one slug under two
   * hashes -- is the graph holding two readings of one pointer, and a reader
   * resolving either gets an answer the other contradicts.
   */
  "EVIDENCE_REFERENCE_DISAGREES",
  /** A reference names a record kind outside the vocabulary this build knows. */
  "EVIDENCE_RECORD_KIND_UNKNOWN",
  /**
   * A hash is used as though it named a record of a kind it is not.
   *
   * The claim that names a `model_ref` as the node its number is read from, and
   * the reference that files an evidence node under a benchmark result's kind,
   * are the same defect: a pointer whose target does not answer the question
   * the pointer was asked.
   */
  "EVIDENCE_NODE_KIND_MISMATCH",
  /** A node marked private reached a graph verified for a public audience. */
  "EVIDENCE_NODE_NOT_PUBLIC",
  /** The run would cost more than the maximum the user set. Their number, not an estimate. */
  "CREDITS_MAXIMUM_EXCEEDED",
  /** The baseline's provenance was never established, so no economic claim rests on it. */
  "BASELINE_SOURCE_UNKNOWN",

  // The report document (goal §14.2). A verified section is generated from
  // structure; these are the ways a producer can try to type one instead.

  /**
   * A decision-bearing number appears in the prose of a verified section.
   *
   * The failure the structured document exists to prevent, and the reason
   * `report_markdown` is gone. Prose that says "4.2 million physical qubits" is
   * a number a reader quotes, and hashing the sentence establishes only that
   * the sentence was not edited afterwards -- not that anything ever measured
   * the figure in it. A number in a verified section is rendered from a node;
   * a sentence that carries its own is refused, and the same sentence is
   * accepted verbatim as commentary, where it is labelled unverified.
   */
  "VERIFIED_PROSE_NOT_GROUNDED",
  /** A report segment names a node, table, figure, citation or limitation the package does not carry. */
  "REPORT_REFERENCE_UNRESOLVED",
  /** A segment names a target of the wrong kind: a quantity reference at a claim, a table reference at a figure. */
  "REPORT_REFERENCE_KIND_MISMATCH",
  /** Two sections, tables, figures or checks share one id, so a reference to it has two answers. */
  "REPORT_DUPLICATE_ID",

  // Tables and figures (goal §14.3).

  /** A cell in a value column names no node, so the number in it came from nowhere. */
  "TABLE_CELL_WITHOUT_NODE",
  /** A cell names a column the table does not declare, or a row omits one it does. */
  "TABLE_SHAPE_MISMATCH",
  /**
   * The CSV artifact hash is not the hash of the CSV these rows generate.
   *
   * The table and the file are one statement rendered twice, so this is them
   * disagreeing: either the rows were edited after the file was written, or the
   * file was.
   */
  "TABLE_CSV_ARTIFACT_MISMATCH",
  /**
   * A figure was supplied as SVG rather than as a specification.
   *
   * Raw markup in a trusted surface is a rendering nobody can check against the
   * numbers, and the numbers are the point of the figure. A spec whose points
   * name nodes renders to a picture a reader can walk back to evidence.
   */
  "FIGURE_RAW_SVG_REFUSED",
  /** A figure's series or point names a node or table cell the package does not carry. */
  "FIGURE_POINT_UNRESOLVED",
  /** An SVG carries a script element. Script in a trusted surface executes with the reader's authority. */
  "SVG_SCRIPT_REFUSED",
  /** An SVG carries a `foreignObject`, which embeds arbitrary markup the SVG rules do not govern. */
  "SVG_FOREIGN_OBJECT_REFUSED",
  /** An SVG fetches something over the network, so what a reader sees depends on who answers. */
  "SVG_EXTERNAL_REFERENCE_REFUSED",
  /** An SVG carries an event handler attribute. */
  "SVG_EVENT_HANDLER_REFUSED",
  /**
   * An SVG uses an element outside the subset this family stores.
   *
   * The backstop that makes the four checks above a courtesy rather than the
   * whole defence: a denylist of dangerous elements has to be right about every
   * element name that will ever exist, and an allowlist of drawing primitives
   * has to be right only about the ones a chart needs.
   */
  "SVG_ELEMENT_NOT_PERMITTED",

  // The reproduction recipe (goal §14.4).

  /** The recipe names a runner this build does not approve for automatic execution. */
  "RECIPE_RUNNER_NOT_APPROVED",
  /**
   * An argv element carries something a shell would interpret.
   *
   * The recipe is executed as an argument vector and rendered as a display
   * string, and the display string is generated rather than parsed. An element
   * carrying a quote, a newline or a control character is refused where it is
   * written, because the alternative is a renderer deciding how to escape it
   * and a reader copying the result into a shell.
   */
  "RECIPE_ARGUMENT_UNSAFE",
  /** An environment variable name is not a name, or is not on the recipe's own allowlist. */
  "RECIPE_ENVIRONMENT_NOT_ALLOWLISTED",
  /** The recipe names an input or expected output artifact the package does not carry. */
  "RECIPE_ARTIFACT_UNRESOLVED",
  /** The recipe allows a host while declaring that the run takes no network. */
  "RECIPE_NETWORK_POLICY_INCONSISTENT",

  // The check ledger (goal §14.5).

  /** A ledger entry does not say enough to be read: a status with no reason, a failure with no tool. */
  "CHECK_LEDGER_ENTRY_INCOMPLETE",
  /** Two ledger entries share one check id, so the ledger has two answers for one check. */
  "CHECK_LEDGER_DUPLICATE_ID",
  /** A required check is absent from the ledger, which is not the same as having failed. */
  "CHECK_LEDGER_REQUIRED_CHECK_ABSENT",

  // Bundle resolution and ceilings (goal §14.6).

  /** A referenced resource intelligence bundle is not carried and was not supplied. */
  "BUNDLE_UNRESOLVED",
  /** A resolved bundle is not the kind the reference said it was. */
  "BUNDLE_KIND_MISMATCH",
  /** A resolved bundle's contents do not produce the hash the reference names. */
  "BUNDLE_HASH_MISMATCH",
  /**
   * A bundle's stored estimates or decisions are not what its own inputs
   * produce.
   *
   * The recomputation failure, kept apart from the hash one: a bundle whose
   * decision section was written by hand and re-hashed passes every integrity
   * check there is.
   */
  "BUNDLE_SCIENCE_NOT_RECOMPUTED",
  /** A claim names a bundle field that does not exist in the bundle it names. */
  "BUNDLE_FIELD_UNRESOLVED",
  /** A claim rests on bundle-derived evidence and does not say which field of which bundle. */
  "CLAIM_BUNDLE_FIELD_MISSING",
  /** A package calling itself an offline export references a bundle it does not carry. */
  "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED",
  /** The package is past one of the declared ceilings. The ceiling and the count are in the message. */
  "PACKAGE_LIMIT_EXCEEDED",
])
export type StudyRefusalCode = z.infer<typeof StudyRefusalCodeSchema>

export interface StudyRefusal {
  subject: string
  code: StudyRefusalCode
  message: string
}

export const StudyRefusalSchema: Contract<StudyRefusal> = z.object({
  /** Which record, field or claim was refused. A refusal that does not say what it is about is a mood. */
  subject: z.string().min(1),
  code: StudyRefusalCodeSchema,
  /** What would have to be true instead, in words a reader can act on. */
  message: z.string().min(1),
}).strict()

/**
 * The rules a record names, or the refusal that it names none this build has.
 *
 * Asked before the digest rather than left to it, and the reason is the order
 * of the two answers. "We do not know how to hash this" and "this is not a
 * capsule" are different findings, and reporting the second when the first is
 * true sends a reader looking for a schema bug in a record that simply names a
 * rule set nobody here implements.
 *
 * Nothing is inferred from silence (ADR 0010): a study record without a rules
 * id is malformed rather than old, and the two cases are separate codes because
 * they need separate fixes -- one asks a producer to mark the record, the other
 * says this build cannot verify it at all and no amount of editing here will
 * change that.
 */
export function studyRulesIdRefusal(subject: string, record: object): StudyRefusal | null {
  const recorded = Object.prototype.hasOwnProperty.call(record, STUDY_HASH_RULES_KEY)
    ? (record as Record<string, unknown>)[STUDY_HASH_RULES_KEY]
    : undefined
  if (typeof recorded !== "string" || recorded.length === 0) {
    return {
      subject,
      code: "STUDY_HASH_RULES_ID_MISSING",
      message:
        `A study-family record must name its hash rules in ${STUDY_HASH_RULES_KEY}; nothing is inferred from ` +
        "silence. A record without one is refused, not defaulted (ADR 0010).",
    }
  }
  if (!STUDY_KNOWN_HASH_RULES_IDS.includes(recorded)) {
    return {
      subject,
      code: "STUDY_HASH_RULES_ID_UNKNOWN",
      message:
        `This build does not know the hash rules id ${JSON.stringify(recorded)}. Known ids: ` +
        `${STUDY_KNOWN_HASH_RULES_IDS.join(", ")}. A future study-v2 is a new rule set, never a ` +
        "reinterpretation of this one, so a record naming it is not verifiable here.",
    }
  }
  return null
}

/**
 * A hashing-core refusal, in this family's vocabulary.
 *
 * One code for the whole class, because the class is one thing: the record
 * cannot be projected and canonicalized, so there is no digest to compare a
 * stored hash against. Which of the closed list in `limits.ts` fired --
 * `UNDECLARED_FIELD`, `SHAPE_MISMATCH`, `NON_FINITE_NUMBER`, `LONE_SURROGATE`,
 * `MAX_DEPTH_EXCEEDED` -- is carried in the message together with the path,
 * because that is what tells a reader which field to go and look at, and a
 * caller branching on a refusal needs to handle the class rather than enumerate
 * twenty ways of being unhashable.
 *
 * Anything that is not a hashing refusal is rethrown. An `Error` this layer did
 * not raise is a bug here rather than a finding about the record, and
 * translating it into a refusal would report the record as the problem.
 */
export function studyNotHashableRefusal(subject: string, error: unknown): StudyRefusal {
  if (!(error instanceof StudyHashRefusalError)) throw error
  return {
    subject,
    code: "STUDY_RECORD_NOT_HASHABLE",
    message: `${error.code}: ${error.message}`,
  }
}
