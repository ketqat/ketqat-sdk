"""Schema validation and structural checking for the `study` contract family.

ADR 0010 grants this language two jobs on study records and withholds a third.
It may say whether a record is shaped the way the family says it is, and it may
recompute a hash and see whether the record was edited. It may not re-derive the
science: nothing here re-runs an estimator, re-evaluates a decision rule, or
recomputes a claim from its inputs. That work lives in the TypeScript SDK, and a
Python function that appeared to do it -- however carefully -- would be a second
implementation of the model, silently disagreeing with the first at the third
decimal place.

What that buys is the thing a reader actually needs. Two independent
implementations of one canonical form let somebody check a record without
running the code that produced it, which is the whole content of the word
"reproduced". So the checks here are the ones that can be made honestly from the
record alone: is it shaped right, is it unedited, and does every number in its
tables still resolve to a node it carries.

`verify_research_package` states its own limitation in its docstring and in the
result it returns, per ADR 0014's rule that an absence is reported rather than
implied.
"""

from __future__ import annotations

from typing import Any

from jsonschema import Draft7Validator

from .study_hash import study_self_hash
from .study_limits import StudyHashRefusal
from .study_rules import STUDY_HASH_RULES_KEY, STUDY_KNOWN_HASH_RULES_IDS
from .validation import KetQatValidationError, load_schema

#: The version the family enters at.
#:
#: Pinned rather than accepted as a range: a record announcing a version this
#: build has never seen is refused, because "close enough" is how a field that
#: changed meaning gets read under its old meaning.
STUDY_SCHEMA_VERSION = "1.0"

#: Record kind to packaged schema filename.
#:
#: The kinds are the family's, the filenames are the generator's, and keeping the
#: mapping in one dict means a caller names a record kind rather than guessing at
#: a kebab-cased filename. Every file here ships in the wheel; a schema that
#: exists only in a checkout validates for maintainers and for nobody else.
STUDY_SCHEMA_FILES: dict[str, str] = {
    "study": "study.schema.json",
    "study_event": "study-event.schema.json",
    "problem_specification": "problem-specification.schema.json",
    "study_plan": "study-plan.schema.json",
    "confirmation_receipt": "confirmation-receipt.schema.json",
    "study_task_authorization": "study-task-authorization.schema.json",
    # Not a content-addressed kind: `study_registry.study_record_kind` refuses
    # `execution_job` with NOT_CONTENT_ADDRESSED. It is listed here because a
    # job still arrives over an API and still has to be shaped right, and
    # validation and hashing are separate questions.
    "execution_job": "execution-job.schema.json",
    "task_outcome": "task-outcome.schema.json",
    "evidence_node": "evidence-node.schema.json",
    "evidence_edge": "evidence-edge.schema.json",
    "review_record": "review-record.schema.json",
    "reproduction_record": "reproduction-record.schema.json",
    "execution_capsule": "execution-capsule.schema.json",
    "research_package": "research-package.schema.json",
}


def _study_rules_id_problem(value: dict[str, Any]) -> str | None:
    """The reason a record names no rules this build has, or None.

    Nothing is inferred from silence (ADR 0010): a study record without a rules
    id is malformed rather than old. The two cases are separate messages because
    they need separate fixes -- one asks a producer to mark the record, the other
    says this build cannot verify it at all.

    Mirrors `studyRulesIdRefusal` in src/study/refusals.ts.
    """
    recorded = value.get(STUDY_HASH_RULES_KEY)
    if not isinstance(recorded, str) or recorded == "":
        return (
            f"A study-family record must name its hash rules in {STUDY_HASH_RULES_KEY}; nothing is "
            "inferred from silence. A record without one is refused, not defaulted (ADR 0010)."
        )
    if recorded not in STUDY_KNOWN_HASH_RULES_IDS:
        known = ", ".join(STUDY_KNOWN_HASH_RULES_IDS)
        return (
            f"This build does not know the hash rules id {recorded!r}. Known ids: {known}. A future "
            "study-v2 is a new rule set, never a reinterpretation of this one."
        )
    return None


