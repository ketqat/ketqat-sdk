/**
 * The `study` contract family (ketqat-sdk#259, ADR 0010, ADR 0014, RFC 0008).
 *
 * A new family rather than an extension of the existing contracts: its records
 * hash under their own explicitly named rules, and no field of any
 * already-published record moves to make room for them.
 *
 * Identity is split by what the thing is. A specification, plan or report
 * revision is immutable and content-addressed, because a changed revision is a
 * different revision. A `Study` is an aggregate that moves, so it carries an
 * opaque id minted once and derived from nothing, and every `study_ref` points
 * at that -- a rename is not a new study.
 *
 * Barrel order is dependency order.
 */
export * from "./limits.js";
export * from "./rules.js";
export * from "./jcs.js";
export * from "./values.js";
export * from "./identity.js";
export * from "./projection.js";
export * from "./preimage.js";
export * from "./registry.js";
export * from "./hash.js";
export * from "./file.js";
export * from "./common.js";
export * from "./refusals.js";
export * from "./findings.js";
export * from "./package-limits.js";
export * from "./verification.js";
export * from "./revision.js";
export * from "./persistence.js";
export * from "./units.js";
export * from "./criteria.js";
export * from "./questions.js";
export * from "./policy.js";
export * from "./pins.js";
export * from "./study.js";
export * from "./specification.js";
export * from "./plan.js";
export * from "./receipt.js";
export * from "./artifact.js";
export * from "./capsule.js";
export * from "./task.js";
export * from "./evidence.js";
export * from "./review.js";
export * from "./ledger.js";
export * from "./tables.js";
export * from "./figures.js";
export * from "./report.js";
export * from "./recipe.js";
export * from "./bundles.js";
export * from "./research-package.js";
//# sourceMappingURL=index.js.map