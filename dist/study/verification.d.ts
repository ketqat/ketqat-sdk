import { z } from "zod";
import { type AttestationLevel } from "./common.js";
/**
 * Twelve answers, none of them hidden behind another (goal §13.1).
 *
 * The result this replaces had a `valid: boolean` at the top and three booleans
 * under it, and the top one was the one every caller read. That is not a
 * reporting inconvenience; it is a wrong answer waiting to be given, because
 * the checks underneath are not the same claim in different words. "The file
 * was not edited", "every number resolves to a node", "the bundles it cites
 * recompute", and "somebody else ran it and got the same thing" are four
 * different sentences with four different strengths, and a caller shown one
 * boolean quotes the strongest reading of it.
 *
 * So each level is returned, and a status is *derived* from them rather than
 * standing in for them. The derivation is here, in one function, so that
 * nothing can quietly define its own ladder -- and the levels stay beside it,
 * because a caller rendering only the status is rendering less than they were
 * given rather than something they were told.
 *
 * ### What each level answers, and what it does not
 *
 * | level | answers | does **not** answer |
 * | --- | --- | --- |
 * | `schema_valid` | is this shaped like a research package? | anything about its contents |
 * | `canonicalizable` | can this record be projected and hashed at all? | whether the hash matches |
 * | `hash_matches` | was the file edited after it was written? | who wrote it, or whether it is right |
 * | `record_integrity_valid` | is every embedded record's stated hash its own contents? | that the records are true |
 * | `graph_structurally_valid` | do the nodes and edges join up, under the edge matrix? | that any edge's assertion holds |
 * | `provenance_closed` | does every claim's support terminate in something measured, cited or assumed? | that the terminal evidence is good |
 * | `claims_resolve` | does every number in the report and tables name a node this file carries? | that the number is correct |
 * | `bundles_resolve` | does every cited bundle exist here, of the right kind, hashing as claimed? | that the bundle's science is right |
 * | `science_recomputed` | were the bundles' estimates and decisions rebuilt from their inputs and matched? | that the models are right |
 * | `independent_reproduction_present` | does a reproduction record report a match by a second party? | that the second party was independent |
 * | `review_present` | did a person record a verdict on a node in this package? | that the verdict was competent |
 * | `attestation_level` | what this family claims: `hash_only` | nothing more, ever (ADR 0014) |
 *
 * **A matching hash is never "authentic", "signed" or "scientifically
 * correct".** No key is involved anywhere in this file. Every sentence
 * `notEstablished` returns is there because a surface rendering these levels
 * would otherwise have to invent one.
 */
/**
 * What this implementation actually did, named in the result.
 *
 * The rule the goal states and the reason this field exists: **where an
 * implementation does not recompute the science, its result may not be called
 * reproduction.** The Python verifier validates, hashes and walks structure; it
 * does not rebuild an estimate from a scenario, and ADR 0010 is deliberate that
 * it must not -- a second implementation of the model would disagree with the
 * first at the third decimal place and nobody could say which was right.
 *
 * So Python returns `INTEGRITY_AND_STRUCTURE` and TypeScript returns
 * `INTEGRITY_STRUCTURE_AND_SCIENCE`, and a caller that renders "verified in
 * Python" has the value in front of it saying what that did and did not cover.
 * A shared field is what makes the difference visible; a shared docstring would
 * not have been.
 */
export declare const StudyVerificationPerformedSchema: z.ZodEnum<["INTEGRITY_AND_STRUCTURE", "INTEGRITY_STRUCTURE_AND_SCIENCE"]>;
export type StudyVerificationPerformed = z.infer<typeof StudyVerificationPerformedSchema>;
/**
 * The ladder, derived and never asserted.
 *
 * Each rung is strictly stronger than the one below, which is what makes a
 * single value safe to render *beside* the levels: a reader who takes only the
 * status still takes a claim the levels support. It is not safe to render
 * instead of them, and `notEstablished` is what a surface shows next to it.
 */
