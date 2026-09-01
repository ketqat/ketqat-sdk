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
  readonly name: string
  /** The record kinds it constrains. */
  readonly record_kinds: readonly string[]
  /** The fields whose combination the store must keep unique, or compare and set on. */
  readonly key: readonly string[]
  /** `unique` is an index; `compare_and_set` is an optimistic-concurrency predicate on write. */
  readonly kind: "unique" | "compare_and_set"
  /** What this SDK verifies from the records in hand. */
  readonly sdk_checks: string
  /** What no amount of checking in this SDK can establish, and the store therefore owes. */
  readonly persistence_must: string
  /** What exists if the store does not, stated as the reader would encounter it. */
  readonly if_violated: string
}

export const STUDY_PERSISTENCE_INVARIANTS: readonly StudyPersistenceInvariant[] = Object.freeze([
  Object.freeze({
    name: "study_id_unique",
    record_kinds: Object.freeze(["study"]),
    key: Object.freeze(["study_id"]),
    kind: "unique" as const,
    sdk_checks:
      "that a study id is a lowercase version 4 UUID and that a record carrying one is shaped like a study. It " +
      "cannot know whether some other row already has that id.",
    persistence_must:
      "keep study_id unique across every study, and generate it once with newStudyId rather than deriving it " +
      "from anything about the study.",
    if_violated:
      "two studies share an id, so every study_ref in the graph resolves to both of them and neither can be " +
      "shown to be the one a plan was written against.",
  }),
  Object.freeze({
    name: "study_event_sequence_unique",
    record_kinds: Object.freeze(["study_event"]),
    key: Object.freeze(["study_ref", "sequence"]),
    kind: "unique" as const,
    sdk_checks:
      "that the trail it was handed numbers itself 1..n in order, that each event names the hash of the one " +
      "before it, and that every event in it belongs to the same study.",
    persistence_must:
      "hold a unique index on (study_ref, sequence). Two events written at one sequence are two trails, and each " +
      "one verifies on its own.",
    if_violated:
      "two internally consistent histories exist for one study, and a reader handed either is told it is intact. " +
      "Which one the store returns decides what the study is recorded as having done.",
  }),
  Object.freeze({
    name: "study_event_head_compare_and_set",
    record_kinds: Object.freeze(["study_event"]),
    key: Object.freeze(["study_ref", "previous_event_hash"]),
    kind: "compare_and_set" as const,
    sdk_checks:
      "that the trail ends at the head the caller passed to appendStudyEvent, which is required rather than " +
      "optional precisely so a stale read is refused before an event is built on it.",
    persistence_must:
      "make the insert conditional on the stored head still being previous_event_hash, and fail the write rather " +
      "than resolving it, when it is not. The check the SDK makes is against the caller's copy of the trail; " +
      "between that check and the write, another writer may have appended.",
    if_violated:
      "two events claim the same predecessor. The chain each one forms is valid, so nothing downstream can tell " +
      "that the history forked.",
  }),
  Object.freeze({
    name: "study_revision_unique",
    record_kinds: Object.freeze(["problem_specification", "study_plan"]),
    key: Object.freeze(["study_ref", "revision"]),
    kind: "unique" as const,
    sdk_checks:
      "that revision n+1 names revision n in supersedes, that the record it was built from hashes to the hash " +
      "written on it, and that the caller's asserted hash is that same hash.",
    persistence_must:
      "hold a unique index on (study_ref, revision) per record kind. Two revision 3s of one plan are two " +
      "branches, and a confirmation of either verifies.",
    if_violated:
      "a confirmation names a revision 3 that exists twice, so what was approved and what runs can differ while " +
      "every hash comparison passes.",
  }),
  Object.freeze({
    name: "study_revision_compare_and_set",
    record_kinds: Object.freeze(["problem_specification", "study_plan"]),
    key: Object.freeze(["study_ref", "supersedes"]),
    kind: "compare_and_set" as const,
    sdk_checks:
      "that the latest revision the caller supplied is the record being revised, when the caller supplies one. " +
      "Without it the SDK can only see that the record in hand is intact, not that it is still the newest.",
    persistence_must:
      "make the insert conditional on the stored latest revision still being the one named in supersedes. This " +
      "is the branching case: two callers reading revision 2 at the same moment both produce a well-formed " +
      "revision 3.",
    if_violated:
      "the plan a user confirmed and the plan a task was authorised against are two different revision 3s, and " +
      "verifyPlanConfirmation reports both intact because each one is.",
  }),
  Object.freeze({
    name: "confirmation_receipt_idempotency_unique",
    record_kinds: Object.freeze(["confirmation_receipt"]),
    key: Object.freeze(["tenant_id", "idempotency_key"]),
    kind: "unique" as const,
    sdk_checks:
      "that a receipt is internally consistent, that it names a plan revision that hashes to its own contents, " +
      "and that it has not expired. It cannot know whether a receipt with this idempotency key already exists.",
    persistence_must:
      "hold a unique index on (tenant_id, idempotency_key) and return the existing receipt rather than writing a " +
      "second one. An idempotency key is the client's statement that a retry is the same request; without the " +
      "index the statement has no effect, and a retried confirmation is a second authorization nobody made.",
    if_violated:
      "one act of confirming produces two receipts. Each one authorises a run, so a network retry doubles what " +
      "the actor agreed to spend, and both runs verify against the same plan.",
  }),
  Object.freeze({
    name: "confirmation_receipt_plan_compare_and_set",
    record_kinds: Object.freeze(["confirmation_receipt"]),
    key: Object.freeze(["study_ref", "plan_ref"]),
    kind: "compare_and_set" as const,
    sdk_checks:
      "that the latest plan revision the caller supplied is the revision the receipt names -- and it requires " +
      "that argument rather than accepting its absence, because a receipt built against a plan somebody may have " +
      "revised is the failure the record exists to prevent.",
    persistence_must:
      "re-read the latest plan revision and insert the receipt in one transaction, conditional on the stored " +
      "latest revision still being the one named in plan_ref. The SDK compares what the caller read a moment " +
      "ago; the window between that read and the write is the store's to close.",
    if_violated:
      "the receipt authorises a revision that was superseded between the summary being rendered and the " +
      "confirmation being stored, so the actor approved one plan and the run executes another -- and every hash " +
      "in the chain verifies, because each record is internally intact.",
  }),
  Object.freeze({
    name: "task_outcome_unique",
    record_kinds: Object.freeze(["task_outcome"]),
    key: Object.freeze(["authorization_ref"]),
    kind: "unique" as const,
    sdk_checks:
      "that an outcome names an authorization that hashes to its own contents and a capsule that answers that " +
      "same authorization. It cannot know whether another outcome already closed it.",
    persistence_must:
      "hold a unique index on authorization_ref. One piece of authorised work ends once, and the split in " +
      "task.ts is what makes that expressible: retries are attempts on the job, not second outcomes.",
    if_violated:
      "one authorization has two terminal answers -- succeeded and failed -- and both verify. Which one a reader " +
      "is shown decides whether the study reports a number or a refusal.",
  }),
])

/** The invariant names, as immutable plain data. */
export const STUDY_PERSISTENCE_INVARIANT_NAMES: readonly string[] = Object.freeze(
  STUDY_PERSISTENCE_INVARIANTS.map((invariant) => invariant.name),
)
