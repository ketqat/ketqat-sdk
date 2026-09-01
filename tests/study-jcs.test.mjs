// RFC 8785 conformance, pinned against the RFC's own published vectors.
//
// The point of adopting a published canonicalization scheme rather than
// maintaining our own is that cross-language byte agreement stops being a
// coincidence between two hand-written canonicalizers and becomes conformance
// to a specification with its own test data. So these vectors come from the RFC
// and not from either implementation: when `src/study/jcs.ts` and
// `python/src/ketqat_runner/study_jcs.py` disagree, at least one of them fails
// here, and the failure names which side is wrong instead of merely reporting
// that the two differ.
//
// `python/tests/test_study_jcs.py` reads the same fixture file and makes the
// same assertions, so the two suites cannot drift apart without one of them
// failing against the spec.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  canonicalizeJcs,
  canonicalizeJcsBytes,
  serializeJcsNumber,
  serializeJcsString,
  StudyHashRefusalError,
} from "../dist/study/index.js"

const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/jcs/rfc8785-vectors.json", import.meta.url), "utf8"),
)

/** An IEEE 754 double from the RFC's 64-bit big-endian hex bit pattern. */
const doubleFromHex = (hex) => Buffer.from(hex, "hex").readDoubleBE(0)

test("RFC 8785 Appendix B: every number serializes as the RFC says", () => {
  const { samples } = vectors.number_serialization
  assert.equal(samples.length, 24, "the RFC's table has 24 serializable rows")
  for (const { ieee754, json, comment } of samples) {
    const value = doubleFromHex(ieee754)
    assert.equal(
      serializeJcsNumber(value),
      json,
      `${ieee754}${comment ? ` (${comment})` : ""} must serialize as ${json}`,
    )
    // And through the canonicalizer, which is the path a digest actually takes.
    assert.equal(canonicalizeJcs(value), json)
  }
})

test("RFC 8785 Appendix B: minus zero serializes as 0, and 3.0 as 3", () => {
  // Called out separately because these two are the reason the RFC cites
  // ECMAScript `Number::toString` rather than "print the number": a
  // canonicalizer that rendered `-0` and `3.0` faithfully would give two
  // spellings to two values that JSON cannot tell apart.
  assert.equal(serializeJcsNumber(-0), "0")
  assert.equal(serializeJcsNumber(0), "0")
  assert.equal(serializeJcsNumber(3.0), "3")
  assert.equal(serializeJcsNumber(4.5), "4.5")
  assert.equal(canonicalizeJcs({ a: -0, b: 3.0 }), '{"a":0,"b":3}')
})

test("RFC 8785 §3.2.2.3: NaN and Infinity terminate canonicalization", () => {
  for (const { ieee754, comment } of vectors.number_serialization.must_terminate) {
    const value = doubleFromHex(ieee754)
    assert.throws(
      () => serializeJcsNumber(value),
      (error) => error instanceof StudyHashRefusalError && error.code === "NON_FINITE_NUMBER",
      `${comment} must terminate with an error rather than serialize`,
    )
  }
  // -Infinity is the third value of the same kind; the RFC's table lists the
  // bit pattern for +Infinity only.
  assert.throws(
    () => canonicalizeJcs({ x: Number.NEGATIVE_INFINITY }),
    (error) => error.code === "NON_FINITE_NUMBER",
  )
})

test("RFC 8785 §3.2.2 and §3.2.3: the primitive sample canonicalizes verbatim", () => {
  const { input_json, expected_canonical } = vectors.primitive_serialization
  assert.equal(canonicalizeJcs(JSON.parse(input_json)), expected_canonical)
})

test("RFC 8785 §3.2.3: property names sort by UTF-16 code unit", () => {
  const { input_json, expected_value_order } = vectors.property_sorting
  const canonical = canonicalizeJcs(JSON.parse(input_json))
  let previous = -1
  for (const value of expected_value_order) {
    const at = canonical.indexOf(JSON.stringify(value))
    assert.ok(at > previous, `${value} must follow the value before it in the canonical form`)
    previous = at
  }
  // The point of the vector: U+1F600 sorts as its high surrogate D83D and so
  // precedes U+FB33. Code-point order -- which is what a Python implementation
  // sorting its native strings produces -- would put U+FB33 first, and nothing
  // else in the suite would notice.
  assert.ok(
    canonical.indexOf('"Emoji: Grinning Face"') <
      canonical.indexOf('"Hebrew Letter Dalet With Dagesh"'),
    "an astral character must sort by its high surrogate, not by its code point",
  )
})

