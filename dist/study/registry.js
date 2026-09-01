import { z } from "zod";
import { refuse } from "./limits.js";
import { arrayOf, declareShape, field, objectOf, } from "./projection.js";
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
const UncertaintyShape = declareShape("study.uncertainty", [
    field("kind", "SEMANTIC"),
    field("low", "SEMANTIC"),
    field("high", "SEMANTIC"),
    field("basis", "SEMANTIC"),
]);
const QuantityShape = declareShape("study.quantity", [
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
]);
const QuantityFieldShape = declareShape("study.quantity_field", [
    field("quantity", "SEMANTIC", objectOf(QuantityShape)),
    // Who is answerable for the value. An inferred figure and the same figure
    // confirmed by a person are different claims, so `origin` is semantic --
    // which is the whole reason the envelope exists.
    field("origin", "SEMANTIC"),
]);
const TextFieldShape = declareShape("study.text_field", [
    field("value", "SEMANTIC"),
    field("evidence", "SEMANTIC"),
    field("origin", "SEMANTIC"),
]);
/**
 * A pointer at one revision of an immutable record.
 *
 * Both halves are `SEMANTIC`. A plan bound to specification revision 4 and the
 * same plan bound to revision 7 are different plans, and this is the field that
 * says which -- it is the binding, not an annotation about it.
 */