def _load_study_schema(kind: str) -> dict[str, Any]:
    """The packaged schema for one record kind, or a refusal that names the file.

    `load_schema` already fails when a schema is missing, but its message names
    only the file. A caller here asked about a record *kind*, and being told
    which kind could not be checked -- and which file would have answered it --
    is the difference between a fixable report and a puzzle.
    """
    try:
        filename = STUDY_SCHEMA_FILES[kind]
    except KeyError:
        known = ", ".join(sorted(STUDY_SCHEMA_FILES))
        raise KetQatValidationError(
            f"Unknown study record kind {kind!r}. Known kinds: {known}."
        ) from None

    try:
        return load_schema(filename)
    except KetQatValidationError as exc:
        raise KetQatValidationError(
            f"The JSON Schema for study record kind {kind!r} is not installed: {filename}. "
            "A study record cannot be validated against a schema this build does not carry, "
            "and validating it against a different one would answer a question nobody asked."
        ) from exc


def validate_study_record(value: dict[str, Any], kind: str) -> None:
    """Check one study record against its packaged schema.

    Five gates, in this order, because the order is what makes the failures
    readable.

    The schema version comes first: a record from a future version of the family
    would fail the current schema in ways that describe the wrong problem.

    The rules id comes second, checked in code as well as in the schema's own
    `const`, so a record that never named its rules is told exactly that. ADR
    0006's "no marker means version 1" is right for a registry whose records
    predate versioning; this family has none, so silence is a malformed record
    rather than an old one, and it is refused rather than defaulted.

    Then the refusal that is about *hashing* rather than about shape, and that a
    JSON Schema cannot express: the record cannot be projected and canonicalized
    at all. Computing the digest is what asks that question -- a field nobody
    declared, a field of the wrong shape, a non-finite number, a lone surrogate,
    a document past the structural bounds -- and it is asked before the schema
    gate so that "this record cannot be hashed" is never reported as "this
    record is the wrong shape". It is asked of every record kind, because
    enumerating which kinds could carry which problem is how the retired
    version of this check came to be applied to two fields of one kind and to
    nothing else.

    The schema comes last -- it is also the only gate that needs a file on disk,
    so the cheap refusals are given before anything can fail for the unrelated
    reason that this build does not carry the schema -- and it reports every
    error it found rather than the first, because a record with four problems
    otherwise takes four rounds to fix.
    """
    if not isinstance(value, dict):
        raise KetQatValidationError(
            f"A study {kind} record must be a JSON object, not {type(value).__name__}."
        )

    recorded_version = value.get("schema_version")
    if recorded_version != STUDY_SCHEMA_VERSION:
        raise KetQatValidationError(
            f"Unsupported study schema_version {recorded_version!r}; expected {STUDY_SCHEMA_VERSION!r}."
        )

    rules_problem = _study_rules_id_problem(value)
    if rules_problem is not None:
        raise KetQatValidationError(
            f"Invalid study {kind} record: {STUDY_HASH_RULES_KEY}: {rules_problem}"
        )

    try:
        study_self_hash(kind, value)
    except StudyHashRefusal as exc:
        raise KetQatValidationError(
            f"Invalid study {kind} record: {exc.code}: {exc}"
        ) from exc

    validator = Draft7Validator(_load_study_schema(kind))
    errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
    if not errors:
        return

    formatted = []
    for error in errors:
        path = "$" + "".join(
            f"[{part!r}]" if isinstance(part, int) else f".{part}" for part in error.path
        )
        formatted.append(f"{path}: {error.message}")
    raise KetQatValidationError(f"Invalid study {kind} record:\n" + "\n".join(formatted))

#: `verify_research_package` is not re-exported here.
#:
#: It lived in this module as a convenience door for a caller that already had
#: it imported. That door was the only reason `study_validation` and
#: `study_package` referred to each other, and a deferred import is still an
#: import edge -- so the cycle stayed no matter which side deferred. The verifier
#: lives in `study_package`, where the checks it runs live, and callers import it
#: from there. `study_package` depends on this module for schema validation, and
#: nothing depends on `study_package` from here.
