import { z } from "zod"
import { refuse } from "./limits.js"
import {
  arrayOf,
  declareShape,
  field,
  objectOf,
  type StudyFieldClass,
  type StudyHashPurpose,
  type StudyShape,
} from "./projection.js"

/**
 * What every field of every study record kind is, as declared data.
 *
 * This file is the completeness rule made checkable. The projection in
 * `projection.ts` reads declared fields and nothing else, which closes the
 * name-matching hole by construction and opens exactly one of its own: a
 * *new* semantic field that nobody classifies stays out of the digest, so two
 * records differing only there share one. An allowlist without a completeness
 * check is not safer than a denylist, it is differently unsafe.
 *
 * So the classification lives here as data rather than as code, and
 * `tests/study-field-completeness.test.mjs` walks each Zod schema against it
 * and fails in **both** directions: a schema field this file does not classify,
 * and a field this file classifies that the schema does not declare. Adding a
 * field then stops being a silent default and becomes a decision a reviewer can
 * see in a diff.
 *
 * The four classes, from the decision brief:
 *
 * - `SEMANTIC` -- model inputs, assumptions, scenario, and the deterministic
 *   conditions under which the record reproduces. What "the same science"
 *   means.
 * - `RECORD_ONLY` -- presentation and placement: labels, denormalized state,
 *   lifecycle pointers, prose written for a reader. In the record digest, which
 *   answers "was this file edited", and out of the semantic one, which answers
 *   "is this the same content".
 * - `RECEIPT_ONLY` -- audit evidence: actor, sequence, previous receipt,
 *   action, and the server-side timestamps that order it.
 * - `DERIVED` -- values that cannot be inputs to a digest that covers them: a
 *   record's own hash field, and the two header components (`schema_version`,
 *   `hash_rules_id`) that `buildStudyPreimage` already commits to outside the
 *   body. Hashing a marker inside its own digest is checking an answer by
 *   assuming it.
 *
 * Two conventions run through the tables and are worth stating once rather than
 * at every row.
 *
 * **`created_at` is `RECEIPT_ONLY`, not `RECORD_ONLY`.** A creation timestamp is
 * the server saying when it observed the record. Under the retired rules it was
 * dropped everywhere by name, which is what made a nested `created_at` a hole;
 * here it is classified, once, per field, and it lands in the receipt preimage
 * where "this server observed this, in this order" is the question being asked.
 *
 * **A `Quantity`'s envelope annotations are `RECORD_ONLY`.** `created_at`,
 * `schema_version` and `source` on an embedded `Quantity` move whenever an
 * envelope is rebuilt from the same measurement, so a semantic digest that read
 * them would report new science every time a record was re-serialized. The
 * number, its unit, its bound, its evidence class, its model and its stated
 * assumptions are the measurement and are `SEMANTIC`.
 */

/**
 * The `Quantity` envelope from `src/intelligence/measurement.ts`, classified
 * for this family.
 *
 * Declared here rather than beside the shared schema because `src/intelligence`
 * must not move: its digests are published, and a study-local variant is how
 * this family reads a shared shape without changing what the shared shape means
 * anywhere else.
 */
const UncertaintyShape: StudyShape = declareShape("study.uncertainty", [
  field("kind", "SEMANTIC"),
  field("low", "SEMANTIC"),
  field("high", "SEMANTIC"),
  field("basis", "SEMANTIC"),
])

