import { refuse } from "./limits.js";
/**
 * Verifying a file, which is a different job from hashing a value (goal §3.5).
 *
 * Everything else in this core takes a parsed value. This entry point takes
 * **raw bytes**, because the questions it has to answer are questions about
 * bytes and a parse has already thrown the answers away by the time it returns:
 *
 * - **Duplicate keys.** `{"a":1,"a":2}` is syntactically valid JSON and RFC 8259
 *   §4 says only that names SHOULD be unique. Every parser this family meets
 *   resolves the duplicate silently and differently -- JavaScript keeps the
 *   last, some others keep the first -- so one file has two readings and two
 *   digests, and the verifier that reads it second reports a mismatch it cannot
 *   explain. The check must therefore happen **before** the parse: after
 *   `JSON.parse` there is exactly one `a` and no evidence there were ever two.
 *
 * - **A byte order mark.** U+FEFF at the start of a file is not JSON: RFC 8259
 *   §8.1 says implementations MUST NOT add one and MAY ignore one. "May ignore"
 *   is the problem, not the solution -- an ignoring reader and a
 *   non-ignoring reader hash different byte sequences for one file. So a BOM is
 *   **refused**, not stripped. Refusing costs a producer one setting; stripping
 *   would cost a reader the ability to tell whether the file they verified is
 *   the file somebody else verified.
 *
 * - **Invalid UTF-8.** JSON text is UTF-8 (RFC 8259 §8.1). A decoder that
 *   substitutes U+FFFD for a malformed sequence turns two different files into
 *   one string, and hashing the substitution would hash a repair nobody made.
 *   Refused, with the byte offset.
 *
 * - **Unpaired surrogates.** A file may spell one as an escape -- `"\ud800"` is
 *   syntactically valid JSON. It is refused for RFC 8785 §3.2.2.2's reason:
 *   half a character is not a character, JavaScript will hash the escape and
 *   Python cannot encode it as UTF-8 at all, so the file hashes in one language
 *   and crashes the verifier in the other. Refused here rather than at the
 *   canonicalizer so a reader is told which *file* is unusable.
 *
 * **No Unicode normalization is performed.** A file in NFD and the same text in
 * NFC are different bytes and are different records. Normalizing would silently
 * merge two documents a reader can see are different, and would make a digest
 * depend on which normalization library was linked in.
 */
const BOM_UTF8 = Object.freeze([0xef, 0xbb, 0xbf]);
/**
 * Decode, refusing what a lenient decoder would repair.
 *
 * `fatal: true` is the whole of it: the default `TextDecoder` replaces a
 * malformed sequence with U+FFFD, which is a repair rather than a reading.
 */
function decodeStrictUtf8(bytes) {
    try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        refuse("INVALID_UTF8", "the file is not valid UTF-8. JSON text is UTF-8 (RFC 8259 §8.1), and a decoder that substituted U+FFFD " +
            "for the malformed bytes would turn two different files into one string and hash a repair nobody made.");
    }
}
/**
 * Where duplicate keys are found: in the text, by scanning it.
 *
 * A hand-written scanner rather than a reviver hook, because a reviver runs
 * *after* the parser has already resolved the duplicate -- it is handed one
 * value per key and cannot see that there were two. The scanner is a string
 * walk with no recursion into values it does not need: it tracks whether it is
 * inside a string, and at each object level collects the property names it
 * meets.
 *
 * Only structure is tracked, so an object *value* named the same as one in a
 * sibling object is not a duplicate; two names at one level are.
 */
