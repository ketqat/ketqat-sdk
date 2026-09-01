import { studySelfHash } from "./hash.js";
import { studyNotHashableRefusal } from "./refusals.js";
/**
 * The four-way agreement, or the first disagreement.
 *
 * Returns null when a revision may proceed. `latestRevision` is optional in the
 * sense that a caller may not know it; passing `undefined` or `null` skips (4)
 * and the contract says so rather than implying the check happened.
 */
export function studyRevisionRefusal(recordKind, subject, current, assertedHash, latestRevision) {
    let recomputed;
    try {
        recomputed = studySelfHash(recordKind, current);
    }
    catch (error) {
        // A record that cannot be canonicalized has no digest to compare against, so
        // there is nothing to say about the other three statements. Anything that is
        // not a hashing refusal is a bug here rather than a finding about the
        // record, and `studyNotHashableRefusal` rethrows it rather than reporting
        // the record as the problem.
        return studyNotHashableRefusal(subject, error);
    }
    if (recomputed !== current.content_hash) {
        return {
            subject,
            code: "REVISION_BASE_EDITED",
            message: `The record claims hash ${current.content_hash} and its own contents canonicalize to ${recomputed}. ` +
                "It was edited after it was written, so a revision of it would name a predecessor that never existed in " +
                "the form it is being revised from.",
        };
    }
    if (assertedHash !== current.content_hash) {
        return {
            subject,
            code: "REVISION_BASE_MISMATCH",
            message: `The caller is revising ${assertedHash}, and the record in hand is ${current.content_hash}. One of the ` +
                "two is a stale read; writing the asserted hash into supersedes would make the chain point at whichever " +
                "the caller believed rather than at what was revised.",
        };
    }
    if (latestRevision != null && latestRevision.revision_hash !== current.content_hash) {
        return {
            subject,
            code: "REVISION_BRANCH_DETECTED",
            message: `Revision ${latestRevision.revision} (${latestRevision.revision_hash}) is the newest the store knows, ` +
                `and this is revision ${current.revision} (${current.content_hash}). Revising it now produces a second ` +
                `revision ${current.revision + 1} from the same predecessor, and both branches verify.`,
        };
    }
    return null;
}
//# sourceMappingURL=revision.js.map