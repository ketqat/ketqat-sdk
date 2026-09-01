"""Domain separation: the typed header every study digest is taken over.

Mirrors `src/study/preimage.ts`::

    sha256(
      "ketqat.study" || 0x00 ||   # organisation + contract family
      <record_kind>  || 0x00 ||   # e.g. "study_plan"
      <hash_purpose> || 0x00 ||   # "semantic" | "record" | "receipt" | "artifact"
      <schema_version> || 0x00 ||
      <hash_rules_id>  || 0x00 ||
      <body>                      # JCS bytes, or the literal bytes of an artifact
    )

Without the header, two record kinds that happen to project to the same body
share a digest. That is not a hypothetical in this family: the receipt projection
of a `study`, a `study_task_authorization` and a `problem_specification` is the
same one-field object in all three cases, and a `semantic` and a `record`
projection of the same record coincide exactly whenever every field of that
record is ``SEMANTIC``. A digest that can stand for either of two things
identifies neither.

NUL is the separator because it cannot occur in any of the five components: each
is validated below as one or more printable ASCII characters, so the header
parses back unambiguously and no component can be split, padded or merged into
its neighbour. A separator that could appear inside a component is not a
separator -- ``("a", "b\\0c")`` and ``("a\\0b", "c")`` would be one preimage, and
the record kind a digest committed to would depend on where a reader chose to
cut.
"""

from __future__ import annotations

from typing import Mapping

from .study_limits import refuse
from .study_projection import STUDY_HASH_PURPOSES
from .study_rules import STUDY_HASH_DOMAIN, STUDY_HASH_RULES_ID, is_known_hash_rules_id

#: A header component: 1 to 128 printable ASCII characters.
#:
#: Printable ASCII excludes NUL by construction, which is the property the
#: separator depends on, and it also excludes space, control characters and every
#: non-ASCII byte -- so the header is the same sequence of bytes in both
#: languages without a normalization question being asked about it.
MAX_COMPONENT_LENGTH = 128

_NUL = b"\x00"
_PURPOSES = frozenset(STUDY_HASH_PURPOSES)


def _assert_component(name: str, value: object) -> str:
    if not isinstance(value, str) or value == "":
        refuse(
            "MISSING_HEADER_COMPONENT",
            f"the preimage header needs a {name}, and this record does not supply one. Nothing is inferred: a "
            "study record that does not say what it is, what rules it hashes under and what schema it was "
            "written against is malformed rather than old, and it is refused rather than defaulted.",
        )
    if len(value) > MAX_COMPONENT_LENGTH:
        refuse(
            "INVALID_HEADER_COMPONENT",
            f"the {name} header component is longer than {MAX_COMPONENT_LENGTH} characters.",
        )
    for index, character in enumerate(value):
        if not 0x21 <= ord(character) <= 0x7E:
            refuse(
                "INVALID_HEADER_COMPONENT",
                f"the {name} header component contains a character outside printable ASCII at index {index}. "
                "The header is NUL-separated, and that separator is unambiguous only because no component can "
                "contain a NUL -- or any other byte outside this range, which would make the header's encoding "
                "a second question.",
            )
    return value


def _assert_purpose(value: object) -> str:
    purpose = _assert_component("hash purpose", value)
    if purpose not in _PURPOSES:
        refuse(
            "INVALID_HEADER_COMPONENT",
            f"{purpose!r} is not a hash purpose. Known purposes: {', '.join(STUDY_HASH_PURPOSES)}. The list is "
            "closed because a purpose invented at a call site would be a new digest namespace nobody declared.",
        )
    return purpose


def study_header(
    record_kind: str,
    purpose: str,
    schema_version: str,
    hash_rules_id: str = STUDY_HASH_RULES_ID,
) -> Mapping[str, str]:
    """The header this build writes for a record kind and purpose."""
    return {
        "domain": STUDY_HASH_DOMAIN,
        "record_kind": record_kind,
        "purpose": purpose,
        "schema_version": schema_version,
        "hash_rules_id": hash_rules_id,
    }


def build_study_preimage(header: Mapping[str, str], body: bytes) -> bytes:
    """The bytes a study digest is taken over.

    ``body`` is bytes rather than a value because two of the four roles need it
    to be: ``artifact_hash`` is defined over the literal bytes of a file, and
    defining the header over anything else would mean two preimage constructions
    to keep in step.
    """
    if not isinstance(body, (bytes, bytearray)):
        refuse("NOT_JSON_VALUE", "the preimage body is bytes; a str has already been encoded by somebody.")
    components = [
        _assert_component("domain", header.get("domain")),
        _assert_component("record kind", header.get("record_kind")),
        _assert_purpose(header.get("purpose")),
        _assert_component("schema version", header.get("schema_version")),
        _assert_component("hash rules id", header.get("hash_rules_id")),
    ]
    rules_id = components[4]
    if not is_known_hash_rules_id(rules_id):
        refuse(
            "UNKNOWN_HASH_RULES_ID",
            f"this build does not know the hash rules id {rules_id!r}. A future study-v2 is a new entry in "
            "`STUDY_KNOWN_HASH_RULES_IDS`, never a reinterpretation of this one.",
        )
    out = bytearray()
    for component in components:
        out += component.encode("ascii")
        out += _NUL
    out += body
    return bytes(out)
