import { z } from "zod";
import { ContentHashSchema } from "./common.js";
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
export const StudyPinRoleSchema = z.enum(["adapter", "model", "engine"]);
/**
 * A digest as the container ecosystem writes one: the algorithm, then the hex.
 *
 * Not bare hex, because these strings are copied out of and back into tooling
 * that expects the prefix, and a family that stored them stripped would be
 * converting at every boundary -- which is where one artifact acquires two
 * spellings.
 */
const PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
export const VersionPinSchema = z
    .object({
    /** What a person calls it. Present always: a pin nobody can name is a pin nobody can look up. */
    package_name: z.string().min(1),
    /** What the registry calls this release. A label, and the reason the rest of this object exists. */
    package_version: z.string().min(1),
    /** The digest of the published artifact, where the registry exposes one. */
    artifact_digest: z.string().regex(PREFIXED_DIGEST).nullable(),
    /** The commit the artifact was built from, where the source is public. */
    source_commit: z.string().regex(GIT_COMMIT).nullable(),
    /** The image digest a run would execute, which is what `ExecutionCapsule.image_digest` records afterwards. */
    container_digest: z.string().regex(PREFIXED_DIGEST).nullable(),
    /** Which frozen parameter set a model used. A retrained model under an unchanged version differs only here. */
    model_snapshot_hash: ContentHashSchema.nullable(),
    /** The contract the record was written against, where a component carries its own schema. */
    schema_hash: ContentHashSchema.nullable(),
    /** How a vendor adapter was configured. Two runs of one adapter under two configurations are two runs. */
    adapter_configuration_hash: ContentHashSchema.nullable(),
})
    .strict();
/** Every component a pin can carry, in declaration order. */
export const VERSION_PIN_COMPONENTS = Object.freeze([
    "package_name",
    "package_version",
    "artifact_digest",
    "source_commit",
    "container_digest",
    "model_snapshot_hash",
    "schema_hash",
    "adapter_configuration_hash",
]);
const requirement = (role, required, immutableAnyOf, why) => {
    const named = new Set([...required, ...immutableAnyOf]);
    return Object.freeze({
        role,
        required: Object.freeze([...required]),
        immutable_any_of: Object.freeze([...immutableAnyOf]),
        best_effort: Object.freeze(VERSION_PIN_COMPONENTS.filter((component) => !named.has(component))),
        why,
    });
};
export const STUDY_VERSION_PIN_REQUIREMENTS = Object.freeze([
    requirement("engine", ["package_name", "package_version"], ["container_digest", "artifact_digest", "source_commit"], "the engine is the program that runs, so a reproduction has to be able to fetch the same one"),
    requirement("model", ["package_name", "package_version"], ["model_snapshot_hash", "artifact_digest", "source_commit"], "a model's version string survives a retraining, and its snapshot hash does not"),
    requirement("adapter", ["package_name", "package_version"], ["adapter_configuration_hash", "container_digest", "artifact_digest", "source_commit"], "an adapter's behaviour is its code and its configuration together, so either one pins it"),
]);
const requirementsByRole = new Map(STUDY_VERSION_PIN_REQUIREMENTS.map((entry) => [entry.role, entry]));
// Checked at load rather than asserted in a comment: every role is covered, and
// every component of a pin is classified for it. A component named in no list
// would be one whose absence nothing reports and whose presence nothing counts.
for (const role of StudyPinRoleSchema.options) {
    if (!requirementsByRole.has(role)) {
        throw new Error(`Pin role ${role} has no requirement row, so nothing decides whether a plan may run on it.`);
    }
}
for (const entry of STUDY_VERSION_PIN_REQUIREMENTS) {
    const named = [...entry.required, ...entry.immutable_any_of, ...entry.best_effort];
    if (new Set(named).size !== named.length) {
        throw new Error(`Pin role ${entry.role} classifies a component twice.`);
    }
    if (new Set(named).size !== VERSION_PIN_COMPONENTS.length) {
        throw new Error(`Pin role ${entry.role} classifies ${named.length} components of ${VERSION_PIN_COMPONENTS.length}.`);
    }
    if (entry.immutable_any_of.length === 0) {
        throw new Error(`Pin role ${entry.role} names no immutable identifier, so a version string would pin it.`);
    }
}
export function studyVersionPinRequirement(role) {
    const entry = requirementsByRole.get(role);
    if (entry === undefined) {
        throw new Error(`${JSON.stringify(role)} is not a pin role. Known roles: ${StudyPinRoleSchema.options.join(", ")}.`);
    }
    return entry;
}
const present = (pin, component) => {
    const value = pin[component];
    return typeof value === "string" && value.length > 0;
};
export function versionPinShortfall(role, pin) {
    const entry = studyVersionPinRequirement(role);
    const shortfalls = [];
    const missing = entry.required.filter((component) => !present(pin, component));
    if (missing.length > 0) {
        shortfalls.push(Object.freeze({
            role,
            kind: "MISSING_REQUIRED",
            components: Object.freeze(missing),
            message: `The ${role} pin does not state ${missing.join(", ")}.`,
        }));
    }
    if (!entry.immutable_any_of.some((component) => present(pin, component))) {
        shortfalls.push(Object.freeze({
            role,
            kind: "NO_IMMUTABLE_PIN",
            components: Object.freeze([...entry.immutable_any_of]),
            message: `The ${role} pin carries none of ${entry.immutable_any_of.join(", ")}, so it names a version and not a ` +
                `program: ${entry.why}.`,
        }));
    }
    return Object.freeze(shortfalls);
}
//# sourceMappingURL=pins.js.map