export declare const StudyVerificationStatusSchema: z.ZodEnum<["REFUSED", "STRUCTURE_UNVERIFIED", "STRUCTURE_VERIFIED", "SCIENCE_RECOMPUTED", "INDEPENDENTLY_REPRODUCED"]>;
export type StudyVerificationStatus = z.infer<typeof StudyVerificationStatusSchema>;
export interface StudyVerificationLevels {
    schema_valid: boolean;
    canonicalizable: boolean;
    hash_matches: boolean;
    record_integrity_valid: boolean;
    graph_structurally_valid: boolean;
    provenance_closed: boolean;
    claims_resolve: boolean;
    bundles_resolve: boolean;
    science_recomputed: boolean;
    independent_reproduction_present: boolean;
    review_present: boolean;
    attestation_level: AttestationLevel;
}
export declare const StudyVerificationLevelsSchema: z.ZodObject<{
    schema_valid: z.ZodBoolean;
    canonicalizable: z.ZodBoolean;
    hash_matches: z.ZodBoolean;
    record_integrity_valid: z.ZodBoolean;
    graph_structurally_valid: z.ZodBoolean;
    provenance_closed: z.ZodBoolean;
    claims_resolve: z.ZodBoolean;
    bundles_resolve: z.ZodBoolean;
    science_recomputed: z.ZodBoolean;
    /**
     * A reproduction record in this package reports `MATCHED`.
     *
     * Named `_present` rather than `_verified` on purpose. What is checkable
     * from the file is that a record exists, names a node the package carries,
     * and reports a match. Whether the party who ran it was independent of the
     * party who wrote the study is not a property of any file, and a level
     * called `independently_reproduced` would be claiming it.
     */
    independent_reproduction_present: z.ZodBoolean;
    /** A review record in this package records a verdict on a node it carries. */
    review_present: z.ZodBoolean;
    attestation_level: z.ZodEnum<["hash_only"]>;
}, "strict", z.ZodTypeAny, {
    schema_valid: boolean;
    canonicalizable: boolean;
    hash_matches: boolean;
    record_integrity_valid: boolean;
    graph_structurally_valid: boolean;
    provenance_closed: boolean;
    claims_resolve: boolean;
    bundles_resolve: boolean;
    science_recomputed: boolean;
    independent_reproduction_present: boolean;
    review_present: boolean;
    attestation_level: "hash_only";
}, {
    schema_valid: boolean;
    canonicalizable: boolean;
    hash_matches: boolean;
    record_integrity_valid: boolean;
    graph_structurally_valid: boolean;
    provenance_closed: boolean;
    claims_resolve: boolean;
    bundles_resolve: boolean;
    science_recomputed: boolean;
    independent_reproduction_present: boolean;
    review_present: boolean;
    attestation_level: "hash_only";
}>;
/**
 * The status these levels add up to.
 *
 * Order matters and is the whole of the function: a package that cannot be
 * hashed is `REFUSED` before anything else is asked, because every level below
 * would be answering about a record this build cannot address. A package that
 * fails any structural check is `STRUCTURE_UNVERIFIED` whatever else is true --
 * a reproduction record inside a package whose graph does not join up is a
 * statement about a study nobody can read.
 *
 * `review_present` is deliberately not a rung. A review is a person's judgement
 * recorded in the file, and a ladder that climbed on it would be reporting a
 * stronger verification because somebody wrote "ACCEPTED" in a record they also
 * control.
 */
export declare function deriveStudyVerificationStatus(levels: StudyVerificationLevels): StudyVerificationStatus;
/**
 * What this result does not establish, in sentences a surface can render.
 *
 * Returned as data rather than left to a docstring, because the failure this
 * guards against is a rendering: a page that shows a green tick and the word
 * "verified" has said something the levels do not support, and the fix is that
 * the caveats arrive in the same object as the verdict, ordered, and cannot be
 * dropped without the omission being visible in the code that drops them.
 *
 * ADR 0014's wording rule is discharged here for every surface at once: none of
 * these sentences describes a hash match as authentic, signed or scientifically
 * correct, and the first one says so outright.
 */
export declare function notEstablished(levels: StudyVerificationLevels): readonly string[];
/**
 * A levels object where every check failed and nothing was asked.
 *
 * The shape a refusal returns, kept in one place because a refusal path that
 * built it inline would be a twelfth place for a level to be quietly reported
 * as true. `attestation_level` is `hash_only` even here: it is what this family
 * claims about records in general rather than a result of this verification.
 */
export declare function refusedStudyVerificationLevels(): StudyVerificationLevels;
//# sourceMappingURL=verification.d.ts.map