test("RFC 8785 §3.2.2.2: the escape table is the short one", () => {
  assert.equal(serializeJcsString("\b\t\n\f\r"), '"\\b\\t\\n\\f\\r"')
  assert.equal(serializeJcsString("\u0000\u001f"), '"\\u0000\\u001f"')
  assert.equal(serializeJcsString('a"b\\c'), '"a\\"b\\\\c"')
  // Not escaped: the solidus, and everything non-ASCII.
  assert.equal(serializeJcsString("/"), '"/"')
  assert.equal(serializeJcsString("€ö😀"), '"€ö😀"')
  // C1 controls are outside the ASCII control range the RFC names, so they are
  // serialized as themselves.
  assert.equal(serializeJcsString("\u0080\u009f"), '"\u0080\u009f"')
})

test("RFC 8785 §3.2.2.2: a lone surrogate terminates canonicalization", () => {
  for (const bad of ["\ud800", "\udead", "a\ud83db", "\udc00x"]) {
    assert.throws(
      () => serializeJcsString(bad),
      (error) => error instanceof StudyHashRefusalError && error.code === "LONE_SURROGATE",
    )
  }
  // A well-formed pair is a character and is serialized as itself.
  assert.equal(serializeJcsString("😀"), '"😀"')
})

test("RFC 8785 §3.2.4: the sample encodes to the exact bytes the RFC prints", () => {
  // The RFC gives the byte sequence for the §3.2.2 sample, and a digest consumes
  // bytes rather than code units -- an implementation could produce the right
  // characters and the wrong encoding, and only this vector would notice.
  const { input_json, expected_utf8_hex } = vectors.primitive_serialization
  const bytes = canonicalizeJcsBytes(JSON.parse(input_json))
  assert.ok(bytes instanceof Uint8Array)
  assert.equal(Buffer.from(bytes).toString("hex"), expected_utf8_hex)
})

test("RFC 8785 §3.2.4: the canonical form is UTF-8 bytes", () => {
  const bytes = canonicalizeJcsBytes({ "€": "😀" })
  assert.ok(bytes instanceof Uint8Array)
  assert.equal(Buffer.from(bytes).toString("utf8"), '{"€":"😀"}')
  // Three bytes for the euro sign, four for the emoji, plus the punctuation.
  assert.equal(bytes.length, Buffer.byteLength('{"€":"😀"}', "utf8"))
})

test("RFC 8785 §3.1: no Unicode normalization is performed", () => {
  // U+00E9, and U+0065 U+0301. Two different records, and two different digests.
  const composed = "é"
  const decomposed = "é"
  assert.notEqual(canonicalizeJcs({ name: composed }), canonicalizeJcs({ name: decomposed }))
  assert.equal(canonicalizeJcs({ name: composed }), '{"name":"é"}')
  // And as property names, where a normalizing canonicalizer would merge two
  // keys into one and silently drop a value.
  const both = canonicalizeJcs({ [composed]: 1, [decomposed]: 2 })
  assert.ok(both.includes('"é":1'))
  assert.ok(both.includes('"é":2'))
})

test("arrays keep their order; nested objects are sorted recursively", () => {
  // RFC 8785 §3.2.3: array element order MUST NOT be changed, but objects found
  // inside arrays MUST have their properties sorted.
  assert.equal(canonicalizeJcs([3, 1, 2]), "[3,1,2]")
  assert.equal(canonicalizeJcs([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]')
  assert.equal(canonicalizeJcs({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}')
})

test("RFC 8785 §3.2.2.1: the three literals", () => {
  assert.equal(canonicalizeJcs(null), "null")
  assert.equal(canonicalizeJcs(true), "true")
  assert.equal(canonicalizeJcs(false), "false")
  assert.equal(canonicalizeJcs({ a: null }), '{"a":null}')
})