function assertNoDuplicateKeys(text) {
    const stack = [];
    let index = 0;
    const length = text.length;
    const readString = () => {
        // `text[index]` is the opening quote when this is called.
        const start = index;
        index += 1;
        let out = "";
        while (index < length) {
            const char = text[index];
            if (char === "\\") {
                const escape = text[index + 1];
                if (escape === undefined)
                    break;
                if (escape === "u") {
                    const hex = text.slice(index + 2, index + 6);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                        refuse("INVALID_JSON", `a \\u escape at offset ${index} is not four hex digits.`);
                    }
                    out += String.fromCharCode(Number.parseInt(hex, 16));
                    index += 6;
                    continue;
                }
                const simple = {
                    '"': '"',
                    "\\": "\\",
                    "/": "/",
                    b: "\b",
                    f: "\f",
                    n: "\n",
                    r: "\r",
                    t: "\t",
                };
                const decoded = simple[escape];
                if (decoded === undefined) {
                    refuse("INVALID_JSON", `an unknown escape \\${escape} at offset ${index}.`);
                }
                out += decoded;
                index += 2;
                continue;
            }
            if (char === '"') {
                index += 1;
                // Checked here rather than over the raw text, because over the raw text
                // a `\ud800` escape is six ASCII characters and no surrogate at all --
                // the scan would pass and the parser would then produce the lone
                // surrogate anyway. This is the one place the decoded code units and
                // the byte offset are both in hand.
                assertNoUnpairedSurrogates(out, start);
                return out;
            }
            out += char;
            index += 1;
        }
        refuse("INVALID_JSON", "a string is not closed before the end of the file.");
    };
    while (index < length) {
        const char = text[index];
        if (char === '"') {
            const start = index;
            const value = readString();
            const top = stack[stack.length - 1];
            if (top !== undefined && top.kind === "object" && isPropertyName(text, index)) {
                if (top.names.has(value)) {
                    refuse("DUPLICATE_PROPERTY", `the object contains the property ${JSON.stringify(value)} twice, at byte offset ${start}. RFC 8259 ` +
                        "§4 only says names SHOULD be unique, so this file parses -- and parsers disagree about which of " +
                        "the two values wins, which gives one file two readings and two digests. It is refused before the " +
                        "parse, because after the parse there is one property and no evidence there were ever two.");
                }
                top.names.add(value);
            }
            continue;
        }
        if (char === "{") {
            stack.push({ kind: "object", names: new Set() });
            index += 1;
            continue;
        }
        if (char === "[") {
            stack.push({ kind: "array", names: new Set() });
            index += 1;
            continue;
        }
        if (char === "}" || char === "]") {
            stack.pop();
            index += 1;
            continue;
        }
        if (char === "-" || (char >= "0" && char <= "9")) {
            index = checkNumberLiteral(text, index);
            continue;
        }
        index += 1;
    }
}
/**
 * Refuse an integer literal the two languages read as two different numbers.
 *
 * This is the one check that can only be made here. Python's JSON decoder gives
 * an exact `int` for a literal with no point and no exponent, JavaScript gives
 * the nearest double, and above 2^53 many distinct integers share that double --
 * so the same file takes two digests and nothing on this side can tell which
 * value was written. By the time `JSON.parse` has returned, `1e30` and
 * `1000000000000000000000000000000` are the same number here and a float and an
 * int there, so the distinction the refusal depends on exists only in the text.
 *
 * A literal *with* a point or an exponent is a float in both languages and holds
 * the same double in both, so it is left alone however large it is.
 *
 * Returns the index just past the literal.
 */
