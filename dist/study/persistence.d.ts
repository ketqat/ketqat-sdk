/**
 * What the SDK checks, and what a store has to enforce underneath it (goal
 * §7, §9).
 *
 * Everything in this family is checkable from records somebody hands you: a
 * trail verifies against itself, a revision verifies against its predecessor, a
 * confirmation verifies against the plan it names. None of that can see a
 * record the caller did not hand over, and two of the failures that matter most
 * are exactly that shape -- a second event written at the same sequence, and a
 * second revision branched off the same predecessor. Both produce two histories
 * that each verify perfectly, and neither is visible from either one.
 *
 * So the boundary is written down rather than implied. Each row below names one
 * invariant, what the SDK does check, what the persistence layer must check,
 * and what goes wrong if it does not. A caller reads it to know which
 * constraints their schema owes; a reviewer reads it to see that a claim made
 * in a docstring somewhere has a corresponding index.
 *
 * The pattern is the same one every rule set in this family uses: immutable
 * plain data, never a `Map` or a `Set`, so what a consumer holds is a list they
 * can read and cannot edit.
 */
export interface StudyPersistenceInvariant {
    /** A stable name a migration or a test can refer to. */
    readonly name: string;
    /** The record kinds it constrains. */
    readonly record_kinds: readonly string[];
    /** The fields whose combination the store must keep unique, or compare and set on. */
    readonly key: readonly string[];
    /** `unique` is an index; `compare_and_set` is an optimistic-concurrency predicate on write. */
    readonly kind: "unique" | "compare_and_set";
    /** What this SDK verifies from the records in hand. */
    readonly sdk_checks: string;
    /** What no amount of checking in this SDK can establish, and the store therefore owes. */
    readonly persistence_must: string;
    /** What exists if the store does not, stated as the reader would encounter it. */
    readonly if_violated: string;
}
export declare const STUDY_PERSISTENCE_INVARIANTS: readonly StudyPersistenceInvariant[];
/** The invariant names, as immutable plain data. */
export declare const STUDY_PERSISTENCE_INVARIANT_NAMES: readonly string[];
//# sourceMappingURL=persistence.d.ts.map