const RevisionRefShape = declareShape("study.revision_ref", [
    field("revision_hash", "SEMANTIC"),
    field("revision", "SEMANTIC"),
]);
const CitationShape = declareShape("study.citation", [
    field("title", "SEMANTIC"),
    field("authors", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("year", "SEMANTIC"),
    field("doi", "SEMANTIC"),
    field("url", "SEMANTIC"),
    field("bibtex", "SEMANTIC"),
]);
const ClaimStatementShape = declareShape("study.claim_statement", [
    field("subject", "SEMANTIC"),
    field("metric", "SEMANTIC"),
    field("comparator", "SEMANTIC"),
    field("value", "SEMANTIC", objectOf(QuantityShape)),
]);
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
const EvidenceReferenceShape = declareShape("study.evidence_reference", [
    field("record_kind", "SEMANTIC"),
    field("hash", "SEMANTIC"),
    field("record_slug", "RECORD_ONLY"),
]);
const NameVersionShape = (name) => declareShape(name, [field("name", "SEMANTIC"), field("version", "SEMANTIC")]);
const PinnedVersionsShape = declareShape("study.pinned_versions", [
    field("adapter", "SEMANTIC", objectOf(NameVersionShape("study.pinned_versions.adapter"))),
    field("model", "SEMANTIC", objectOf(NameVersionShape("study.pinned_versions.model"))),
    field("engine", "SEMANTIC", objectOf(NameVersionShape("study.pinned_versions.engine"))),
]);
const CapsuleVersionsShape = declareShape("study.capsule_versions", [
    field("schema", "SEMANTIC"),
    field("adapter", "SEMANTIC", objectOf(NameVersionShape("study.capsule_versions.adapter"))),
    field("engine", "SEMANTIC", objectOf(NameVersionShape("study.capsule_versions.engine"))),
]);
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
const StudyPackageShape = declareShape("study.package", [
    field("name", "SEMANTIC"),
    field("version", "SEMANTIC"),
]);
const StudyHardwareEntryShape = declareShape("study.hardware_entry", [
    field("name", "SEMANTIC"),
    field("value", "SEMANTIC"),
]);
const StudyEnvironmentShape = declareShape("study.environment", [
    field("operating_system", "SEMANTIC"),
    field("architecture", "SEMANTIC"),
    field("python_version", "SEMANTIC"),
    field("node_version", "SEMANTIC"),
    field("packages", "SEMANTIC", arrayOf(objectOf(StudyPackageShape))),
    field("hardware", "SEMANTIC", arrayOf(objectOf(StudyHardwareEntryShape))),
]);
const PlannedBaselineShape = declareShape("study.planned_baseline", [
    field("baseline_ref", "SEMANTIC"),
    field("source_class", "SEMANTIC"),
    // Prose for a reader about why this baseline was chosen. It does not change
    // what is compared.
    field("note", "RECORD_ONLY"),
]);
const CandidateWorkflowShape = declareShape("study.candidate_workflow", [
    field("name", "RECORD_ONLY"),
    field("workload_ref", "SEMANTIC"),
    field("rationale", "RECORD_ONLY"),
]);
const ResourceLimitsShape = declareShape("study.resource_limits", [
    field("max_runtime", "SEMANTIC"),
    field("max_memory_bytes", "SEMANTIC"),
    field("max_credits", "SEMANTIC"),
]);
/**
 * Whether the run was cancelled, and why.
 *
 * `RECEIPT_ONLY`: a cancellation is the server reporting what happened to this
 * execution, not a statement about the science the capsule describes. Two
 * capsules with identical inputs, one cancelled, describe the same intended
 * computation and take the same semantic digest -- and different record and
 * receipt digests, which is where the difference belongs.
 */
const CancellationShape = declareShape("study.cancellation", [
    field("cancelled", "RECEIPT_ONLY"),
    field("reason", "RECEIPT_ONLY"),
]);
const ResultRowShape = (name) => declareShape(name, [field("label", "RECORD_ONLY"), field("node_hash", "SEMANTIC")]);
const FigureShape = declareShape("study.figure", [
    field("label", "RECORD_ONLY"),
    // The rendered SVG is presentation. Two packages whose figures differ only in
    // how a chart was drawn report the same science; the numbers behind the chart
    // are in the nodes, which are semantic.
    field("svg", "RECORD_ONLY"),
]);
const ClaimEvidenceEntryShape = declareShape("study.claim_evidence_entry", [
    field("claim_node_hash", "SEMANTIC"),
    field("evidence_node_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("edge_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
]);
/**
 * The two header components every record repeats, and its own digest.
 *
 * `DERIVED` in all three cases, for two different reasons that land in one
 * place. `schema_version` and `hash_rules_id` are already committed to by the
 * preimage header, so putting them in the body too would state them twice and
 * let the two statements disagree. A record's own hash cannot be an input to
 * itself.
 */
const derivedHeaderFields = (selfHashField) => [
    field("schema_version", "DERIVED"),
    field("hash_rules_id", "DERIVED"),
    field(selfHashField, "DERIVED"),
];
const StudyShapeDecl = declareShape("study", [
    ...derivedHeaderFields("content_hash"),
    // The creation core: what was asked, in whose words, on whose behalf, and
    // whether it is a demonstration. These four are what a `study` *is*, and they
    // are what its `content_hash` -- a semantic digest, see the self-hash purpose
    // table below -- is taken over.
    //
    // `title` and `project_ref` are semantic rather than presentation, which is
    // the one place this family departs from "a structural reference says where a
    // record sits". They are load-bearing as identity: five other record kinds
    // carry a `study_ref` pointing here, so two studies this digest could not tell
    // apart would share one event trail, and `appendStudyEvent` would accept one
    // study's event onto the other. Renaming a study does make a different record,
    // which is what the retired rules said too.
    field("study_type", "SEMANTIC"),
    field("title", "SEMANTIC"),
    field("project_ref", "SEMANTIC"),
    field("is_demo", "SEMANTIC"),
    // Denormalized lifecycle state, and denormalized pointers at the newest
    // revisions. All three are projections of the event trail and the revision
    // chain, and all three move without the study itself changing.
    field("status", "RECORD_ONLY"),
    field("latest_specification", "RECORD_ONLY", objectOf(RevisionRefShape)),
    field("latest_plan", "RECORD_ONLY", objectOf(RevisionRefShape)),
    field("created_at", "RECEIPT_ONLY"),
]);
const StudyEventShapeDecl = declareShape("study_event", [
    ...derivedHeaderFields("content_hash"),
    field("study_ref", "RECEIPT_ONLY"),
    // The audit chain itself: who did what, in what order, after which event.
    field("sequence", "RECEIPT_ONLY"),
    field("previous_event_hash", "RECEIPT_ONLY"),
    field("from_status", "RECEIPT_ONLY"),
    field("to_status", "RECEIPT_ONLY"),
    field("actor", "RECEIPT_ONLY"),
    field("reason", "RECEIPT_ONLY"),
    field("plan_ref", "RECEIPT_ONLY", objectOf(RevisionRefShape)),
    field("created_at", "RECEIPT_ONLY"),
]);
const ProblemSpecificationShapeDecl = declareShape("problem_specification", [
    ...derivedHeaderFields("content_hash"),
    field("study_ref", "RECORD_ONLY"),
    field("revision", "RECORD_ONLY"),
    field("supersedes", "RECORD_ONLY"),
    field("objective", "SEMANTIC", objectOf(TextFieldShape)),
    field("success_criteria", "SEMANTIC", arrayOf(objectOf(TextFieldShape))),
    field("accuracy_requirement", "SEMANTIC", objectOf(QuantityFieldShape)),
    field("runtime_constraint", "SEMANTIC", objectOf(QuantityFieldShape)),
    field("budget_constraint", "SEMANTIC", objectOf(QuantityFieldShape)),
    field("problem_size", "SEMANTIC", objectOf(QuantityFieldShape)),
    field("current_classical_method", "SEMANTIC", objectOf(TextFieldShape)),
    field("why_quantum", "SEMANTIC", objectOf(TextFieldShape)),
    field("open_questions", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("created_at", "RECEIPT_ONLY"),
]);
const StudyPlanShapeDecl = declareShape("study_plan", [
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
    field("data_handling", "SEMANTIC"),
    field("reproducibility_level", "SEMANTIC"),
    field("success_criteria", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("refusal_criteria", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("execution_limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("created_at", "RECEIPT_ONLY"),
]);
const StudyTaskShapeDecl = declareShape("study_task", [
    ...derivedHeaderFields("content_hash"),
    field("study_ref", "RECORD_ONLY"),
    field("kind", "SEMANTIC"),
    field("plan_ref", "SEMANTIC", objectOf(RevisionRefShape)),
    field("capsule_ref", "SEMANTIC"),
    field("status", "RECORD_ONLY"),
    field("created_at", "RECEIPT_ONLY"),
]);
const EvidenceNodeShapeDecl = declareShape("evidence_node", [
    ...derivedHeaderFields("content_hash"),
    field("study_ref", "RECORD_ONLY"),
    field("kind", "SEMANTIC"),
    field("label", "RECORD_ONLY"),
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
]);
const EvidenceEdgeShapeDecl = declareShape("evidence_edge", [
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
]);
const ExecutionCapsuleShapeDecl = declareShape("execution_capsule", [
    ...derivedHeaderFields("reproducibility_hash"),
    field("study_ref", "RECORD_ONLY"),
    field("task_ref", "RECORD_ONLY"),
    // Everything below is a deterministic reproduction condition: change any one
    // and the run is a different run, however similar its output.
    field("manifest_hash", "SEMANTIC"),
    field("versions", "SEMANTIC", objectOf(CapsuleVersionsShape)),
    field("source_hash", "SEMANTIC"),
    field("image_digest", "SEMANTIC"),
    field("dependency_lock_ref", "SEMANTIC"),
    field("seed", "SEMANTIC"),
    field("environment", "SEMANTIC", objectOf(StudyEnvironmentShape)),
    field("resource_limits", "SEMANTIC", objectOf(ResourceLimitsShape)),
    field("input_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("output_hashes", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("execution_class", "SEMANTIC"),
    field("logs_ref", "RECORD_ONLY"),
    field("cancellation", "RECEIPT_ONLY", objectOf(CancellationShape)),
    // What this family claims about the capsule, which is deliberately little:
    // `hash_only` establishes that the bytes are the bytes, and nothing about who
    // produced them or whether they are correct.
    field("attestation_level", "RECORD_ONLY"),
    field("started_at", "RECEIPT_ONLY"),
    field("finished_at", "RECEIPT_ONLY"),
    field("created_at", "RECEIPT_ONLY"),
]);
const ResearchPackageShapeDecl = declareShape("research_package", [
    ...derivedHeaderFields("reproducibility_hash"),
    field("package_kind", "SEMANTIC"),
    field("study_ref", "RECORD_ONLY"),
    field("plan_ref", "SEMANTIC", objectOf(RevisionRefShape)),
    // The written report and the CSV rendering are presentation over the nodes:
    // two packages whose prose differs and whose evidence graph does not report
    // the same science.
    field("report_markdown", "RECORD_ONLY"),
    field("methods", "RECORD_ONLY"),
    field("csv", "RECORD_ONLY"),
    field("figures", "RECORD_ONLY", arrayOf(objectOf(FigureShape))),
    field("assumption_rows", "SEMANTIC", arrayOf(objectOf(ResultRowShape("study.assumption_row")))),
    field("result_rows", "SEMANTIC", arrayOf(objectOf(ResultRowShape("study.result_row")))),
    field("references", "SEMANTIC", arrayOf(objectOf(CitationShape))),
    field("bundle_refs", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("environment", "SEMANTIC", objectOf(StudyEnvironmentShape)),
    field("reproduction_command", "SEMANTIC"),
    field("nodes", "SEMANTIC", arrayOf(objectOf(EvidenceNodeShapeDecl))),
    field("edges", "SEMANTIC", arrayOf(objectOf(EvidenceEdgeShapeDecl))),
    field("claim_evidence_map", "SEMANTIC", arrayOf(objectOf(ClaimEvidenceEntryShape))),
    field("limitations", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("failed_checks", "SEMANTIC", arrayOf({ kind: "leaf" })),
    field("is_demo", "SEMANTIC"),
    field("created_at", "RECEIPT_ONLY"),
]);
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
 * | `study` | `content_hash` | `semantic` | `status`, `latest_specification` and `latest_plan` are projections of the event trail and move without the study changing |
 * | `study_event` | `content_hash` | `record` | immutable; every field is audit evidence, so `semantic` reads none of them and refuses |
 * | `problem_specification` | `content_hash` | `record` | immutable; `revision` and `supersedes` are the chain and must be covered |
 * | `study_plan` | `content_hash` | `record` | immutable; a confirmation authorises one revision, and "was this edited after it was written" is literally the question `verifyPlanConfirmation` asks |
 * | `study_task` | `content_hash` | `semantic` | the execution system overwrites `status` as the job moves |
 * | `evidence_node` | `content_hash` | `record` | immutable; identity in the graph, so a relabelled node is a different node |
 * | `evidence_edge` | `content_hash` | `record` | immutable, same reason |
 * | `execution_capsule` | `reproducibility_hash` | `record` | written once per run and never edited; `verifyExecutionCapsule` reports "unedited", which is the record question |
 * | `research_package` | `reproducibility_hash` | `record` | shipped as a file; `verifyResearchPackage` reports "the file was not edited after it was written" |
 *
 * Two consequences worth stating, because both were previously answered by one
 * digest doing two jobs.
 *
 * A `study` and a `study_task` still have a record digest -- it is just not
 * their identity. `recordHash("study", study)` answers "was this row edited",
 * including its status; the `content_hash` deliberately does not, so that five
 * other record kinds can point at a study that is still moving.
 *
 * An `execution_capsule` and a `research_package` still have a semantic digest,
 * and it is the one a reproduction comparison wants: `semanticHash` over two
 * capsules asks whether they describe the same intended computation, ignoring
 * when they ran and whether one was cancelled. Their `reproducibility_hash`
 * cannot answer that and does not claim to -- it answers whether the file in
 * front of the reader is the file that was written.
 */
export const STUDY_RECORD_KINDS = Object.freeze([
    Object.freeze({
        record_kind: "study",
        shape: StudyShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "semantic",
    }),
    Object.freeze({
        record_kind: "study_event",
        shape: StudyEventShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "problem_specification",
        shape: ProblemSpecificationShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "study_plan",
        shape: StudyPlanShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "study_task",
        shape: StudyTaskShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "semantic",
    }),
    Object.freeze({
        record_kind: "evidence_node",
        shape: EvidenceNodeShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "evidence_edge",
        shape: EvidenceEdgeShapeDecl,
        self_hash_field: "content_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "execution_capsule",
        shape: ExecutionCapsuleShapeDecl,
        self_hash_field: "reproducibility_hash",
        self_hash_purpose: "record",
    }),
    Object.freeze({
        record_kind: "research_package",
        shape: ResearchPackageShapeDecl,
        self_hash_field: "reproducibility_hash",
        self_hash_purpose: "record",
    }),
]);
/** The working lookup, module-private and built from the frozen tuple. */
const kindsByName = new Map(STUDY_RECORD_KINDS.map((entry) => [entry.record_kind, entry]));
/** The record kind names, as immutable plain data. */
export const STUDY_RECORD_KIND_NAMES = Object.freeze(STUDY_RECORD_KINDS.map((entry) => entry.record_kind));
/**
 * The entry for a record kind, or a refusal.
 *
 * A `Map` rather than an object literal, because an object literal answers to
 * every name on `Object.prototype`: a record kind of `"toString"` once resolved
 * to `Function.prototype.toString` and was handed on as a rule set, so the
 * digest layer threw a `TypeError` where a refusal belonged.
 */
export function studyRecordKind(recordKind) {
    const entry = kindsByName.get(recordKind);
    if (entry === undefined) {
        refuse("UNKNOWN_RECORD_KIND", `this build does not know the record kind ${JSON.stringify(recordKind)}. Known kinds: ` +
            `${STUDY_RECORD_KIND_NAMES.join(", ")}. A record kind is a preimage header component, so an unknown one ` +
            "is a digest namespace nobody declared rather than a record to hash under a guess.");
    }
    return entry;
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
export function flattenShapeClasses(shape) {
    const out = new Map();
    const visit = (current, prefix, seen) => {
        // A shape that contained itself would not terminate here. No shape in this
        // family does; the guard makes that a fact about the code rather than about
        // the current tables.
        if (seen.has(current))
            return;
        const nested = new Set(seen).add(current);
        for (const declaration of current.fields) {
            const path = prefix === "" ? declaration.name : `${prefix}.${declaration.name}`;
            out.set(path, declaration.field_class);
            let value = declaration.value;
            while (value.kind === "array")
                value = value.item;
            if (value.kind === "object")
                visit(value.shape, path, nested);
        }
    };
    visit(shape, "", new Set());
    return out;
}
/**
 * Every Zod object field of a record schema, flattened the same way.
 *
 * Walking the schema is what makes the classification checkable: the schema is
 * where a field is actually added, so a field added there and nowhere else is
 * exactly the silent omission a projection would otherwise hide. The wrappers
 * are unwrapped rather than special-cased at each call, because a field's class
 * does not depend on whether it is optional.
 */
export function flattenSchemaFields(schema) {
    const out = [];
    const visit = (current, prefix, depth) => {
        const inner = unwrapSchema(current);
        const def = inner._def;
        if (def.typeName === "ZodArray" && def.type !== undefined) {
            visit(def.type, prefix, depth + 1);
            return;
        }
        if (def.typeName !== "ZodObject" || def.shape === undefined)
            return;
        if (depth > 16) {
            throw new Error(`Schema walk exceeded 16 levels at ${prefix}; a schema in this family cycles.`);
        }
        for (const [name, child] of Object.entries(def.shape())) {
            const path = prefix === "" ? name : `${prefix}.${name}`;
            out.push(path);
            visit(child, path, depth + 1);
        }
    };
    visit(schema, "", 0);
    return Object.freeze(out);
}
/**
 * Strip the wrappers that do not change which fields a schema declares.
 *
 * `ZodEffects` is the one that matters: this family's `Quantity` is an object
 * behind a `superRefine`, so a walk that did not unwrap it would find no fields
 * at all and the completeness test would pass by finding nothing -- which is the
 * precise way a completeness test goes vacuous.
 */
function unwrapSchema(schema) {
    let current = schema;
    for (let step = 0; step < 32; step += 1) {
        const def = current._def;
        if (def.typeName === "ZodEffects" && def.schema !== undefined) {
            current = def.schema;
            continue;
        }
        if ((def.typeName === "ZodOptional" ||
            def.typeName === "ZodNullable" ||
            def.typeName === "ZodDefault" ||
            def.typeName === "ZodReadonly" ||
            def.typeName === "ZodBranded" ||
            def.typeName === "ZodCatch") &&
            def.innerType !== undefined) {
            current = def.innerType;
            continue;
        }
        if (def.typeName === "ZodLazy" && def.getter !== undefined) {
            current = def.getter();
            continue;
        }
        return current;
    }
    throw new Error("Schema unwrapping did not terminate after 32 steps.");
}
//# sourceMappingURL=registry.js.map