function checkNumberLiteral(text, start) {
    let index = start;
    if (text[index] === "-")
        index += 1;
    const digitsFrom = index;
    while (index < text.length && text[index] >= "0" && text[index] <= "9")
        index += 1;
    const integerDigits = text.slice(digitsFrom, index);
    let isInteger = integerDigits.length > 0;
    if (text[index] === ".") {
        isInteger = false;
        index += 1;
        while (index < text.length && text[index] >= "0" && text[index] <= "9")
            index += 1;
    }
    if (text[index] === "e" || text[index] === "E") {
        isInteger = false;
        index += 1;
        if (text[index] === "+" || text[index] === "-")
            index += 1;
        while (index < text.length && text[index] >= "0" && text[index] <= "9")
            index += 1;
    }
    if (isInteger && integerDigits.replace(/^0+(?=\d)/, "").length >= 16) {
        const magnitude = BigInt(integerDigits);
        if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
            refuse("UNSAFE_INTEGER", `the integer literal at byte offset ${start} is outside ±${Number.MAX_SAFE_INTEGER}. Python holds it ` +
                "as written and JavaScript reads the nearest double, and many distinct integers share that one " +
                "double -- so this file takes two digests and nothing on the JavaScript side can tell which value " +
                "was meant. A 64-bit seed, a large shot count or an external 64-bit id is recorded as digits under " +
                "the `exact_integer_string` contract, which both languages hash as written.");
        }
    }
    return Math.max(index, start + 1);
}
/**
 * Is the string that just ended at `index` a property name?
 *
 * A property name is the string a colon follows, whitespace aside. The
 * alternative -- tracking "expecting a name" through the whole grammar -- is a
 * second JSON parser, and a second parser is a second thing that can disagree
 * with the first about what this file says.
 */
function isPropertyName(text, index) {
    for (let scan = index; scan < text.length; scan += 1) {
        const char = text[scan];
        if (char === " " || char === "\t" || char === "\n" || char === "\r")
            continue;
        return char === ":";
    }
    return false;
}
/**
 * A lone surrogate in one decoded string -- a property name or a value.
 *
 * `offset` is where the string started in the file, so the refusal sends a
 * reader to a place rather than to a document.
 */
function assertNoUnpairedSurrogates(decoded, offset) {
    for (let index = 0; index < decoded.length; index += 1) {
        const unit = decoded.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const low = index + 1 < decoded.length ? decoded.charCodeAt(index + 1) : Number.NaN;
            if (low >= 0xdc00 && low <= 0xdfff) {
                index += 1;
                continue;
            }
            refuseSurrogate(unit, offset, "high");
        }
        if (unit >= 0xdc00 && unit <= 0xdfff)
            refuseSurrogate(unit, offset, "low");
    }
}
function refuseSurrogate(unit, offset, half) {
    refuse("LONE_SURROGATE", `the string starting at byte offset ${offset} carries a lone ${half} surrogate ` +
        `U+${unit.toString(16).toUpperCase().padStart(4, "0")}. RFC 8785 §3.2.2.2 requires a compliant ` +
        "canonicalizer to terminate on one: JavaScript would hash the escape and Python cannot encode it as UTF-8 " +
        "at all, so the file hashes in one language and crashes the verifier in the other.");
}
/**
 * Read a study file from raw bytes, or refuse it.
 *
 * The order is the contract, and each step exists because the next one would
 * have destroyed its evidence: BOM before decode, decode before scan, scan
 * before parse.
 */
export function readStudyFileBytes(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        refuse("NOT_JSON_VALUE", "file verification is defined over raw bytes and takes a Uint8Array. A string has already been decoded by " +
            "somebody, under rules this function exists to check.");
    }
    if (bytes.length >= 3 &&
        bytes[0] === BOM_UTF8[0] &&
        bytes[1] === BOM_UTF8[1] &&
        bytes[2] === BOM_UTF8[2]) {
        refuse("BYTE_ORDER_MARK", "the file begins with a UTF-8 byte order mark. RFC 8259 §8.1 says an implementation MUST NOT add one and " +
            "MAY ignore one, and `MAY ignore` is the problem: an ignoring reader and a non-ignoring reader hash two " +
            "different byte sequences for one file. It is refused rather than stripped, because stripping would make " +
            "the digest depend on which reader took it.");
    }
    const text = decodeStrictUtf8(bytes);
    // The scan does double duty: it is where duplicate property names are caught
    // and where every decoded string is checked for a lone surrogate, both before
    // the parse that would destroy the evidence for the first and materialise the
    // second.
    assertNoDuplicateKeys(text);
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        refuse("INVALID_JSON", `the file is not JSON: ${error.message}`);
    }
    return Object.freeze({ value: value, text });
}
//# sourceMappingURL=file.js.map