const QuantityShape: StudyShape = declareShape("study.quantity", [
  field("value", "SEMANTIC"),
  field("unit", "SEMANTIC"),
  field("bound", "SEMANTIC"),
  field("evidence", "SEMANTIC"),
  // Where the number came from: a model name and version are reproduction
  // conditions, and two numbers from two models are not the same measurement
  // even when the digits agree.
  field("model", "SEMANTIC"),
  field("model_version", "SEMANTIC"),
  field("assumptions", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("uncertainty", "SEMANTIC", objectOf(UncertaintyShape)),
  field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  // Annotation on the envelope rather than on the measurement: a free-text
  // provenance note, the envelope's own schema version, and the moment this
  // envelope was built. Rebuilding an envelope around the same number must not
  // read as new science.
  field("source", "RECORD_ONLY"),
  field("schema_version", "RECORD_ONLY"),
  field("created_at", "RECORD_ONLY"),
])

const QuantityFieldShape: StudyShape = declareShape("study.quantity_field", [
  field("quantity", "SEMANTIC", objectOf(QuantityShape)),
  // Who is answerable for the value. An inferred figure and the same figure
  // confirmed by a person are different claims, so `origin` is semantic --
  // which is the whole reason the envelope exists.
  field("origin", "SEMANTIC"),
])

const TextFieldShape: StudyShape = declareShape("study.text_field", [
  field("value", "SEMANTIC"),
  field("evidence", "SEMANTIC"),
  field("origin", "SEMANTIC"),
])

/**
 * A pointer at one revision of an immutable record.
 *
 * Both halves are `SEMANTIC`. A plan bound to specification revision 4 and the
 * same plan bound to revision 7 are different plans, and this is the field that
 * says which -- it is the binding, not an annotation about it.
 */
const RevisionRefShape: StudyShape = declareShape("study.revision_ref", [
  field("revision_hash", "SEMANTIC"),
  field("revision", "SEMANTIC"),
])

const CitationShape: StudyShape = declareShape("study.citation", [
  field("title", "SEMANTIC"),
  field("authors", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("year", "SEMANTIC"),
  field("doi", "SEMANTIC"),
  field("url", "SEMANTIC"),
  field("bibtex", "SEMANTIC"),
])

/**
 * A pointer at a registry record outside this family.
 *
 * `record_slug` is `RECORD_ONLY` and `hash` is `SEMANTIC`, which is the pair
 * that a name-based rule got wrong: under the retired rules `slug` was dropped
 * at every depth, so two evidence nodes citing two different registry records
 * were content-addressed identically whenever the hash was absent. Here the
 * slug is a human-readable label that may drift, and the hash is the binding
 * that must not.
 */
const EvidenceReferenceShape: StudyShape = declareShape("study.evidence_reference", [
  field("record_kind", "SEMANTIC"),
  field("hash", "SEMANTIC"),
  field("record_slug", "RECORD_ONLY"),
])

/**
 * Where a claim reads its number from.
 *
 * All three fields are `SEMANTIC`, and `node_hash` is the one that matters: it
 * is the claim's value. A claim that pointed at one measurement and a claim
 * that pointed at another would otherwise be one record to a digest, which is
 * the same failure a claim carrying its own copy of the number had, arriving
 * from the other direction.
 */
const ClaimValueRefShape: StudyShape = declareShape("study.claim_value_ref", [
  field("kind", "SEMANTIC"),
  field("node_hash", "SEMANTIC"),
  field("field_path", "SEMANTIC"),
])

/**
 * What a claim asserts, with the number held by reference.
 *
 * The subject is a reference rather than a name for the reason `study_id` is an
 * opaque id rather than a title: a display string is what a reader recognises
 * and not what a machine can join on, and a claim whose subject is a string
 * cannot be checked against the workload it is about.
 */
const ClaimStatementShape: StudyShape = declareShape("study.claim_statement", [
  field("subject_ref", "SEMANTIC", objectOf(EvidenceReferenceShape)),
  field("metric", "SEMANTIC"),
  field("comparator", "SEMANTIC"),
  field("value_ref", "SEMANTIC", objectOf(ClaimValueRefShape)),
])

const NameVersionShape = (name: string): StudyShape =>
  declareShape(name, [field("name", "SEMANTIC"), field("version", "SEMANTIC")])

/**
 * One immutable version pin, every component of it `SEMANTIC`.
 *
 * A name and a version are what a person reads; the six identifiers beside them
 * are what a reproduction resolves. All eight are semantic because each of them
 * changes which program produced the numbers -- a plan pinned to one container
 * digest and the same plan pinned to another describe two computations, and a
 * digest that read only the version string would call them one.
 */
const VersionPinShape = (name: string): StudyShape =>
  declareShape(name, [
    field("package_name", "SEMANTIC"),
    field("package_version", "SEMANTIC"),
    field("artifact_digest", "SEMANTIC"),
    field("source_commit", "SEMANTIC"),
    field("container_digest", "SEMANTIC"),
    field("model_snapshot_hash", "SEMANTIC"),
    field("schema_hash", "SEMANTIC"),
    field("adapter_configuration_hash", "SEMANTIC"),
  ])

const PinnedVersionsShape: StudyShape = declareShape("study.pinned_versions", [
  field("adapter", "SEMANTIC", objectOf(VersionPinShape("study.pinned_versions.adapter"))),
  field("model", "SEMANTIC", objectOf(VersionPinShape("study.pinned_versions.model"))),
  field("engine", "SEMANTIC", objectOf(VersionPinShape("study.pinned_versions.engine"))),
])

const CapsuleVersionsShape: StudyShape = declareShape("study.capsule_versions", [
  field("schema", "SEMANTIC"),
  field("adapter", "SEMANTIC", objectOf(NameVersionShape("study.capsule_versions.adapter"))),
  field("engine", "SEMANTIC", objectOf(NameVersionShape("study.capsule_versions.engine"))),
])

/**
 * The captured environment, as declared fields.
 *
 * `packages` and `hardware` are lists of `{name, value}` pairs rather than free
 * maps, and that shape is load-bearing under a projection exactly as it was
 * under the retired rules: a map's keys arrive at run time, so a dependency
 * genuinely named `id` used to be dropped by the name rule, and under a
 * projection a map's keys are simply undeclared and would have to be read
 * wholesale or not at all. A declared pair list is neither.
 */
const StudyPackageShape: StudyShape = declareShape("study.package", [
  field("name", "SEMANTIC"),
  field("version", "SEMANTIC"),
])

const StudyHardwareEntryShape: StudyShape = declareShape("study.hardware_entry", [
  field("name", "SEMANTIC"),
  field("value", "SEMANTIC"),
])

const StudyEnvironmentShape: StudyShape = declareShape("study.environment", [
  field("operating_system", "SEMANTIC"),
  field("architecture", "SEMANTIC"),
  field("python_version", "SEMANTIC"),
  field("node_version", "SEMANTIC"),
  field("packages", "SEMANTIC", arrayOf(objectOf(StudyPackageShape))),
  field("hardware", "SEMANTIC", arrayOf(objectOf(StudyHardwareEntryShape))),
])

/**
 * A typed reference to one file a run consumed or produced.
 *
 * Every field is `SEMANTIC`, including the three a reader might take for
 * annotation. A run that produced 40 MB of measurements and a run that produced
 * the first 4 MB before a wall-clock limit are not the same run; a file written
 * with a column removed and the same file written whole are not the same
 * evidence; and bytes a second party can fetch and bytes only the account
 * holder can reach are not the same claim. Under the two arrays of bare digests
 * this shape replaces, each of those differences was invisible -- the digests
 * differed and nothing said why, so a reader could not tell a truncation from a
 * different result.
 *
 * `content_hash` here is the digest of *other* bytes, not this record's own, so
 * it is `SEMANTIC` and not `DERIVED`. The classes are properties of a field,
 * not of a spelling.
 */
const ArtifactResolutionShape: StudyShape = declareShape("study.artifact_resolution", [
  field("kind", "SEMANTIC"),
  field("locator", "SEMANTIC"),
])

const ArtifactRefShape: StudyShape = declareShape("study.artifact_ref", [
  field("name", "SEMANTIC"),
  field("role", "SEMANTIC"),
  field("media_type", "SEMANTIC"),
  field("byte_size", "SEMANTIC"),
  field("content_hash", "SEMANTIC"),
  field("resolution", "SEMANTIC", objectOf(ArtifactResolutionShape)),
  field("completeness", "SEMANTIC"),
  field("partial_reason", "SEMANTIC"),
  field("redaction", "SEMANTIC"),
  field("redaction_reason", "SEMANTIC"),
])

/**
 * Where an answer came from.
 *
 * `actor` is `SEMANTIC`, which is the opposite call from `EvidenceEdge`'s
 * `asserted_by`, and deliberately. Who asserted that one node supports another
 * is evidence about the assertion; who supplied a budget figure is the
 * provenance of the figure itself, and a budget the CFO stated and the same
 * number read off a vendor brochure are not the same specification.
 *
 * `recorded_at` is the server saying when it observed the answer, so it follows
 * the family's convention and lands in the receipt preimage rather than in what
 * the answer says.
 */
const AnswerProvenanceShape: StudyShape = declareShape("study.answer_provenance", [
  field("source", "SEMANTIC"),
  field("actor", "SEMANTIC"),
  field("reference", "SEMANTIC"),
  field("recorded_at", "RECEIPT_ONLY"),
])

/**
 * One entry in the elicitation queue.
 *
 * The split is the goal's own: the condition an orchestrator acts on is
 * structured and `SEMANTIC`, and the prose beside it is `RECORD_ONLY`.
 * Rewording a question without changing which field it targets, what shape the
 * answer takes, what it blocks or what happened to the asking leaves the study
 * asking the same thing.
 *
 * `resolution` is the field the whole structure exists for, so it is semantic:
 * a question nobody answered and a question answered "I do not know" are
 * different specifications, and under a digest that ignored this they would be
 * one.
 */
const OpenQuestionShape: StudyShape = declareShape("study.open_question", [
  field("question_id", "SEMANTIC"),
  field("targets", "SEMANTIC"),
  field("question", "RECORD_ONLY"),
  field("answer_type", "SEMANTIC"),
  field("requirement", "SEMANTIC"),
  field("why_needed", "RECORD_ONLY"),
  field("blocks", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("allowed_choices", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("answer_provenance", "SEMANTIC", objectOf(AnswerProvenanceShape)),
  field("resolution", "SEMANTIC"),
])

const CriterionThresholdShape: StudyShape = declareShape("study.criterion_threshold", [
  field("dimension", "SEMANTIC"),
  field("value", "SEMANTIC"),
  field("exact_value", "SEMANTIC"),
  field("unit", "SEMANTIC"),
])

/**
 * A success or refusal criterion as a predicate.
 *
 * `status` is the evaluated outcome and moves under a criterion whose predicate
 * stands still, so it is `RECORD_ONLY` for the reason a queue status is not on
 * any content-addressed record in this family at all: a digest over state that
 * moves stops matching itself between two reads of the same row.
 * `explanation` is the sentence a reader needs and the orchestrator does not,
 * and it is `RECORD_ONLY` for the reason every other piece of prose in this
 * family is: rewording the justification does not change what is tested.
 */
const StudyCriterionShape: StudyShape = declareShape("study.criterion", [
  field("criterion_id", "SEMANTIC"),
  field("metric_ref", "SEMANTIC"),
  field("comparator", "SEMANTIC"),
  field("threshold", "SEMANTIC", objectOf(CriterionThresholdShape)),
  field("required_evidence", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("status", "RECORD_ONLY"),
  field("explanation", "RECORD_ONLY"),
])

const SpecificationSuccessCriterionShape: StudyShape = declareShape("study.specification_success_criterion", [
  field("statement", "SEMANTIC", objectOf(TextFieldShape)),
  field("predicate", "SEMANTIC", objectOf(StudyCriterionShape)),
])

const DataRetentionShape: StudyShape = declareShape("study.data_retention", [
  field("kind", "SEMANTIC"),
  field("days", "SEMANTIC"),
])

const AllowedEgressShape: StudyShape = declareShape("study.allowed_egress", [
  field("kind", "SEMANTIC"),
  field("host", "SEMANTIC"),
])

const DeletionPolicyShape: StudyShape = declareShape("study.deletion_policy", [
  field("kind", "SEMANTIC"),
  field("within_days", "SEMANTIC"),
])

/**
 * What happens to the inputs and the outputs.
 *
 * Every field `SEMANTIC`, with no prose among them, because there is no prose:
 * the summary a user reads is generated from these eleven decisions rather than
 * stored beside them. A plan that keeps its data private and a plan that
 * publishes it are not the same plan, and each of these fields is one of the
 * ways that sentence can be true.
 */
const DataHandlingPolicyShape: StudyShape = declareShape("study.data_handling_policy", [
  field("visibility", "SEMANTIC"),
  field("retention", "SEMANTIC", objectOf(DataRetentionShape)),
  field("third_party_transfer", "SEMANTIC"),
  field("model_training_use", "SEMANTIC"),
  field("public_dataset_opt_in", "SEMANTIC"),
  field("allowed_egress", "SEMANTIC", arrayOf(objectOf(AllowedEgressShape))),
  field("export_permission", "SEMANTIC"),
  field("deletion_policy", "SEMANTIC", objectOf(DeletionPolicyShape)),
  field("secret_handling", "SEMANTIC"),
  field("pii_handling", "SEMANTIC"),
  field("policy_version", "SEMANTIC"),
])

const PlannedBaselineShape: StudyShape = declareShape("study.planned_baseline", [
  field("baseline_ref", "SEMANTIC"),
  field("source_class", "SEMANTIC"),
  // Prose for a reader about why this baseline was chosen. It does not change
  // what is compared.
  field("note", "RECORD_ONLY"),
])

const CandidateWorkflowShape: StudyShape = declareShape("study.candidate_workflow", [
  field("name", "RECORD_ONLY"),
  field("workload_ref", "SEMANTIC"),
  field("rationale", "RECORD_ONLY"),
])

const ResourceLimitsShape: StudyShape = declareShape("study.resource_limits", [
  field("max_runtime", "SEMANTIC"),
  field("max_memory_bytes", "SEMANTIC"),
  field("max_credits", "SEMANTIC"),
])

/**
 * Whether the run was cancelled, and why.
 *
 * `RECEIPT_ONLY`: a cancellation is the server reporting what happened to this
 * execution, not a statement about the science the capsule describes. Two
 * capsules with identical inputs, one cancelled, describe the same intended
 * computation and take the same semantic digest -- and different record and
 * receipt digests, which is where the difference belongs.
 */
const CancellationShape: StudyShape = declareShape("study.cancellation", [
  field("cancelled", "RECEIPT_ONLY"),
  field("reason", "RECEIPT_ONLY"),
])

/**
 * A file the package generated from its own structured content.
 *
 * Every field `SEMANTIC`, because each is a fact about bytes rather than a note
 * about them. Which of the digests actually reads them is decided by the outer
 * field: a table's CSV is `RECORD_ONLY` because it is a rendering of the rows
 * above it, and a rendering that changes when a header is reworded must not
 * read as new science.
 */
const GeneratedArtifactShape: StudyShape = declareShape("study.generated_artifact", [
  field("media_type", "SEMANTIC"),
  field("byte_size", "SEMANTIC"),
  field("content_hash", "SEMANTIC"),
])

/**
 * One column of a table.
 *
 * `header` is what a reader sees and `column_id` is what a cell names, so the
 * first is presentation and the second is structure -- the same split
 * `EvidenceReference` makes between a slug and a hash, and for the same reason:
 * a reworded header is the same column and a renamed id is a different one.
 *
 * `unit` is `SEMANTIC` because it is a claim rather than a label. A column is an
 * invitation to compare its cells, and a column holding one figure in seconds
 * and one in hours is wrong in a way neither cell is wrong on its own.
 */
const TableColumnShape: StudyShape = declareShape("study.table_column", [
  field("column_id", "SEMANTIC"),
  field("header", "RECORD_ONLY"),
  field("role", "SEMANTIC"),
  field("unit", "SEMANTIC"),
])

/**
 * One cell.
 *
 * `node_hash` is the value and is `SEMANTIC`; `text` is the label of a label
 * column and is not. There is deliberately no field for a number, which is the
 * whole of the table design: a cell that could carry a copy of a value could
 * disagree with the node, and the copy is the one that renders.
 */
const TableCellShape: StudyShape = declareShape("study.table_cell", [
  field("column_id", "SEMANTIC"),
  field("text", "RECORD_ONLY"),
  field("node_hash", "SEMANTIC"),
])

const TableRowShape: StudyShape = declareShape("study.table_row", [
  field("row_id", "SEMANTIC"),
  field("cells", "SEMANTIC", arrayOf(objectOf(TableCellShape))),
])

/**
 * A table, and the CSV that is the same table.
 *
 * The rows are the reported numbers, so they are `SEMANTIC` -- this is where
 * the retired `result_rows` went, and it kept its class. The caption is prose
 * and the CSV artifact is a rendering, so both are `RECORD_ONLY`: regenerating
 * a file from unchanged rows, or rewording the sentence above them, must not
 * read as a study reporting something new.
 */
const StudyTableShape: StudyShape = declareShape("study.table", [
  field("table_id", "SEMANTIC"),
  field("caption", "RECORD_ONLY"),
  field("role", "SEMANTIC"),
  field("columns", "SEMANTIC", arrayOf(objectOf(TableColumnShape))),
  field("rows", "SEMANTIC", arrayOf(objectOf(TableRowShape))),
  field("csv_artifact", "RECORD_ONLY", objectOf(GeneratedArtifactShape)),
])

const FigureValueRefShape = (name: string): StudyShape =>
  declareShape(name, [
    field("kind", "SEMANTIC"),
    field("node_hash", "SEMANTIC"),
    field("table_id", "SEMANTIC"),
    field("row_id", "SEMANTIC"),
    field("column_id", "SEMANTIC"),
  ])

const FigurePointShape: StudyShape = declareShape("study.figure_point", [
  field("x", "SEMANTIC", objectOf(FigureValueRefShape("study.figure_point.x"))),
  field("y", "SEMANTIC", objectOf(FigureValueRefShape("study.figure_point.y"))),
])

const FigureSeriesShape: StudyShape = declareShape("study.figure_series", [
  field("series_id", "SEMANTIC"),
  field("label", "RECORD_ONLY"),
  field("points", "SEMANTIC", arrayOf(objectOf(FigurePointShape))),
])

const FigureAxisShape = (name: string): StudyShape =>
  declareShape(name, [field("label", "RECORD_ONLY"), field("unit", "SEMANTIC")])

const FigureSpecShape: StudyShape = declareShape("study.figure_spec", [
  field("kind", "SEMANTIC"),
  field("x_axis", "SEMANTIC", objectOf(FigureAxisShape("study.figure_spec.x_axis"))),
  field("y_axis", "SEMANTIC", objectOf(FigureAxisShape("study.figure_spec.y_axis"))),
  field("series", "SEMANTIC", arrayOf(objectOf(FigureSeriesShape))),
])

/**
 * A figure as a specification.
 *
 * The whole figure stays `RECORD_ONLY` on the package, where the retired
 * `{label, svg}` shape was, and the reasoning is unchanged: the numbers behind a
 * chart are in the nodes, and two packages whose charts differ while their
 * graphs agree report the same science. What changed is that the chart is now
 * *made of* references to those nodes rather than of markup, so a reader can
 * check it -- which is a different property from whether it is in the digest.
 */
const StudyFigureShape: StudyShape = declareShape("study.figure", [
  field("figure_id", "SEMANTIC"),
  field("title", "RECORD_ONLY"),
  field("caption", "RECORD_ONLY"),
  field("spec", "SEMANTIC", objectOf(FigureSpecShape)),
  field("svg_artifact", "RECORD_ONLY", objectOf(GeneratedArtifactShape)),
])

const ReportSegmentShape: StudyShape = declareShape("study.report_segment", [
  field("kind", "RECORD_ONLY"),
  field("level", "RECORD_ONLY"),
  field("text", "RECORD_ONLY"),
  field("node_hash", "RECORD_ONLY"),
  field("citation_index", "RECORD_ONLY"),
  field("limitation_index", "RECORD_ONLY"),
  field("table_id", "RECORD_ONLY"),
  field("figure_id", "RECORD_ONLY"),
])

const ReportSectionShape: StudyShape = declareShape("study.report_section", [
  field("section_id", "RECORD_ONLY"),
  field("title", "RECORD_ONLY"),
  field("segments", "RECORD_ONLY", arrayOf(objectOf(ReportSegmentShape))),
])

const CommentaryBlockShape: StudyShape = declareShape("study.commentary_block", [
  field("commentary_id", "RECORD_ONLY"),
  field("title", "RECORD_ONLY"),
  field("text", "RECORD_ONLY"),
])

/**
 * The report, classified where the prose that preceded it was.
 *
 * `RECORD_ONLY` throughout, exactly as `report_markdown` was: a report is
 * presentation over the nodes, and two packages whose sections are arranged
 * differently over one graph report the same science. The structure changes what
 * a reader can *check* -- a number reaches a section only by naming a node --
 * and that is a different question from which digest covers the arrangement.
 */
const ReportDocumentShape: StudyShape = declareShape("study.report_document", [
  field("sections", "RECORD_ONLY", arrayOf(objectOf(ReportSectionShape))),
  field("commentary", "RECORD_ONLY", arrayOf(objectOf(CommentaryBlockShape))),
])

const PlatformRequirementShape: StudyShape = declareShape("study.platform_requirement", [
  field("operating_system", "SEMANTIC"),
  field("architecture", "SEMANTIC"),
  field("minimum_runner_version", "SEMANTIC"),
])

/**
 * How to run the study again.
 *
 * Every field `SEMANTIC`, and that is the change from the string it replaces.
 * `reproduction_command` was semantic too, but it was one opaque value: two
 * recipes differing in their container digest, their network policy or their
 * resource ceiling could spell the same command, and a digest over the sentence
 * could not tell them apart. Each of these fields changes which program runs
 * over which inputs under which limits, so each of them changes the run.
 */
const ReproductionRecipeShape: StudyShape = declareShape("study.reproduction_recipe", [
  field("runner", "SEMANTIC"),
  field("runner_version", "SEMANTIC"),
  field("container_digest", "SEMANTIC"),
  field("argv", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("input_refs", "SEMANTIC", arrayOf(objectOf(ArtifactRefShape))),
  field("environment_allowlist", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("expected_output_refs", "SEMANTIC", arrayOf(objectOf(ArtifactRefShape))),
  field("resource_limits", "SEMANTIC", objectOf(ResourceLimitsShape)),
  field("network_policy", "SEMANTIC"),
  field("allowed_hosts", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("platform", "SEMANTIC", objectOf(PlatformRequirementShape)),
])

const EmbeddedBundleShape: StudyShape = declareShape("study.embedded_bundle", [
  field("media_type", "SEMANTIC"),
  field("byte_size", "SEMANTIC"),
  field("content_hash", "SEMANTIC"),
  field("base64", "SEMANTIC"),
])

/**
 * A bundle this package's numbers came out of.
 *
 * `SEMANTIC` including the embedded copy, which is what makes an offline export
 * a different record from the online package that references the same bundle:
 * one carries the document and one does not, and a recipient holding either can
 * tell which they have.
 */
const BundleRefShape: StudyShape = declareShape("study.bundle_ref", [
  field("bundle_kind", "SEMANTIC"),
  field("reproducibility_hash", "SEMANTIC"),
  field("embedded", "SEMANTIC", objectOf(EmbeddedBundleShape)),
])

const BundleFieldRefShape: StudyShape = declareShape("study.bundle_field_ref", [
  field("bundle_hash", "SEMANTIC"),
  field("field_path", "SEMANTIC"),
])

const ClaimEvidenceEntryShape: StudyShape = declareShape("study.claim_evidence_entry", [
  field("claim_node_hash", "SEMANTIC"),
  field("evidence_node_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("edge_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
  // Which number of which bundle the claim reads. `SEMANTIC` because it is part
  // of what the claim asserts: two claims citing two different fields of one
  // bundle are two claims, and a digest that read only the bundle's digest
  // would call them one.
  field("bundle_fields", "SEMANTIC", arrayOf(objectOf(BundleFieldRefShape))),
])

const CheckToolShape: StudyShape = declareShape("study.check_tool", [
  field("name", "RECEIPT_ONLY"),
  field("version", "RECEIPT_ONLY"),
])

/**
 * One check, and what happened to it.
 *
 * `RECEIPT_ONLY` throughout, which is a change of class from the
 * `failed_checks: string[]` it replaces. That list was `SEMANTIC`, and it was
 * the wrong call for the reason the list itself was wrong: which checks a
 * pipeline ran, with which tool, at which moment, is a record of what was
 * observed rather than part of what the study says. Re-running the same checks
 * tomorrow produces the same science and a different ledger, and only the record
 * and receipt digests should move.
 */
const CheckLedgerEntryShape: StudyShape = declareShape("study.check_ledger_entry", [
  field("check_id", "RECEIPT_ONLY"),
  field("status", "RECEIPT_ONLY"),
  field("requirement", "RECEIPT_ONLY"),
  field("tool", "RECEIPT_ONLY", objectOf(CheckToolShape)),
  field("input_refs", "RECEIPT_ONLY", arrayOf({ kind: "leaf" })),
  field("output_ref", "RECEIPT_ONLY"),
  field("reason", "RECEIPT_ONLY"),
  field("limitations", "RECEIPT_ONLY", arrayOf({ kind: "leaf" })),
  field("observed_at", "RECEIPT_ONLY"),
])

/**
 * The two header components every record repeats, and its own digest.
 *
 * `DERIVED` in all three cases, for two different reasons that land in one
 * place. `schema_version` and `hash_rules_id` are already committed to by the
 * preimage header, so putting them in the body too would state them twice and
 * let the two statements disagree. A record's own hash cannot be an input to
 * itself.
 */
const derivedHeaderFields = (selfHashField: string): readonly ReturnType<typeof field>[] => [
  field("schema_version", "DERIVED"),
  field("hash_rules_id", "DERIVED"),
  field(selfHashField, "DERIVED"),
]

/**
 * What cannot change for a given `study_id`, and what a list view shows.
 *
 * The split is the change. `title` and `project_ref` used to be `SEMANTIC` at
 * the root, which made them identity: a rename produced a different record, so
 * every `study_ref` pointing at the study stopped resolving. Identity is now
 * `study_id`, which is minted once and derived from nothing, so a title can be
 * what a title is -- presentation -- and the digest can stand still while the
 * study advances.
 *
 * `project_ref` stays `SEMANTIC` because it is a fact about the study rather
 * than a label on it: which project a study belongs to is not something a
 * display layer decides. It is an immutable ref rather than a slug for the same
 * reason `study_id` is.
 */
const StudyCoreShape: StudyShape = declareShape("study.core", [
  field("study_type", "SEMANTIC"),
  field("project_ref", "SEMANTIC"),
  field("is_demo", "SEMANTIC"),
])

const StudyPresentationShape: StudyShape = declareShape("study.presentation", [
  field("title", "RECORD_ONLY"),
  // Denormalized lifecycle state, and denormalized pointers at the newest
  // revisions. All three are projections of the event trail and the revision
  // chain, and all three move without the study itself changing.
  field("status", "RECORD_ONLY"),
  field("latest_specification", "RECORD_ONLY", objectOf(RevisionRefShape)),
  field("latest_plan", "RECORD_ONLY", objectOf(RevisionRefShape)),
])

const StudyShapeDecl: StudyShape = declareShape("study", [
  ...derivedHeaderFields("content_hash"),
  // The identity, and the only field that carries it. `SEMANTIC` because it is
  // what the study *is*: two studies asking the same question in the same
  // project are two studies, and this is the field that says so.
  field("study_id", "SEMANTIC"),
  field("core", "SEMANTIC", objectOf(StudyCoreShape)),
  field("presentation", "RECORD_ONLY", objectOf(StudyPresentationShape)),
  field("created_at", "RECEIPT_ONLY"),
])

/**
 * The event trail, as one table over the union of what any variant carries.
 *
 * `StudyEventSchema` is a discriminated union: a `task_started` event declares
 * `task_ref` and not `package_ref`, and the parse refuses one that carries the
 * wrong payload. The projection reads a single superset shape instead, and the
 * two are not in tension -- they answer different questions at different
 * layers.
 *
 * The projection's job is that no field enters a digest unclassified and no key
 * is silently skipped. Both hold here: every payload field any variant can
 * carry is classified below, and a field that is present is projected, so a
 * record and the same record with an extra declared field take different
 * digests. Which payload a *kind of event* may carry is a schema question, and
 * `.strict()` on each variant is where it is answered. Making the projection
 * pick a shape from the value of `event_type` would answer it a second time and
 * would make the canonical body depend on data -- the shape of a digest would
 * stop being a fact about the record kind, which is what
 * `assertProjectionReadsSomething` relies on to give the same answer for a full
 * record and a sparse one.
 *
 * Every field is `RECEIPT_ONLY`. An event *is* audit evidence -- who did what,
 * in what order, after which event, on which day -- which is why its self-hash
 * is the record digest and why `semanticHash` over an event refuses rather than
 * returning a constant.
 */
const StudyEventShapeDecl: StudyShape = declareShape("study_event", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECEIPT_ONLY"),
  // The audit chain itself: what happened, in what order, after which event.
  field("event_type", "RECEIPT_ONLY"),
  field("sequence", "RECEIPT_ONLY"),
  field("previous_event_hash", "RECEIPT_ONLY"),
  field("from_status", "RECEIPT_ONLY"),
  field("to_status", "RECEIPT_ONLY"),
  field("actor", "RECEIPT_ONLY"),
  field("reason", "RECEIPT_ONLY"),
  field("created_at", "RECEIPT_ONLY"),
  // The payload, one field name per meaning across every variant. A revision
  // pointer is projected in full: `RevisionRef`'s own fields are `SEMANTIC`, and
  // the receipt projection reads a selected value's insides rather than
  // re-asking the outer question -- which is what stopped `plan_ref` from
  // canonicalizing to `{}` and letting two events adopting two different plans
  // share one receipt digest.
  field("specification_ref", "RECEIPT_ONLY", objectOf(RevisionRefShape)),
  field("plan_ref", "RECEIPT_ONLY", objectOf(RevisionRefShape)),
  field("superseded_plan_ref", "RECEIPT_ONLY", objectOf(RevisionRefShape)),
  field("confirmed_hash", "RECEIPT_ONLY"),
  // The receipt a confirmation produced. A `confirmation_recorded` event that
  // carried only `confirmed_hash` recorded that somebody approved a digest and
  // nothing about who, under which scope, or until when -- which is the whole
  // of what `receipt.ts` exists to stop a bare hash from standing in for.
  field("receipt_ref", "RECEIPT_ONLY"),
  field("task_ref", "RECEIPT_ONLY"),
  field("capsule_ref", "RECEIPT_ONLY"),
  field("package_ref", "RECEIPT_ONLY"),
  field("reproduction_capsule_ref", "RECEIPT_ONLY"),
  field("superseding_study_ref", "RECEIPT_ONLY"),
  field("question", "RECEIPT_ONLY"),
  field("review_verdict", "RECEIPT_ONLY"),
])

const ProblemSpecificationShapeDecl: StudyShape = declareShape("problem_specification", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("revision", "RECORD_ONLY"),
  field("supersedes", "RECORD_ONLY"),
  field("objective", "SEMANTIC", objectOf(TextFieldShape)),
  field("success_criteria", "SEMANTIC", arrayOf(objectOf(SpecificationSuccessCriterionShape))),
  field("accuracy_requirement", "SEMANTIC", objectOf(QuantityFieldShape)),
  field("runtime_constraint", "SEMANTIC", objectOf(QuantityFieldShape)),
  field("budget_constraint", "SEMANTIC", objectOf(QuantityFieldShape)),
  field("problem_size", "SEMANTIC", objectOf(QuantityFieldShape)),
  field("current_classical_method", "SEMANTIC", objectOf(TextFieldShape)),
  field("why_quantum", "SEMANTIC", objectOf(TextFieldShape)),
  field("open_questions", "SEMANTIC", arrayOf(objectOf(OpenQuestionShape))),
  field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("created_at", "RECEIPT_ONLY"),
])

const StudyPlanShapeDecl: StudyShape = declareShape("study_plan", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  // Which specification this plan answers is the plan's premise, not its
  // placement: a plan against revision 4 and the same plan against revision 7
  // are different plans.
  field("specification_ref", "SEMANTIC", objectOf(RevisionRefShape)),
  field("revision", "RECORD_ONLY"),
  field("supersedes", "RECORD_ONLY"),
  field("baselines", "SEMANTIC", arrayOf(objectOf(PlannedBaselineShape))),
  field("candidates", "SEMANTIC", arrayOf(objectOf(CandidateWorkflowShape))),
  field("scenario_refs", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("pinned_versions", "SEMANTIC", objectOf(PinnedVersionsShape)),
  field("expected_runtime", "SEMANTIC", objectOf(QuantityShape)),
  field("expected_credits", "SEMANTIC", objectOf(QuantityShape)),
  field("max_credits", "SEMANTIC"),
  field("data_handling", "SEMANTIC", objectOf(DataHandlingPolicyShape)),
  field("reproducibility_level", "SEMANTIC"),
  field("success_criteria", "SEMANTIC", arrayOf(objectOf(StudyCriterionShape))),
  field("refusal_criteria", "SEMANTIC", arrayOf(objectOf(StudyCriterionShape))),
  field("execution_limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("created_at", "RECEIPT_ONLY"),
])

const EvidenceNodeShapeDecl: StudyShape = declareShape("evidence_node", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("kind", "SEMANTIC"),
  field("label", "RECORD_ONLY"),
  // Who the node may be shown to. `RECORD_ONLY`, and an `evidence_node`
  // self-hashes for the `record` purpose, so visibility is inside the node's
  // identity: a node cannot be relabelled public for an export without taking a
  // new hash and breaking every edge that names it. Out of the semantic digest
  // because who may read a measurement is not part of what it measured.
  field("visibility", "RECORD_ONLY"),
  field("claim", "SEMANTIC", objectOf(ClaimStatementShape)),
  field("quantity", "SEMANTIC", objectOf(QuantityShape)),
  field("reference", "SEMANTIC", objectOf(EvidenceReferenceShape)),
  field("citation", "SEMANTIC", objectOf(CitationShape)),
  field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  // When the cited source was published, and when this study read it. Both are
  // properties of the evidence rather than of the server that stored the node.
  field("source_published_on", "SEMANTIC"),
  field("retrieved_on", "SEMANTIC"),
  field("created_at", "RECEIPT_ONLY"),
])

const EvidenceEdgeShapeDecl: StudyShape = declareShape("evidence_edge", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("kind", "SEMANTIC"),
  field("from_node_hash", "SEMANTIC"),
  field("to_node_hash", "SEMANTIC"),
  // Who asserted the edge is evidence about the assertion, not part of it: the
  // same support relation asserted by two reviewers is one relation.
  field("asserted_by", "RECEIPT_ONLY"),
  field("rationale", "RECORD_ONLY"),
  field("created_at", "RECEIPT_ONLY"),
])

const BackendSnapshotShape: StudyShape = declareShape("study.backend_snapshot", [
  field("provider", "SEMANTIC"),
  field("backend", "SEMANTIC"),
  field("snapshot_hash", "SEMANTIC"),
])

const CostConfirmationShape: StudyShape = declareShape("study.cost_confirmation", [
  field("credits_charged", "SEMANTIC"),
  field("authorized_maximum", "SEMANTIC"),
  field("source", "SEMANTIC"),
])

const QuotaConfirmationShape: StudyShape = declareShape("study.quota_confirmation", [
  field("quota", "SEMANTIC"),
  field("within_quota", "SEMANTIC"),
  field("source", "SEMANTIC"),
  field("exceeded_reason", "SEMANTIC"),
])

/**
 * What ran, as one table over the union of what any execution class carries.
 *
 * The same arrangement `study_event` uses, for the same reason and with the
 * same justification. `ExecutionEnvelopeSchema` is a discriminated union: a
 * managed simulation declares an image digest and a runner version, a hardware
 * run declares a provider adapter and a cost confirmation, and the parse
 * refuses one that carries the other's payload. The projection reads a single
 * superset shape instead.
 *
 * The two are not in tension. The projection's job is that no field enters a
 * digest unclassified and no key is silently skipped, and both hold: every
 * field any class can carry is classified below, and a field that is present is
 * projected. Which payload a *class* may carry is a schema question, answered by
 * the union and by `EXECUTION_EVIDENCE_REQUIREMENTS` in `capsule.ts`. Making the
 * projection pick a shape from the value of `kind` would answer it a second time
 * and would make the canonical body depend on data -- the shape of a digest
 * would stop being a fact about the record kind, which is what
 * `assertProjectionReadsSomething` relies on to give the same answer for a
 * managed capsule and a local one.
 *
 * Every field is `SEMANTIC`. Change any of them and the run is a different run,
 * however similar its output: a different image, a different lock, a different
 * backend calibration, a different charge against a different ceiling.
 */
const ExecutionEnvelopeShape: StudyShape = declareShape("study.execution_envelope", [
  field("kind", "SEMANTIC"),
  field("image_digest", "SEMANTIC"),
  field("dependency_lock_ref", "SEMANTIC"),
  field("runner_version", "SEMANTIC", objectOf(NameVersionShape("study.runner_version"))),
  field("resource_limits", "SEMANTIC", objectOf(ResourceLimitsShape)),
  field("attestation_limitation", "SEMANTIC"),
  field("provider_adapter", "SEMANTIC", objectOf(NameVersionShape("study.provider_adapter"))),
  field("backend_snapshot", "SEMANTIC", objectOf(BackendSnapshotShape)),
  field("confirmation_receipt_ref", "SEMANTIC"),
  field("provider_result_ref", "SEMANTIC"),
  field("cost_confirmation", "SEMANTIC", objectOf(CostConfirmationShape)),
  field("quota_confirmation", "SEMANTIC", objectOf(QuotaConfirmationShape)),
])

/**
 * Who ran it, on which job, which attempt, and when.
 *
 * `RECEIPT_ONLY` throughout, and that is what the goal's rule about timestamps,
 * actor and job id amounts to in this family's vocabulary. Two runs of
 * identical inputs describe the same intended computation whether they ran in
 * March or December, on the first attempt or the fourth, so a semantic digest
 * that read any of these would report new science every time a job was retried.
 *
 * The job id in particular belongs here rather than on the capsule proper: an
 * `ExecutionJob` is mutable and is not content-addressed at all, so a capsule
 * that carried its id as semantic content would tie an immutable record to a
 * row that changes underneath it.
 */
const ExecutionReceiptShape: StudyShape = declareShape("study.execution_receipt", [
  field("job_id", "RECEIPT_ONLY"),
  field("attempt", "RECEIPT_ONLY"),
  field("actor", "RECEIPT_ONLY"),
  field("started_at", "RECEIPT_ONLY"),
  field("finished_at", "RECEIPT_ONLY"),
])

const ResourceCeilingShape: StudyShape = declareShape("study.resource_ceiling", [
  field("max_credits", "SEMANTIC"),
  field("max_runtime", "SEMANTIC"),
  field("max_memory_bytes", "SEMANTIC"),
  field("resource_class", "SEMANTIC"),
])

/**
 * What a server recorded when somebody said yes.
 *
 * The split down the middle of this table is the record's whole shape. The
 * `SEMANTIC` half is *what was authorised*: which plan revision, which science
 * inside it, what the actor was shown, which permissions, which ceiling, which
 * kind of machine, under which data-handling policy, until when. The
 * `RECEIPT_ONLY` half is *what the server observed*: the authenticated subject,
 * the tenant, the client, the channel, the moment, the nonce and the
 * idempotency key.
 *
 * `expires_at` sits in the first half although it is a timestamp, and the
 * reading is the same one that puts `resource_limits.max_runtime` in the
 * semantic projection and `started_at` outside it: an expiry is a limit the
 * confirmation carries, not an observation the server made. Two receipts
 * differing only in their expiry authorise different things.
 *
 * `attestation_level` is `RECORD_ONLY` here as it is on a capsule. It says what
 * this family claims about the record -- `hash_only`, which is deliberately
 * little -- rather than anything about what was approved.
 */
const ConfirmationReceiptShapeDecl: StudyShape = declareShape("confirmation_receipt", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("plan_ref", "SEMANTIC", objectOf(RevisionRefShape)),
  field("plan_semantic_hash", "SEMANTIC"),
  field("shown_summary_hash", "SEMANTIC"),
  field("authorization_scope", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("estimated_credits", "SEMANTIC"),
  field("max_credits", "SEMANTIC"),
  field("resource_class", "SEMANTIC"),
  field("data_handling_policy_revision", "SEMANTIC"),
  field("expires_at", "SEMANTIC"),
  field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("attestation_level", "RECORD_ONLY"),
  field("actor_subject_id", "RECEIPT_ONLY"),
  field("tenant_id", "RECEIPT_ONLY"),
  field("oauth_client_id", "RECEIPT_ONLY"),
  field("confirmation_channel", "RECEIPT_ONLY"),
  field("confirmed_at", "RECEIPT_ONLY"),
  field("nonce", "RECEIPT_ONLY"),
  field("idempotency_key", "RECEIPT_ONLY"),
])

/**
 * What was authorised, and nothing about how it went.
 *
 * The table that replaces `study_task`'s. Two fields are gone rather than
 * reclassified -- `status`, which the execution system overwrote, and
 * `capsule_ref`, which appeared only after a run existed -- and their absence is
 * what makes this record's identity survive execution. There is nothing left
 * here that moves, so its self-hash can be the `record` digest, which answers
 * whether the row was edited; `study_task` had to use the `semantic` one to keep
 * its status out, and so could not answer that question at all.
 */
const StudyTaskAuthorizationShapeDecl: StudyShape = declareShape("study_task_authorization", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("plan_ref", "SEMANTIC", objectOf(RevisionRefShape)),
  field("confirmation_receipt_ref", "SEMANTIC"),
  field("requested_operation", "SEMANTIC"),
  field("input_refs", "SEMANTIC", arrayOf(objectOf(ArtifactRefShape))),
  field("resource_ceiling", "SEMANTIC", objectOf(ResourceCeilingShape)),
  field("created_at", "RECEIPT_ONLY"),
])

/**
 * How the work ended.
 *
 * `reason` is `SEMANTIC` rather than presentation: two outcomes refusing for two
 * different reasons are two different outcomes, and the reason is the only place
 * a reader expecting a number finds out why there is not one. `attempts` is
 * `RECEIPT_ONLY` for the mirror reason: a run that succeeded on the third try
 * and one that succeeded on the first report the same result.
 */
const TaskOutcomeShapeDecl: StudyShape = declareShape("task_outcome", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("authorization_ref", "SEMANTIC"),
  field("capsule_ref", "SEMANTIC"),
  field("terminal_status", "SEMANTIC"),
  field("reason", "SEMANTIC"),
  field("attempts", "RECEIPT_ONLY"),
  field("created_at", "RECEIPT_ONLY"),
])

/**
 * What a person concluded about a node.
 *
 * A review is not a relation between two records, which is why it is a record
 * rather than an edge: its other end is a reviewer, and there is no node kind an
 * edge could point at. Splitting the fields follows from that. The subject and
 * the verdict are what the review *says*, so they are `SEMANTIC` -- two reviews
 * of one node reaching two conclusions are two different findings, and a digest
 * that could not tell them apart would let an acceptance stand in for a
 * rejection. The reviewer and the timestamp are who and when, which is the
 * receipt's question, and the rationale is prose written for a reader.
 */
const ReviewRecordShapeDecl: StudyShape = declareShape("review_record", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("subject_node_hash", "SEMANTIC"),
  field("verdict", "SEMANTIC"),
  field("rationale", "RECORD_ONLY"),
  field("reviewer", "RECEIPT_ONLY"),
  field("created_at", "RECEIPT_ONLY"),
])

/**
 * Whether a re-run reproduced what it set out to reproduce.
 *
 * The four `SEMANTIC` fields are the comparison: which record was re-run, under
 * which capsule, what came out, and whether the two agree. A reproduction
 * record whose digest did not cover the outcome would give a match and a
 * divergence one identity, which is the reason this is a record and not a
 * `reproduces` edge -- an edge has nowhere to put the verdict at all.
 */
const ReproductionRecordShapeDecl: StudyShape = declareShape("reproduction_record", [
  ...derivedHeaderFields("content_hash"),
  field("study_ref", "RECORD_ONLY"),
  field("original_node_hash", "SEMANTIC"),
  field("reproduction_capsule_ref", "SEMANTIC"),
  field("observed_node_hash", "SEMANTIC"),
  field("outcome", "SEMANTIC"),
  field("notes", "RECORD_ONLY"),
  field("asserted_by", "RECEIPT_ONLY"),
  field("created_at", "RECEIPT_ONLY"),
])

const ExecutionCapsuleShapeDecl: StudyShape = declareShape("execution_capsule", [
  ...derivedHeaderFields("reproducibility_hash"),
  field("study_ref", "RECORD_ONLY"),
  // Which authorization this run answers. `SEMANTIC` where the retired
  // `task_ref` was `RECORD_ONLY`, and the change follows from the split: a
  // `study_task` carried a status the execution system overwrote, so pointing at
  // one said where a capsule sat rather than what it was permitted to do. A
  // `study_task_authorization` is immutable and carries the plan, the receipt
  // and the ceiling, so which one a run answers is part of what the run was.
  field("authorization_ref", "SEMANTIC"),
  // Everything below is a deterministic reproduction condition: change any one
  // and the run is a different run, however similar its output.
  field("manifest_hash", "SEMANTIC"),
  field("versions", "SEMANTIC", objectOf(CapsuleVersionsShape)),
  field("source_hash", "SEMANTIC"),
  field("seed", "SEMANTIC"),
  field("environment", "SEMANTIC", objectOf(StudyEnvironmentShape)),
  field("inputs", "SEMANTIC", arrayOf(objectOf(ArtifactRefShape))),
  field("outputs", "SEMANTIC", arrayOf(objectOf(ArtifactRefShape))),
  field("execution_class", "SEMANTIC"),
  field("execution", "SEMANTIC", objectOf(ExecutionEnvelopeShape)),
  field("logs_ref", "RECORD_ONLY"),
  field("cancellation", "RECEIPT_ONLY", objectOf(CancellationShape)),
  // What this family claims about the capsule, which is deliberately little:
  // `hash_only` establishes that the bytes are the bytes, and nothing about who
  // produced them or whether they are correct.
  field("attestation_level", "RECORD_ONLY"),
  field("execution_receipt", "RECEIPT_ONLY", objectOf(ExecutionReceiptShape)),
  field("created_at", "RECEIPT_ONLY"),
])

const ResearchPackageShapeDecl: StudyShape = declareShape("research_package", [
  ...derivedHeaderFields("reproducibility_hash"),
  field("package_kind", "SEMANTIC"),
  // Whether the recipient needs anything besides this file. `SEMANTIC` because
  // it decides what the record must carry: an offline export that references a
  // bundle it does not embed is refused, so the same graph exported two ways is
  // two records with two obligations.
  field("distribution", "SEMANTIC"),
  field("study_ref", "RECORD_ONLY"),
  field("plan_ref", "SEMANTIC", objectOf(RevisionRefShape)),
  field("report", "RECORD_ONLY", objectOf(ReportDocumentShape)),
  field("tables", "SEMANTIC", arrayOf(objectOf(StudyTableShape))),
  field("figures", "RECORD_ONLY", arrayOf(objectOf(StudyFigureShape))),
  field("references", "SEMANTIC", arrayOf(objectOf(CitationShape))),
  field("bundle_refs", "SEMANTIC", arrayOf(objectOf(BundleRefShape))),
  field("environment", "SEMANTIC", objectOf(StudyEnvironmentShape)),
  field("recipe", "SEMANTIC", objectOf(ReproductionRecipeShape)),
  field("nodes", "SEMANTIC", arrayOf(objectOf(EvidenceNodeShapeDecl))),
  field("edges", "SEMANTIC", arrayOf(objectOf(EvidenceEdgeShapeDecl))),
  field("claim_evidence_map", "SEMANTIC", arrayOf(objectOf(ClaimEvidenceEntryShape))),
  // A verdict and a second run are evidence *about* the study rather than part
  // of what it says, which is the call `EvidenceEdge.asserted_by` makes and for
  // the same reason: two packages differing only in whether a review is attached
  // report the same science. They are covered by the record and receipt digests,
  // where "who said what, and when" belongs.
  field("reviews", "RECEIPT_ONLY", arrayOf(objectOf(ReviewRecordShapeDecl))),
  field("reproductions", "RECEIPT_ONLY", arrayOf(objectOf(ReproductionRecordShapeDecl))),
  field("check_ledger", "RECEIPT_ONLY", arrayOf(objectOf(CheckLedgerEntryShape))),
  field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
  field("is_demo", "SEMANTIC"),
  field("created_at", "RECEIPT_ONLY"),
])

/**
 * Every record kind this build hashes, as immutable plain data.
 *
 * A readonly tuple rather than a `Map`, for the reason `limits.ts` gives: the
 * exported value is data a consumer can read and cannot edit, and the lookup
 * that makes it cheap is module-private below. `record_kind` is a preimage
 * header component, so an entry added here is a new digest namespace and never
 * a reinterpretation of an existing one.
 */
export interface StudyRecordKindEntry {
  readonly record_kind: string
  readonly shape: StudyShape
  readonly self_hash_field: string
  readonly self_hash_purpose: StudyHashPurpose
}

/**
 * Which of the four digests a record kind writes into its own hash field.
 *
 * The four roles are separate because they answer separate questions, so
 * "which one is this record's identity" is a decision per kind rather than a
 * default. It is declared here, as data, for the same reason the field classes
 * are: both languages read one table, and a reviewer sees the choice in a diff.
 *
 * One rule decides every row: **a record whose fields all stand still takes a
 * `record` self-hash; a record that carries denormalized state which moves
 * under it takes a `semantic` one.**
 *
 * | kind | field | purpose | why |
 * | --- | --- | --- | --- |
 * | `study` | `content_hash` | `semantic` | everything under `presentation` -- the title, the status and the two revision pointers -- moves without the study changing, and the identity a `study_ref` names is `study_id` rather than any digest |
 * | `study_event` | `content_hash` | `record` | immutable; every field is audit evidence, so `semantic` reads none of them and refuses |
 * | `problem_specification` | `content_hash` | `record` | immutable; `revision` and `supersedes` are the chain and must be covered |
 * | `study_plan` | `content_hash` | `record` | immutable; a confirmation authorises one revision, and "was this edited after it was written" is literally the question `verifyPlanConfirmation` asks |
 * | `confirmation_receipt` | `content_hash` | `record` | immutable; it is the server's record of what it observed, and an edited record of an observation has stopped being one |
 * | `study_task_authorization` | `content_hash` | `record` | immutable; nothing about running the work touches it, which is exactly what the retired `study_task` could not say |
 * | `task_outcome` | `content_hash` | `record` | immutable; written once when the work ends, never edited afterwards |
 * | `evidence_node` | `content_hash` | `record` | immutable; identity in the graph, so a relabelled node is a different node |
 * | `evidence_edge` | `content_hash` | `record` | immutable, same reason |
 * | `review_record` | `content_hash` | `record` | immutable; a review of one version of a node does not travel to the next |
 * | `reproduction_record` | `content_hash` | `record` | immutable, same reason |
 * | `execution_capsule` | `reproducibility_hash` | `record` | written once per run and never edited; `verifyExecutionCapsule` reports "unedited", which is the record question |
 * | `research_package` | `reproducibility_hash` | `record` | shipped as a file; `verifyResearchPackage` reports "the file was not edited after it was written" |
 *
 * Two consequences worth stating, because both were previously answered by one
 * digest doing two jobs.
 *
 * A `study` still has a record digest -- it is just not its identity.
 * `recordHash("study", study)` answers "was this row edited", presentation
 * included; the `content_hash` deliberately does not, so that a study can be
 * renamed and advanced without its digest moving. What every record kind
 * carrying a `study_ref` points at is neither digest: it is `study_id`, which is
 * minted once and derived from nothing.
 *
 * `study` is now the only kind whose self-hash is the semantic digest, and the
 * exception has shrunk rather than spread. `study_task` was the other one, and
 * it was there because the record mixed an authorization with a status the
 * execution system overwrote -- a digest that covered the status could not stay
 * still, so the semantic one was used to exclude it, and the record then had no
 * digest that could answer whether it had been edited. Splitting the record
 * (`task.ts`) removed the mixture instead of working around it, and all three
 * pieces that are content-addressed take the `record` digest.
 *
 * An `execution_capsule` and a `research_package` still have a semantic digest,
 * and it is the one a reproduction comparison wants: `semanticHash` over two
 * capsules asks whether they describe the same intended computation, ignoring
 * when they ran and whether one was cancelled. Their `reproducibility_hash`
 * cannot answer that and does not claim to -- it answers whether the file in
 * front of the reader is the file that was written.
 */
export const STUDY_RECORD_KINDS: readonly StudyRecordKindEntry[] = Object.freeze([
  Object.freeze({
    record_kind: "study",
    shape: StudyShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "semantic" as const,
  }),
  Object.freeze({
    record_kind: "study_event",
    shape: StudyEventShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "problem_specification",
    shape: ProblemSpecificationShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "study_plan",
    shape: StudyPlanShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "confirmation_receipt",
    shape: ConfirmationReceiptShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "study_task_authorization",
    shape: StudyTaskAuthorizationShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "task_outcome",
    shape: TaskOutcomeShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "evidence_node",
    shape: EvidenceNodeShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "evidence_edge",
    shape: EvidenceEdgeShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "review_record",
    shape: ReviewRecordShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "reproduction_record",
    shape: ReproductionRecordShapeDecl,
    self_hash_field: "content_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "execution_capsule",
    shape: ExecutionCapsuleShapeDecl,
    self_hash_field: "reproducibility_hash",
    self_hash_purpose: "record" as const,
  }),
  Object.freeze({
    record_kind: "research_package",
    shape: ResearchPackageShapeDecl,
    self_hash_field: "reproducibility_hash",
    self_hash_purpose: "record" as const,
  }),
])

/** The working lookup, module-private and built from the frozen tuple. */
const kindsByName = new Map<string, StudyRecordKindEntry>(
  STUDY_RECORD_KINDS.map((entry) => [entry.record_kind, entry]),
)

/** The record kind names, as immutable plain data. */
export const STUDY_RECORD_KIND_NAMES: readonly string[] = Object.freeze(
  STUDY_RECORD_KINDS.map((entry) => entry.record_kind),
)

/**
 * The kinds this build knows and deliberately does not hash, as immutable plain
 * data.
 *
 * An `ExecutionJob` is queue status, an attempt counter, a progress figure and
 * a cancellation flag: every one of them is overwritten while the work runs,
 * which is exactly what a content address cannot survive. The retired
 * `study_task` demonstrated the cost of pretending otherwise -- it had to
 * exclude its own status from its own digest to stay referenceable, and so had
 * no digest left that could answer whether the row had been edited.
 *
 * Declared here rather than simply left out, because "we do not hash this" and
 * "we have never heard of this" are different answers and send a reader to
 * different places. A caller who hashes a job gets `NOT_CONTENT_ADDRESSED` and
 * a sentence saying which record to address instead; a caller who invents a
 * kind gets `UNKNOWN_RECORD_KIND`.
 */
export interface StudyControlPlaneKind {
  readonly record_kind: string
  /** The content-addressed record a caller should reference instead. */
  readonly address_instead: string
  readonly why: string
}

export const STUDY_CONTROL_PLANE_KINDS: readonly StudyControlPlaneKind[] = Object.freeze([
  Object.freeze({
    record_kind: "execution_job",
    address_instead: "study_task_authorization",
    why:
      "a job is where the work is right now -- queued, leased, running, retried -- and a digest over state that " +
      "moves is a digest that stops matching itself between two reads of the same row",
  }),
])

/** The working lookup, module-private and built from the frozen tuple. */
const controlPlaneByName = new Map<string, StudyControlPlaneKind>(
  STUDY_CONTROL_PLANE_KINDS.map((entry) => [entry.record_kind, entry]),
)

/** The control-plane kind names, as immutable plain data. */
export const STUDY_CONTROL_PLANE_KIND_NAMES: readonly string[] = Object.freeze(
  STUDY_CONTROL_PLANE_KINDS.map((entry) => entry.record_kind),
)

/**
 * The entry for a record kind, or a refusal.
 *
 * A `Map` rather than an object literal, because an object literal answers to
 * every name on `Object.prototype`: a record kind of `"toString"` once resolved
 * to `Function.prototype.toString` and was handed on as a rule set, so the
 * digest layer threw a `TypeError` where a refusal belonged.
 */
export function studyRecordKind(recordKind: string): StudyRecordKindEntry {
  const entry = kindsByName.get(recordKind)
  if (entry === undefined) {
    const controlPlane = controlPlaneByName.get(recordKind)
    if (controlPlane !== undefined) {
      refuse(
        "NOT_CONTENT_ADDRESSED",
        `${JSON.stringify(recordKind)} is control-plane state and this family does not hash it: ` +
          `${controlPlane.why}. Reference ${controlPlane.address_instead} instead, whose digest does not move ` +
          "while the work runs.",
      )
    }
    refuse(
      "UNKNOWN_RECORD_KIND",
      `this build does not know the record kind ${JSON.stringify(recordKind)}. Known kinds: ` +
        `${STUDY_RECORD_KIND_NAMES.join(", ")}. A record kind is a preimage header component, so an unknown one ` +
        "is a digest namespace nobody declared rather than a record to hash under a guess.",
    )
  }
  return entry
}

/**
 * The classification of one shape, flattened to `path -> class`, as immutable
 * plain data.
 *
 * This is what the completeness test compares against a walk of the Zod schema.
 * Flattening rather than exposing the tree keeps the comparison a set
 * difference, which is the form in which "unclassified in either direction" is
 * a readable failure rather than a diff of two nested objects.
 */
export function flattenShapeClasses(shape: StudyShape): ReadonlyMap<string, StudyFieldClass> {
  const out = new Map<string, StudyFieldClass>()
  const visit = (current: StudyShape, prefix: string, seen: ReadonlySet<StudyShape>): void => {
    // A shape that contained itself would not terminate here. No shape in this
    // family does; the guard makes that a fact about the code rather than about
    // the current tables.
    if (seen.has(current)) return
    const nested = new Set(seen).add(current)
    for (const declaration of current.fields) {
      const path = prefix === "" ? declaration.name : `${prefix}.${declaration.name}`
      out.set(path, declaration.field_class)
      let value = declaration.value
      while (value.kind === "array") value = value.item
      if (value.kind === "object") visit(value.shape, path, nested)
    }
  }
  visit(shape, "", new Set())
  return out
}

/**
 * Every Zod object field of a record schema, flattened the same way.
 *
 * Walking the schema is what makes the classification checkable: the schema is
 * where a field is actually added, so a field added there and nowhere else is
 * exactly the silent omission a projection would otherwise hide. The wrappers
 * are unwrapped rather than special-cased at each call, because a field's class
 * does not depend on whether it is optional.
 *
 * A union contributes the fields of **every** option, because that is what the
 * completeness rule is asking: `StudyEventSchema` is a discriminated union of
 * twenty-two variants over one record kind, and a payload field carried by one
 * variant is as capable of entering a digest unclassified as a field carried by
 * all of them. Walking only the first option would let a field added to the
 * twenty-second pass unseen, which is the vacuous-completeness failure this
 * whole file exists to prevent. Paths repeated across options -- the chain
 * fields every variant carries -- are emitted once.
 */
export function flattenSchemaFields(schema: z.ZodTypeAny): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (current: z.ZodTypeAny, prefix: string, depth: number): void => {
    const inner = unwrapSchema(current)
    const def = inner._def as {
      typeName?: string
      shape?: () => z.ZodRawShape
      type?: z.ZodTypeAny
      options?: readonly z.ZodTypeAny[]
    }
    if (def.typeName === "ZodArray" && def.type !== undefined) {
      visit(def.type, prefix, depth + 1)
      return
    }
    if (
      (def.typeName === "ZodUnion" || def.typeName === "ZodDiscriminatedUnion") &&
      def.options !== undefined
    ) {
      // The options are alternative readings of one value, so they sit at the
      // depth the union sits at rather than one below it.
      for (const option of def.options) visit(option, prefix, depth)
      return
    }
    if (def.typeName !== "ZodObject" || def.shape === undefined) return
    if (depth > 16) {
      throw new Error(`Schema walk exceeded 16 levels at ${prefix}; a schema in this family cycles.`)
    }
    for (const [name, child] of Object.entries(def.shape())) {
      const path = prefix === "" ? name : `${prefix}.${name}`
      if (!seen.has(path)) {
        seen.add(path)
        out.push(path)
      }
      visit(child, path, depth + 1)
    }
  }
  visit(schema, "", 0)
  return Object.freeze(out)
}

/**
 * Strip the wrappers that do not change which fields a schema declares.
 *
 * `ZodEffects` is the one that matters: this family's `Quantity` is an object
 * behind a `superRefine`, so a walk that did not unwrap it would find no fields
 * at all and the completeness test would pass by finding nothing -- which is the
 * precise way a completeness test goes vacuous.
 */
function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema
  for (let step = 0; step < 32; step += 1) {
    const def = current._def as {
      typeName?: string
      schema?: z.ZodTypeAny
      innerType?: z.ZodTypeAny
      getter?: () => z.ZodTypeAny
    }
    if (def.typeName === "ZodEffects" && def.schema !== undefined) {
      current = def.schema
      continue
    }
    if (
      (def.typeName === "ZodOptional" ||
        def.typeName === "ZodNullable" ||
        def.typeName === "ZodDefault" ||
        def.typeName === "ZodReadonly" ||
        def.typeName === "ZodBranded" ||
        def.typeName === "ZodCatch") &&
      def.innerType !== undefined
    ) {
      current = def.innerType
      continue
    }
    if (def.typeName === "ZodLazy" && def.getter !== undefined) {
      current = def.getter()
      continue
    }
    return current
  }
  throw new Error("Schema unwrapping did not terminate after 32 steps.")
}
