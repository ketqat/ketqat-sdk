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

from .study_hashing import (
    STUDY_HASH_RULES_KEY,
    calculate_study_hash,
    study_rules_id_of,
)
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
    "study_task": "study-task.schema.json",
    "evidence_node": "evidence-node.schema.json",
    "evidence_edge": "evidence-edge.schema.json",
    "execution_capsule": "execution-capsule.schema.json",
    "research_package": "research-package.schema.json",
}


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

    Three gates, in this order, because the order is what makes the failures
    readable.

    The schema version comes first: a record from a future version of the family
    would fail the current schema in ways that describe the wrong problem.

    The rules id comes second, checked in code as well as in the schema's own
    `const`, so a record that never named its rules is told exactly that. ADR
    0006's "no marker means version 1" is right for a registry whose records
    predate versioning; this family has none, so silence is a malformed record
    rather than an old one, and it is refused rather than defaulted.

    The schema comes last -- it is also the only gate that needs a file on disk,
    so the two cheap refusals are given before anything can fail for the
    unrelated reason that this build does not carry the schema -- and it reports
    every error it found rather than the first, because a record with four
    problems otherwise takes four rounds to fix.
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

    try:
        study_rules_id_of(value)
    except ValueError as exc:
        raise KetQatValidationError(
            f"Invalid study {kind} record: {STUDY_HASH_RULES_KEY}: {exc}"
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


def _nodes_by_hash(nodes: list[Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        recorded = node.get("content_hash")
        if isinstance(recorded, str) and recorded not in index:
            index[recorded] = node
    return index


def _claim_map_problems(value: dict[str, Any]) -> list[str]:
    """Whether every number in the package still resolves to a node it carries.

    Pure dict walking, and deliberately so: this asks whether the package joins
    up, never whether its numbers are right. A row naming a node the file does
    not contain is a figure a reader cannot open, and that is checkable here. A
    figure that is wrong is not.
    """
    problems: list[str] = []
    nodes = value.get("nodes") or []
    edges = value.get("edges") or []
    index = _nodes_by_hash(nodes)
    edge_hashes = {
        edge.get("content_hash") for edge in edges if isinstance(edge, dict)
    }

    for section in ("assumption_rows", "result_rows"):
        for row in value.get(section) or []:
            if not isinstance(row, dict):
                continue
            node_hash = row.get("node_hash")
            if node_hash in index:
                continue
            problems.append(
                f"EVIDENCE_NODE_UNRESOLVED ({section}: {row.get('label')}): the row names node "
                f"{node_hash}, and the package does not carry it."
            )

    claim_map = value.get("claim_evidence_map") or []
    mapped = {
        entry.get("claim_node_hash") for entry in claim_map if isinstance(entry, dict)
    }

    for node in nodes:
        if not isinstance(node, dict) or node.get("kind") != "claim":
            continue
        if node.get("content_hash") not in mapped:
            problems.append(
                f"CLAIM_WITHOUT_EVIDENCE_NODE ({node.get('label')}): the claim node has no entry "
                "in the claim evidence map, so nothing states what it rests on."
            )
        claim = node.get("claim")
        if isinstance(claim, dict):
            claimed = claim.get("value")
            if not isinstance(claimed, dict) or claimed.get("value") is None:
                problems.append(
                    f"CLAIM_VALUE_UNKNOWN ({node.get('label')}): the claim asserts a value that is "
                    "unknown, which is the absence of a claim rather than a weaker one."
                )

    for entry in claim_map:
        if not isinstance(entry, dict):
            continue
        claim_hash = entry.get("claim_node_hash")
        subject = index.get(claim_hash, {}).get("label", claim_hash)
        if claim_hash not in index:
            problems.append(
                f"EVIDENCE_NODE_UNRESOLVED ({claim_hash}): the claim evidence map names a claim node "
                "the package does not carry."
            )
        evidence = entry.get("evidence_node_hashes") or []
        if not evidence:
            problems.append(
                f"CLAIM_WITHOUT_EVIDENCE_NODE ({subject}): the claim is mapped to an empty evidence "
                "list, which records a claim that was walked back to nothing."
            )
        for node_hash in evidence:
            if node_hash in index:
                continue
            problems.append(
                f"EVIDENCE_NODE_UNRESOLVED ({subject}): the claim is said to rest on node {node_hash}, "
                "and the package does not carry it."
            )
        for edge_hash in entry.get("edge_hashes") or []:
            if edge_hash in edge_hashes:
                continue
            problems.append(
                f"EVIDENCE_EDGE_ENDPOINT_UNRESOLVED ({subject}): the claim evidence map cites edge "
                f"{edge_hash}, and no edge in this package has that hash."
            )

    return problems


def _graph_problems(value: dict[str, Any]) -> list[str]:
    """Whether the graph's identities are its own contents, and its edges join up.

    Two failures, kept apart. A node whose stated hash is not the hash of its
    contents was edited after it was written. A node re-hashed after editing
    passes that check and fails the next one: identity in this graph *is* the
    hash, so every edge that named the old one now points at nothing. Fabricating
    a study therefore means rewriting the graph, and a rewritten graph says
    something different where a reader can see it.
    """
    problems: list[str] = []
    nodes = value.get("nodes") or []
    edges = value.get("edges") or []
    present: set[str] = set()

    for node in nodes:
        if not isinstance(node, dict):
            continue
        expected = calculate_study_hash(node)
        recorded = node.get("content_hash")
        if expected != recorded:
            problems.append(
                f"Node {node.get('label')!r} claims content hash {recorded} and its own contents "
                f"canonicalize to {expected}."
            )
        if isinstance(recorded, str):
            present.add(recorded)

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        expected = calculate_study_hash(edge)
        recorded = edge.get("content_hash")
        if expected != recorded:
            problems.append(
                f"Edge {recorded} ({edge.get('kind')}) canonicalizes to {expected}; its recorded hash "
                "does not match what it says."
            )
        for side in ("from_node_hash", "to_node_hash"):
            endpoint = edge.get(side)
            if endpoint in present:
                continue
            problems.append(
                f"Edge {recorded} ({edge.get('kind')}) has an unresolved {side}: {endpoint}."
            )

    return problems


def verify_research_package(
    value: dict[str, Any], *, validate_schema: bool = True
) -> dict[str, Any]:
    """Check a research package the way a recipient has to: from the file alone.

    Three questions, answered separately because they fail separately.

    `hash_matches` says the file was not edited after it was written. On its own
    that is worth little -- anyone who edits a package can recompute its hash --
    which is exactly why the other two exist. `graph_valid` and `claims_resolve`
    say the package still joins up, and they are what catches the
    edit-then-re-hash fabrication a hash check cannot see.

    **This function does not recompute the science.** It does not re-derive an
    estimate from a scenario, re-run a decision rule, or check that a claim
    follows from the evidence mapped to it; ADR 0010 grants this language hashing
    and validation only, and ADR 0014 requires the absence to be stated rather
    than implied. `decision_recompute` in the returned dict says so in the result
    itself, so a caller reporting "verified in Python" cannot accidentally report
    more than was checked. A valid result here means the package is internally
    consistent and unedited. Whether its conclusions follow from its inputs is a
    question `verifyBundle` answers in the TypeScript SDK, over the bundles this
    package references.

    `validate_schema` exists because "is this shaped like a research package" and
    "does this research package hold together" are different questions. A caller
    that has already answered the first -- against a record it just built, or one
    it validated a moment ago -- should not be made to answer it twice.
    """
    problems: list[str] = []

    if not isinstance(value, dict):
        raise KetQatValidationError(
            f"A research package must be a JSON object, not {type(value).__name__}."
        )

    if validate_schema:
        validate_study_record(value, "research_package")

    rules_id = study_rules_id_of(value)
    expected = calculate_study_hash(value, rules_id)
    actual = value.get("reproducibility_hash")
    hash_matches = isinstance(actual, str) and actual == expected
    if not hash_matches:
        problems.append(
            f"Reproducibility hash mismatch: the package claims {actual} and its own contents "
            f"canonicalize to {expected} under {rules_id}."
        )

    graph_problems = _graph_problems(value)
    claim_problems = _claim_map_problems(value)
    problems.extend(graph_problems)
    problems.extend(claim_problems)

    return {
        "valid": not problems,
        "hash_matches": hash_matches,
        "claims_resolve": not claim_problems,
        "graph_valid": not graph_problems,
        "expected_hash": expected,
        "actual_hash": actual if isinstance(actual, str) else None,
        "problems": problems,
        # Stated in the result, not only in the docstring: a caller that renders
        # this dict is rendering the limitation with it.
        "decision_recompute": False,
    }
