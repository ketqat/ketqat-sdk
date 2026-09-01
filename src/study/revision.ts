import type { RevisionRef } from "./common.js"
import { studySelfHash } from "./hash.js"
import { studyNotHashableRefusal, type StudyRefusal } from "./refusals.js"

/**
 * What has to agree before a record is revised (goal §9).
 *
 * `revisePlan` and `reviseSpecification` used to take the caller's
 * `currentHash` and write it into `supersedes` without asking whether it was
 * true. The argument existed for a good reason -- the field on a record is a
 * claim, and the argument is what the caller actually checked -- but taking a
 * claim and never comparing it to anything gives you the worst of both: the
 * chain points wherever the caller said, and nothing notices when that is
 * somewhere else.
 *
 * There are four statements in play, and a revision is safe only when all four
 * are the same string:
 *
 * 1. the hash written on the current record;
 * 2. the hash its own contents canonicalize to;
 * 3. the hash the caller asserts it is revising;
 * 4. the newest revision the store knows about, where the caller supplies it.
 *
 * Each disagreement is a different accident with a different fix, so each is a
 * different code rather than one "revision failed". (1) against (2) is a record
 * edited after it was written -- revising it would carry the edit forward under
 * a `supersedes` pointer claiming it came from something else. (3) against (1)
 * is a caller revising from a stale read, or revising the wrong record
 * entirely. (4) against (1) is the concurrent case: somebody already revised
 * this, and a second revision from the same base is a branch.
 *
 * They are checked in that order, because an edited record makes the other two
 * questions meaningless -- comparing a caller's assertion against a record that
 * is not what it says it is answers about the wrong thing.
 *
 * **What this cannot see, and the store must.** (4) is only asked when a caller
 * supplies a latest revision, and even then it is a check against what that
 * caller read a moment ago. Two callers reading revision 2 simultaneously both
 * pass every check here and both produce a well-formed revision 3. Closing that
 * needs a compare-and-set at the write, which is the store's; `persistence.ts`
 * names it as `study_revision_compare_and_set` and says what exists if it is
 * missing.
 *
 * Refusals rather than throws, throughout. A study is built out of things that
 * are not known yet, and a caller has to be able to branch on which of the four
 * disagreed without catching an exception to find out.
 */

/** The two fields any revisable record in this family carries. */
export interface StudyRevisableRecord {
  revision: number
  content_hash: string
}

/**
 * The four-way agreement, or the first disagreement.
 *
 * Returns null when a revision may proceed. `latestRevision` is optional in the
 * sense that a caller may not know it; passing `undefined` or `null` skips (4)
 * and the contract says so rather than implying the check happened.
 */
export function studyRevisionRefusal(
  recordKind: string,
  subject: string,
  current: StudyRevisableRecord,
  assertedHash: string,
  latestRevision?: RevisionRef | null,
): StudyRefusal | null {
  let recomputed: string
  try {
    recomputed = studySelfHash(recordKind, current)
  } catch (error) {
    // A record that cannot be canonicalized has no digest to compare against, so
    // there is nothing to say about the other three statements. Anything that is
    // not a hashing refusal is a bug here rather than a finding about the
    // record, and `studyNotHashableRefusal` rethrows it rather than reporting
    // the record as the problem.
    return studyNotHashableRefusal(subject, error)
  }

  if (recomputed !== current.content_hash) {
    return {
      subject,
      code: "REVISION_BASE_EDITED",
      message:
        `The record claims hash ${current.content_hash} and its own contents canonicalize to ${recomputed}. ` +
        "It was edited after it was written, so a revision of it would name a predecessor that never existed in " +
        "the form it is being revised from.",
    }
  }

  if (assertedHash !== current.content_hash) {
    return {
      subject,
      code: "REVISION_BASE_MISMATCH",
      message:
        `The caller is revising ${assertedHash}, and the record in hand is ${current.content_hash}. One of the ` +
        "two is a stale read; writing the asserted hash into supersedes would make the chain point at whichever " +
        "the caller believed rather than at what was revised.",
    }
  }

  if (latestRevision != null && latestRevision.revision_hash !== current.content_hash) {
    return {
      subject,
      code: "REVISION_BRANCH_DETECTED",
      message:
        `Revision ${latestRevision.revision} (${latestRevision.revision_hash}) is the newest the store knows, ` +
        `and this is revision ${current.revision} (${current.content_hash}). Revising it now produces a second ` +
        `revision ${current.revision + 1} from the same predecessor, and both branches verify.`,
    }
  }

  return null
}
