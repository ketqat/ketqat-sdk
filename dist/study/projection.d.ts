import type { JsonValue } from "./jcs.js";
/**
 * The typed canonical projection.
 *
 * A projection reads **declared fields off a parsed record** and builds the
 * canonical body explicitly. It never matches on a key's name, never recurses
 * over keys it has not been told about, and never asks whether an object "looks
 * like" an embedded record.
 *
 * That is the whole of the change. The rule it replaces decided what to leave
 * out by looking at a key's name at every nesting level, and five rounds of
 * probing found five holes in it -- nested `slug`, a nested reference field
 * named `content_hash`, a free-map key chosen by whoever captured an
 * environment, unguarded numbers, `__proto__` -- each one found after the
 * previous fix was green. They were one bug reported five times: a rule that
 * drops keys by name has to be right about every name that can ever appear at
 * every depth, including names an attacker picks. Under a projection those
 * questions do not arise, because a key nobody declared is a key nothing reads.
 *
 * The known cost of an allowlist is the mirror image, and it is real: a new
 * semantic field that nobody classifies stays out of the digest, and two
 * records differing only there share one. That is what the completeness rule in
 * `registry.ts` and `tests/study-field-completeness.test.mjs` exist for. The
 * test walks each Zod schema and fails on any field this file does not
 * classify, in either direction, so a silent omission becomes a failing build
 * rather than a collision nobody sees. Without that test an allowlist is not
 * safer than a denylist -- it is differently unsafe.
 *
 * Composition rule for nested shapes, stated once here and implemented by the
 * two class lists on each purpose below: the *outer* field's class decides
 * whether an embedded object is projected at all, and once it is, its own
 * fields are projected in full apart from `DERIVED` and -- for `semantic` only
 * -- the `RECORD_ONLY` annotations that would make rebuilding an envelope read
 * as new science. Inner classes exist to strip annotation, not to re-ask at
 * every level the question the outer field already answered.
 */
/**
 * The four classes every declared field takes exactly one of.
 *
 * - `SEMANTIC` -- model inputs, assumptions, scenario, reproduction conditions,
 *   and the numbers and claims a record asserts. In the semantic projection.
 * - `RECORD_ONLY` -- presentation and placement: labels, denormalized state,
 *   lifecycle pointers, timestamps, and the structural references that say
 *   where a record sits rather than what it says. In the record projection
 *   only.
 * - `RECEIPT_ONLY` -- audit evidence: actor, subject, sequence, previous
 *   receipt, action, timestamp. In the receipt preimage, and in the record
 *   projection.
 * - `DERIVED` -- values that cannot be inputs to the digest that covers them:
 *   a record's own hash field, and the two header components a record repeats
 *   (`schema_version`, `hash_rules_id`). The header carries the latter two, and
 *   `buildStudyPreimage` refuses a record whose declared values disagree with
 *   the header it is hashed under, so they are covered without being stated
 *   twice.
 */
export declare const STUDY_FIELD_CLASSES: readonly ["SEMANTIC", "RECORD_ONLY", "RECEIPT_ONLY", "DERIVED"];
export type StudyFieldClass = (typeof STUDY_FIELD_CLASSES)[number];
/**
 * What a digest is being taken for.
 *
 * `artifact` reads no fields at all: it is taken over literal bytes and has no
 * projection. It is a member here because it is a header component, and a
 * header component drawn from a different list than the one the code branches
 * on is how two purposes end up sharing a namespace.
 */
