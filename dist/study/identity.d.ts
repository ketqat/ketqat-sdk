import { z } from "zod";
export declare function isStudyOpaqueId(value: unknown): value is string;
/**
 * The identity of a `Study` aggregate.
 *
 * Every `study_ref` in the family is one of these. It is `SEMANTIC` on the
 * study itself -- it is what the study *is* -- and `RECORD_ONLY` on the records
 * that carry it as placement, because which study a plan belongs to says where
 * the plan sits rather than what it proposes.
 */
export declare const StudyIdSchema: z.ZodString;
/**
 * The identity of the project a study belongs to.
 *
 * Was a registry slug, and a slug is a display name: it is chosen for reading,
 * it is edited when an organisation renames itself, and a reference to one
 * keeps resolving after the thing it named has moved. The same contract as a
 * study id, for the same reason, even though this family never mints one --
 * projects are somebody else's aggregate, and all this schema does is refuse a
 * display name where an immutable ref belongs.
 */
export declare const ProjectRefSchema: z.ZodString;
/**
 * Mint a new study id.
 *
 * The only sanctioned way one is made, so that "never derived from content" is
 * a fact about the code rather than a convention: there is no overload taking a
 * seed, a title or a digest, because an id derived from any of those would move
 * when they did and would stop being an identity.
 */
export declare function newStudyId(): string;
export declare const AuthenticatedSubjectSchema: z.ZodString;
export declare function isAuthenticatedSubject(value: unknown): value is string;
//# sourceMappingURL=identity.d.ts.map