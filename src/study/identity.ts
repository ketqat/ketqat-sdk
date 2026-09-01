import { randomUUID } from "node:crypto"
import { z } from "zod"

/**
 * Stable opaque identity for the aggregates this family references (goal §5).
 *
 * A `Study` used to be content-addressed, and every other record pointed at it
 * by digest. That reading is inconsistent for an aggregate in a way that shows
 * up the first time anybody uses it: renaming a study changed its identity, and
 * changing its status did not. Both are edits to a row nobody thinks of as a
 * new study, and one of them silently invalidated every `study_ref` in the
 * graph -- five record kinds carry one -- while the other silently did not.
 *
 * So identity here is an id that is **generated once and never derived from
 * content**. Nothing about the study can change it, which is the property
 * `study_ref` needs: a reference survives a rename because a rename is not a
 * new study. Content addressing keeps the job it is good at -- specification,
 * plan and report revisions are immutable records, and there the digest *is*
 * the identity, because a changed revision is a different revision.
 *
 * **UUIDv4 rather than a time-sortable id, deliberately.** A ULID or a UUIDv7
 * carries its creation timestamp in its leading bits, and this id is copied
 * into every evidence node, edge, capsule and package the study produces. A
 * timestamp is `RECEIPT_ONLY` in this family -- it belongs in the receipt
 * preimage, where "did this server observe this, in this order" is the question
 * -- and an identifier that smuggles one into the semantic projection of nine
 * record kinds would put it in the digest that answers "is this the same
 * science". Random bits say nothing about when, which is what an opaque id is
 * supposed to say.
 *
 * **One spelling per id.** The pattern below admits lowercase canonical form
 * only, for the reason `values.ts` gives about numbers: two spellings of one
 * value are two digests for one record, and `study_id` is `SEMANTIC`. An
 * uppercased UUID is the same identifier to a person and a different record to
 * a hash, so it is refused where it is written rather than normalized where it
 * is read -- normalizing would mean the bytes on disk and the bytes hashed were
 * two different things.
 */

/**
 * RFC 4122 version 4, variant 1, lowercase.
 *
 * The version and variant nibbles are pinned rather than left as free hex
 * because this is the one place the format is checked: a caller that generated
 * an id some other way should find out here, not when two systems disagree
 * about whether `study_ref` is a hash, a slug or a uuid. Written as one
 * expression `zod-to-json-schema` can emit as a `pattern`, so the Python
 * validator applies the same rule against the same generated schema -- the
 * split-rule failure `values.ts` records is available here too.
 */
const OPAQUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const OPAQUE_ID_MESSAGE =
  "An immutable ref is a lowercase RFC 4122 version 4 UUID: eight hex digits, three groups of four with the " +
  "version and variant nibbles pinned, then twelve. Not a content hash, which moves when the record is edited, " +
  "and not a display slug, which moves when somebody renames it. Uppercase is refused rather than folded: two " +
  "spellings of one id are two digests for one record."

export function isStudyOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value)
}

/**
 * The identity of a `Study` aggregate.
 *
 * Every `study_ref` in the family is one of these. It is `SEMANTIC` on the
 * study itself -- it is what the study *is* -- and `RECORD_ONLY` on the records
 * that carry it as placement, because which study a plan belongs to says where
 * the plan sits rather than what it proposes.
 */
export const StudyIdSchema = z.string().regex(OPAQUE_ID, { message: OPAQUE_ID_MESSAGE })

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
export const ProjectRefSchema = z.string().regex(OPAQUE_ID, { message: OPAQUE_ID_MESSAGE })

/**
 * Mint a new study id.
 *
 * The only sanctioned way one is made, so that "never derived from content" is
 * a fact about the code rather than a convention: there is no overload taking a
 * seed, a title or a digest, because an id derived from any of those would move
 * when they did and would stop being an identity.
 */
export function newStudyId(): string {
  return randomUUID()
}

/**
 * An identifier issued by the identity provider rather than by this system.
 *
 * An OIDC `sub`, a tenant id and an OAuth client id are all opaque strings
 * somebody else mints, so this family cannot pin their format the way it pins a
 * `study_id` -- a provider that issues `auth0|6512ab` is not wrong, and refusing
 * it would refuse the only identifier the receipt has for the person who
 * confirmed.
 *
 * What it can pin is that the value is a single printable ASCII token. No
 * whitespace, no control characters, no newline: those are the characters that
 * make one identifier look like two in a log, that make two spellings of one
 * value possible through trailing space, and that would have to be normalized
 * somewhere -- and normalizing would mean the bytes on disk and the bytes
 * hashed were two different things. The bound is 255 because an identifier
 * longer than that is a payload.
 *
 * Deliberately **not** the same contract as the event trail's `actor`, which is
 * a free display string. A subject id is what the identity provider
 * authenticated; an actor is what a page shows. Nothing here is signed either
 * way (ADR 0014 §3), and a receipt says so in its own limitations.
 */
const AUTHENTICATED_SUBJECT = /^[\x21-\x7e]{1,255}$/

export const AuthenticatedSubjectSchema = z.string().regex(AUTHENTICATED_SUBJECT, {
  message:
    "An authenticated subject id is one printable ASCII token of 1 to 255 characters: no whitespace, no control " +
    "characters. The format is the identity provider's; what this family requires is that one value has one " +
    "spelling, because two spellings are two digests for one receipt.",
})

export function isAuthenticatedSubject(value: unknown): value is string {
  return typeof value === "string" && AUTHENTICATED_SUBJECT.test(value)
}