export declare const STUDY_HASH_PURPOSES: readonly ["semantic", "record", "receipt", "artifact"];
export type StudyHashPurpose = (typeof STUDY_HASH_PURPOSES)[number];
/**
 * Which classes each purpose reads, as immutable plain data.
 *
 * Two lists per purpose, because a field's class answers two different
 * questions at two different depths, and conflating them cost a digest.
 *
 * `classes` selects **top-level** fields: which of the record's own fields this
 * digest is taken over. `record` reads everything except `DERIVED`, which is
 * what "the record as written" means once the fields that cannot be inputs to
 * themselves are set aside; `semantic` and `receipt` each read one class, which
 * is what makes them answer one question apiece.
 *
 * `nested_classes` filters **inside a value that has already been selected**,
 * and the rule is different: once a field participates in a digest, its value
 * participates in full. The only things stripped below the top level are
 * `DERIVED`, which can never be an input to a digest that covers it, and -- for
 * `semantic` alone -- `RECORD_ONLY`, which is the annotation on an envelope
 * rather than the measurement inside it. A `Quantity`'s `created_at` moves
 * whenever an envelope is rebuilt around the same number, and a semantic digest
 * that read it would report new science every time a record was re-serialized.
 * That is the whole reason inner classes exist.
 *
 * Applying `classes` at every depth instead was wrong in a way that was
 * invisible until the bodies were read: a `study_event`'s `plan_ref` is
 * `RECEIPT_ONLY` and `RevisionRef`'s own two fields are `SEMANTIC`, so the
 * receipt projection selected the pointer and then dropped everything in it,
 * writing `"plan_ref":{}`. Two events binding a study to two different plan
 * revisions took one receipt digest -- the audit record of *which* plan was
 * adopted did not commit to the plan.
 */
export interface StudyPurposeClasses {
    readonly purpose: StudyHashPurpose;
    readonly classes: readonly StudyFieldClass[];
    readonly nested_classes: readonly StudyFieldClass[];
}
export declare const STUDY_PURPOSE_FIELD_CLASSES: readonly StudyPurposeClasses[];
/** How a declared field's value is projected. */
export type StudyValueShape = {
    readonly kind: "leaf";
} | {
    readonly kind: "object";
    readonly shape: StudyShape;
} | {
    readonly kind: "array";
    readonly item: StudyValueShape;
};
export interface StudyFieldDeclaration {
    readonly name: string;
    readonly field_class: StudyFieldClass;
    readonly value: StudyValueShape;
}
export interface StudyShape {
    readonly name: string;
    readonly fields: readonly StudyFieldDeclaration[];
}
/**
 * A JSON scalar, or an array of them: taken as written.
 *
 * A leaf is never an object and never an array of objects. The completeness
 * test enforces that against the Zod schema, because a leaf declared over an
 * object would be the one place a field could enter the digest without anybody
 * classifying it -- which is the hole this design closes, reopened by
 * shorthand.
 */
export declare function leaf(): StudyValueShape;
export declare function objectOf(shape: StudyShape): StudyValueShape;
export declare function arrayOf(item: StudyValueShape): StudyValueShape;
/**
 * Declare a shape, deeply frozen.
 *
 * Duplicate field names are refused at load: two declarations of one name would
 * mean two classifications of one field, and the completeness test could then
 * pass while the projection read whichever came first.
 */
export declare function declareShape(name: string, fields: readonly StudyFieldDeclaration[]): StudyShape;
/** Shorthand for one declaration, so a shape table reads as a table. */
export declare function field(name: string, fieldClass: StudyFieldClass, value?: StudyValueShape): StudyFieldDeclaration;
/**
 * Build the canonical body for one shape.
 *
 * Only declared names are read, and only fields whose class this purpose reads
 * are read at all. A declared field the record does not carry is omitted rather
 * than written as null: absent and null are different statements in this
 * family, and a projection that turned one into the other would give two
 * different records one digest.
 *
 * The body has a null prototype. `JSON.parse` makes `__proto__` an ordinary own
 * key, but assigning it on a `{}` calls the inherited setter instead of
 * creating a property -- so the key and everything under it would vanish here
 * while Python, which has no such setter, hashed it. One payload, two answers.
 * A key named `__proto__` cannot in fact reach this body, because it is not a
 * declared field name anywhere in the family; the null prototype is what makes
 * that a fact about the code rather than a fact about the current field lists.
 */
export declare function projectStudyShape(shape: StudyShape, record: object, purpose: StudyHashPurpose, path?: string): JsonValue;
/** The declared field names of a shape, as immutable plain data. */
export declare function declaredFieldNames(shape: StudyShape): readonly string[];
/**
 * The classes a purpose reads at the top level, as immutable plain data rather
 * than a Set.
 */
export declare function fieldClassesForPurpose(purpose: StudyHashPurpose): readonly StudyFieldClass[];
/** The classes a purpose reads inside a value it has already selected. */
export declare function nestedFieldClassesForPurpose(purpose: StudyHashPurpose): readonly StudyFieldClass[];
//# sourceMappingURL=projection.d.ts.map