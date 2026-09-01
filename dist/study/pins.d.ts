import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
/**
 * What a plan is pinned to, in terms that cannot move under it (goal §10.5).
 *
 * A name and a version are not a pin. `ketqat-engine@0.3.0` is a label a
 * registry resolves, and a registry resolves it to whatever is published under
 * that label today: a republished tarball, a rebuilt image, a retrained model
 * behind an unchanged version string. A study that says "this ran under 0.3.0"
 * and a reproduction that says the same thing can be two different programs, and
 * the digest that would have caught it was never taken because there was
 * nothing to take it over.
 *
 * So a pin carries the immutable identifiers where they exist -- an artifact
 * digest, a source commit, a container digest, a model snapshot, a schema hash,
 * an adapter configuration hash -- beside the name and version a person reads.
 * Which of them are needed before a plan may run is declared as data below
 * rather than decided by whoever writes the runner, because "we thought the
 * version string was enough" is precisely the decision that has to be visible.
 *
 * A missing digest is not a parse error. A plan is drafted before an image is
 * built, and refusing to record the draft would push the work out of the record
 * entirely. It is a question a caller asks -- `versionPinShortfall`, and
 * `planExecutability` over a whole plan -- and the answer names what is missing
 * rather than saying no.
 */
/** The three things a study plan pins. */
export declare const StudyPinRoleSchema: z.ZodEnum<["adapter", "model", "engine"]>;
export type StudyPinRole = z.infer<typeof StudyPinRoleSchema>;
export interface VersionPin {
    package_name: string;
    package_version: string;
    artifact_digest: string | null;
    source_commit: string | null;
    container_digest: string | null;
    model_snapshot_hash: string | null;
    schema_hash: string | null;
    adapter_configuration_hash: string | null;
}
export declare const VersionPinSchema: Contract<VersionPin>;
/** Every component a pin can carry, in declaration order. */
export declare const VERSION_PIN_COMPONENTS: readonly string[];
/**
 * What each role needs before a plan built on it may run.
 *
 * Three lists rather than two, because "required" alone cannot say the thing
 * that actually matters. An engine needs *some* immutable identifier and does
 * not need a particular one: a container digest, a published artifact digest
 * and a source commit each answer "which program", and demanding all three
 * would refuse every plan while demanding none would accept a version string.
 * `immutable_any_of` is that requirement, stated as the disjunction it is.
 *
 * `best_effort` is not a leftover list. It is the statement that a component's
 * absence is *not* a defect for this role -- a model snapshot hash on an engine
 * is meaningless, and recording its absence as a gap would train a reader to
 * ignore gaps.
 */
export interface StudyVersionPinRequirement {
    readonly role: StudyPinRole;
    readonly required: readonly string[];
    readonly immutable_any_of: readonly string[];
    readonly best_effort: readonly string[];
    readonly why: string;
}
export declare const STUDY_VERSION_PIN_REQUIREMENTS: readonly StudyVersionPinRequirement[];
export declare function studyVersionPinRequirement(role: StudyPinRole): StudyVersionPinRequirement;
/**
 * What is missing before a plan pinned this way may run.
 *
 * Two kinds, because they are two different jobs for whoever reads them: a
 * missing required component is a field somebody has to fill in, and an absent
 * immutable identifier is a build that has to happen before there is anything
 * to record.
 */
export interface VersionPinShortfall {
    readonly role: StudyPinRole;
    readonly kind: "MISSING_REQUIRED" | "NO_IMMUTABLE_PIN";
    readonly components: readonly string[];
    readonly message: string;
}
export declare function versionPinShortfall(role: StudyPinRole, pin: VersionPin): readonly VersionPinShortfall[];
//# sourceMappingURL=pins.d.ts.map