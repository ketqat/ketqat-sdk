"""Structural verification of a research package, in Python (goal §13, §14).

ADR 0010 grants this language two jobs on study records and withholds a third.
It may say whether a record is shaped the way the family says it is, and it may
recompute a digest and see whether the record was edited. It may not re-derive
the science: nothing here re-runs an estimator, re-evaluates a decision rule, or
rebuilds a bundle's assessments from its inputs. A Python function that appeared
to do it -- however carefully -- would be a second implementation of the model,
silently disagreeing with the first at the third decimal place.

What this module does instead is everything *between* those two: the structural
verification a recipient can perform from the file alone. Every table cell, every
report segment, every figure coordinate, every claim in the evidence map and
every bundle reference is resolved against what the package carries; the CSV each
table renders to is regenerated and re-hashed; the reproduction recipe is checked
against the artifacts the file holds; and every claim's supporting tree is walked
to see whether it terminates in something that was measured, run, cited, supplied
or explicitly assumed.

**The contract with the TypeScript verifier is a code and a JSON path.** Not a
message: prose is written for a person and is improved whenever somebody finds a
better sentence, and a cross-language test that compared English would fail on an
improvement and pass on a wrong path. `fixtures/study/verification-vectors.json`
pins the pairs, and `python/tests/test_study_package.py` reproduces them from the
same packages.

Two kinds of finding are deliberately distinguished by their path. A finding
addressed to a *place* -- ``$.tables[0].rows[0].cells[1].node_hash`` -- is part of
that contract, and both languages produce it. A finding addressed to a
*collection* -- ``$.nodes`` or ``$.edges`` -- comes from a check that reports by
subject rather than by position, and the two implementations do not cover
identical sets of those. The vectors record them separately so the difference is
written down rather than implied.

`verify_research_package` names what it did in the value it returns:
``verification_performed`` is ``INTEGRITY_AND_STRUCTURE`` here and
``INTEGRITY_STRUCTURE_AND_SCIENCE`` in TypeScript. A caller rendering "verified
in Python" is rendering that field with it, per ADR 0014's rule that an absence
is reported rather than implied.
"""

from __future__ import annotations

import base64
import binascii
import json
import re
from typing import Any, Iterable, Mapping, Sequence

from .study_hash import artifact_hash, study_self_hash
from .study_jcs import serialize_jcs_number
from .study_limits import StudyHashRefusal
from .study_registry import study_shape_document
from .study_rules import STUDY_HASH_RULES_KEY, STUDY_KNOWN_HASH_RULES_IDS

#: Ceilings, the package limits and the graph's own rules, read from the emitted
#: document rather than restated here.
#:
#: The same reason the shape tables are read rather than restated: a second,
#: hand-written copy in Python is a second thing that can drift, and nothing
#: watches it. `tests/study-field-completeness.test.mjs` compares the emitted copy
#: against the TypeScript source, so reading it is how this module inherits that
#: check.
_DOCUMENT = study_shape_document()

STUDY_PACKAGE_LIMITS: Mapping[str, int] = dict(_DOCUMENT["package_limits"])

_GROUND_RULES: dict[str, str] = {
    rule["node_kind"]: rule["grounds"] for rule in _DOCUMENT["evidence_ground_rules"]
}

_EDGE_MATRIX: set[tuple[str, str, str]] = {
    (rule["from_kind"], rule["edge_kind"], rule["to_kind"])
    for rule in _DOCUMENT["evidence_edge_matrix"]
}

#: The two paths a subject-addressed graph refusal lands on.
COLLECTION_PATHS = frozenset({"$.nodes", "$.edges"})


def study_path(*parts: Any) -> str:
    """A path both languages spell the same way.

    A string part is a property and takes a dot; an integer is an array index and
    takes brackets. The mirror of `studyPath` in src/study/findings.ts, and the
    reason a cross-language assertion on `path` means anything.
    """
    path = "$"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def _finding(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


# --------------------------------------------------------------------- ceilings


def _nesting_depth(value: Any, ceiling: int, depth: int = 1) -> int:
    """How deeply a value nests, counted the way the ceiling is stated.

    The root object is depth 1, and counting stops at the ceiling rather than at
    the bottom: a document built to be deep should not be fully walked in order
    to find out that it is too deep.
    """
    if depth > ceiling:
        return depth
    if not isinstance(value, (dict, list)):
        return depth - 1
    deepest = depth
    children = value if isinstance(value, list) else list(value.values())
    for child in children:
        found = _nesting_depth(child, ceiling, depth + 1)
        deepest = max(deepest, found)
        if deepest > ceiling:
            return deepest
    return deepest


def _limit_finding(path: str, what: str, observed: int, ceiling: int) -> dict[str, str] | None:
    if observed <= ceiling:
        return None
    return _finding(
        "PACKAGE_LIMIT_EXCEEDED",
        path,
        f"This package carries {observed} {what}, past the ceiling of {ceiling}.",
    )


def package_limit_findings(record: Mapping[str, Any]) -> list[dict[str, str]]:
    """Every ceiling the package as a whole is measured against.

    Checked before anything walks the document, which is the only point at which
    a ceiling is worth having: a bound applied after the recursive walk it was
    meant to bound has already happened is a bound that did nothing.
    """
    findings: list[dict[str, str]] = []

    def count(key: str) -> int:
        value = record.get(key)
        return len(value) if isinstance(value, list) else 0

    def add(item: dict[str, str] | None) -> None:
        if item is not None:
            findings.append(item)

    add(_limit_finding(study_path("nodes"), "evidence nodes", count("nodes"), STUDY_PACKAGE_LIMITS["max_nodes"]))
    add(_limit_finding(study_path("edges"), "evidence edges", count("edges"), STUDY_PACKAGE_LIMITS["max_edges"]))
    add(_limit_finding(study_path("tables"), "tables", count("tables"), STUDY_PACKAGE_LIMITS["max_tables"]))
    add(_limit_finding(study_path("figures"), "figures", count("figures"), STUDY_PACKAGE_LIMITS["max_figures"]))
    add(
        _limit_finding(
            study_path("references"), "citations", count("references"), STUDY_PACKAGE_LIMITS["max_citations"]
        )
    )
    add(
        _limit_finding(
            study_path("check_ledger"),
            "check ledger entries",
            count("check_ledger"),
            STUDY_PACKAGE_LIMITS["max_check_ledger_entries"],
        )
    )

    for index, table in enumerate(record.get("tables") or []):
        if not isinstance(table, dict):
            continue
        rows = table.get("rows")
        add(
            _limit_finding(
                study_path("tables", index, "rows"),
                "table rows",
                len(rows) if isinstance(rows, list) else 0,
                STUDY_PACKAGE_LIMITS["max_table_rows"],
            )
        )

    ceiling = STUDY_PACKAGE_LIMITS["max_nesting_depth"]
    depth = _nesting_depth(record, ceiling)
    if depth > ceiling:
        findings.append(
            _finding(
                "PACKAGE_LIMIT_EXCEEDED",
                study_path(),
                f"This package nests at least {depth} levels deep, past the ceiling of {ceiling}.",
            )
        )
    return findings


# ----------------------------------------------------------------------- report

#: A digit standing on its own as a number.
#:
#: A digit is permitted when the character before it is a letter, a digit, a dot,
#: an underscore or a hyphen -- which makes ``Shor-2048`` and ``v1.2`` ordinary
#: words -- and refused otherwise, which makes ``4.2 million`` and ``distance 21``
#: references instead. The lookbehind is one character wide, which is what lets
#: this be the same expression in both languages rather than two overlapping
#: approximations of one rule.
_UNGROUNDED_NUMBER = re.compile(r"(?<![A-Za-z0-9._-])[0-9]")


def contains_ungrounded_number(text: str) -> bool:
    return bool(_UNGROUNDED_NUMBER.search(text))


def grounded_prose_findings(document: Mapping[str, Any], section: str = "report") -> list[dict[str, str]]:
    """Every place a number was typed into a verified surface."""
    findings: list[dict[str, str]] = []
    for section_index, current in enumerate(document.get("sections") or []):
        if not isinstance(current, dict):
            continue
        title = current.get("title")
        if isinstance(title, str) and contains_ungrounded_number(title):
            findings.append(
                _finding(
                    "VERIFIED_PROSE_NOT_GROUNDED",
                    study_path(section, "sections", section_index, "title"),
                    "This section title carries a number standing on its own, which is a figure in the report "
                    "reached through the table of contents.",
                )
            )
        for segment_index, segment in enumerate(current.get("segments") or []):
            if not isinstance(segment, dict):
                continue
            if segment.get("kind") not in ("PROSE", "HEADING"):
                continue
            text = segment.get("text")
            if not isinstance(text, str) or not contains_ungrounded_number(text):
                continue
            findings.append(
                _finding(
                    "VERIFIED_PROSE_NOT_GROUNDED",
                    study_path(section, "sections", section_index, "segments", segment_index, "text"),
                    "This text carries a number standing on its own. A figure typed into a verified section is "
                    "indistinguishable from one that was measured, and hashing the sentence establishes only "
                    "that nobody edited it.",
                )
            )
    return findings


def report_findings(
    document: Mapping[str, Any],
    nodes: Mapping[str, Mapping[str, Any]],
    tables: Sequence[Mapping[str, Any]],
    figures: Sequence[Mapping[str, Any]],
    citations: Sequence[Any],
    limitations: Sequence[Any],
    section: str = "report",
) -> list[dict[str, str]]:
    """The grounding rule, and then resolution.

    A `QUANTITY_REF` at a claim node renders the claim's label where a number
    belongs; a `CLAIM_REF` at a quantity renders a measurement as an assertion.
    Both read fine and say something the study did not.
    """
    findings = grounded_prose_findings(document, section)
    table_ids = {table.get("table_id") for table in tables if isinstance(table, dict)}
    figure_ids = {figure.get("figure_id") for figure in figures if isinstance(figure, dict)}
    section_ids: set[Any] = set()
    commentary_ids: set[Any] = set()

    for section_index, current in enumerate(document.get("sections") or []):
        if not isinstance(current, dict):
            continue
        if current.get("section_id") in section_ids:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    study_path(section, "sections", section_index, "section_id"),
                    "Two sections share this id, so a reader following a link to it arrives at whichever the "
                    "renderer reached first.",
                )
            )
        section_ids.add(current.get("section_id"))

        for segment_index, segment in enumerate(current.get("segments") or []):
            if not isinstance(segment, dict):
                continue
            kind = segment.get("kind")

            def at(*parts: Any) -> str:
                return study_path(section, "sections", section_index, "segments", segment_index, *parts)

            if kind in ("CLAIM_REF", "QUANTITY_REF"):
                node_hash = segment.get("node_hash")
                node = nodes.get(node_hash) if isinstance(node_hash, str) else None
                if node is None:
                    findings.append(
                        _finding(
                            "REPORT_REFERENCE_UNRESOLVED",
                            at("node_hash"),
                            f"This segment reads node {node_hash}, and the package does not carry it.",
                        )
                    )
                    continue
                if kind == "QUANTITY_REF" and node.get("quantity") is None:
                    findings.append(
                        _finding(
                            "REPORT_REFERENCE_KIND_MISMATCH",
                            at("node_hash"),
                            f"This segment renders a number and names a {node.get('kind')} node, which carries "
                            "no quantity.",
                        )
                    )
                elif kind == "CLAIM_REF" and node.get("kind") != "claim":
                    findings.append(
                        _finding(
                            "REPORT_REFERENCE_KIND_MISMATCH",
                            at("node_hash"),
                            f"This segment renders an assertion and names a {node.get('kind')} node.",
                        )
                    )
                continue

            if kind == "CITATION_REF":
                index = segment.get("citation_index")
                if isinstance(index, int) and 0 <= index < len(citations):
                    continue
                findings.append(
                    _finding(
                        "REPORT_REFERENCE_UNRESOLVED",
                        at("citation_index"),
                        f"This segment cites reference {index}, and the package carries {len(citations)}.",
                    )
                )
                continue

            if kind == "LIMITATION_REF":
                index = segment.get("limitation_index")
                if isinstance(index, int) and 0 <= index < len(limitations):
                    continue
                findings.append(
                    _finding(
                        "REPORT_REFERENCE_UNRESOLVED",
                        at("limitation_index"),
                        f"This segment cites limitation {index}, and the package carries {len(limitations)}.",
                    )
                )
                continue

            if kind == "TABLE_REF" and segment.get("table_id") not in table_ids:
                findings.append(
                    _finding(
                        "REPORT_REFERENCE_UNRESOLVED",
                        at("table_id"),
                        "This segment renders a table the package does not carry.",
                    )
                )
                continue

            if kind == "FIGURE_REF" and segment.get("figure_id") not in figure_ids:
                findings.append(
                    _finding(
                        "REPORT_REFERENCE_UNRESOLVED",
                        at("figure_id"),
                        "This segment renders a figure the package does not carry.",
                    )
                )

    for index, block in enumerate(document.get("commentary") or []):
        if not isinstance(block, dict):
            continue
        if block.get("commentary_id") in commentary_ids:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    study_path(section, "commentary", index, "commentary_id"),
                    "Two commentary blocks share this id.",
                )
            )
        commentary_ids.add(block.get("commentary_id"))

    report_bytes = 0
    for current in document.get("sections") or []:
        if not isinstance(current, dict):
            continue
        report_bytes += len(str(current.get("title") or "").encode("utf-8"))
        for segment in current.get("segments") or []:
            if isinstance(segment, dict) and isinstance(segment.get("text"), str):
                report_bytes += len(segment["text"].encode("utf-8"))
    over = _limit_finding(
        study_path(section, "sections"),
        "bytes of report text",
        report_bytes,
        STUDY_PACKAGE_LIMITS["max_report_bytes"],
    )
    if over is not None:
        findings.append(over)

    commentary_bytes = 0
    for block in document.get("commentary") or []:
        if isinstance(block, dict):
            commentary_bytes += len(str(block.get("title") or "").encode("utf-8"))
            commentary_bytes += len(str(block.get("text") or "").encode("utf-8"))
    over = _limit_finding(
        study_path(section, "commentary"),
        "bytes of commentary",
        commentary_bytes,
        STUDY_PACKAGE_LIMITS["max_commentary_bytes"],
    )
    if over is not None:
        findings.append(over)

    return findings


# ----------------------------------------------------------------------- tables


class StudyTableRenderError(Exception):
    """Raised when a table is rendered before it has been checked."""


def render_cell_value(quantity: Mapping[str, Any] | None) -> str:
    """A cell's rendered text, in the one spelling both languages produce.

    `serialize_jcs_number` is the family's canonical number-to-string function,
    the one RFC 8785 defines and both implementations pin against the RFC's own
    vectors. Using it rather than a local formatter is what makes the generated
    CSV byte-identical here and in TypeScript, and the CSV's digest is only worth
    carrying if the two languages regenerate the same bytes.

    ``UNKNOWN`` is the word, never an empty field: a blank cell reads as zero to
    a chart and as missing to a person, and the study said neither.
    """
    if not isinstance(quantity, Mapping):
        return "UNKNOWN"
    value = quantity.get("value")
    if value is None:
        return "UNKNOWN"
    return serialize_jcs_number(value)


_CSV_QUOTABLE = re.compile(r'["\r\n,]')


def _csv_field(value: str) -> str:
    """One CSV field, escaped by RFC 4180's rule and no other."""
    if not _CSV_QUOTABLE.search(value):
        return value
    return '"' + value.replace('"', '""') + '"'


def _csv_header_fields(table: Mapping[str, Any]) -> list[str]:
    fields: list[str] = []
    for column in table.get("columns") or []:
        header = str(column.get("header", ""))
        unit = column.get("unit")
        fields.append(header if unit is None else f"{header} ({unit})")
        if column.get("role") == "VALUE":
            fields.append(f"{header} node")
    return fields


def _cells_by_column(row: Mapping[str, Any]) -> dict[Any, Mapping[str, Any]]:
    index: dict[Any, Mapping[str, Any]] = {}
    for cell in row.get("cells") or []:
        if isinstance(cell, Mapping) and cell.get("column_id") not in index:
            index[cell.get("column_id")] = cell
    return index


def render_table_csv(
    table: Mapping[str, Any], sources: Mapping[str, Mapping[str, Any]]
) -> str:
    """Render the table to CSV, deterministically.

    LF line endings, no byte-order mark, columns in declared order and rows in
    stored order. Every one of those is a decision two implementations would
    otherwise make differently, and each difference is a digest that does not
    match a re-rendering.
    """
    lines = [",".join(_csv_field(field) for field in _csv_header_fields(table))]
    for row in table.get("rows") or []:
        index = _cells_by_column(row)
        fields: list[str] = []
        for column in table.get("columns") or []:
            cell = index.get(column.get("column_id"))
            if cell is None:
                raise StudyTableRenderError(
                    f"Table {table.get('table_id')} row {row.get('row_id')} has no cell for column "
                    f"{column.get('column_id')}."
                )
            if column.get("role") == "LABEL":
                fields.append(str(cell.get("text") or ""))
                continue
            node_hash = cell.get("node_hash")
            source = sources.get(node_hash) if isinstance(node_hash, str) else None
            if source is None:
                raise StudyTableRenderError(
                    f"Table {table.get('table_id')} row {row.get('row_id')} reads column "
                    f"{column.get('column_id')} from a node the package does not carry."
                )
            fields.append(render_cell_value(source.get("quantity")))
            fields.append(node_hash)
        lines.append(",".join(_csv_field(field) for field in fields))
    return "\n".join(lines) + "\n"


def table_findings(
    table: Mapping[str, Any],
    sources: Mapping[str, Mapping[str, Any]],
    index: int,
    section: str = "tables",
) -> list[dict[str, str]]:
    """Everything wrong with one table, addressed to where it is wrong."""
    findings: list[dict[str, str]] = []

    def at(*parts: Any) -> str:
        return study_path(section, index, *parts)

    columns: dict[Any, Mapping[str, Any]] = {}
    for column_index, column in enumerate(table.get("columns") or []):
        if not isinstance(column, Mapping):
            continue
        if column.get("column_id") in columns:
            findings.append(
                _finding(
                    "TABLE_SHAPE_MISMATCH",
                    at("columns", column_index, "column_id"),
                    "This column is declared twice, so a cell naming it has two columns to land in.",
                )
            )
            continue
        columns[column.get("column_id")] = column

    row_ids: set[Any] = set()
    for row_index, row in enumerate(table.get("rows") or []):
        if not isinstance(row, Mapping):
            continue
        if row.get("row_id") in row_ids:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    at("rows", row_index, "row_id"),
                    "This row id appears twice, so a figure naming it has two rows to read.",
                )
            )
        row_ids.add(row.get("row_id"))

        seen: set[Any] = set()
        for cell_index, cell in enumerate(row.get("cells") or []):
            if not isinstance(cell, Mapping):
                continue
            column = columns.get(cell.get("column_id"))
            if column is None:
                findings.append(
                    _finding(
                        "TABLE_SHAPE_MISMATCH",
                        at("rows", row_index, "cells", cell_index, "column_id"),
                        "This cell names a column the table does not declare.",
                    )
                )
                continue
            if cell.get("column_id") in seen:
                findings.append(
                    _finding(
                        "TABLE_SHAPE_MISMATCH",
                        at("rows", row_index, "cells", cell_index, "column_id"),
                        "This row has two cells for one column. One row, one column, one value.",
                    )
                )
                continue
            seen.add(cell.get("column_id"))

            if column.get("role") == "LABEL":
                if cell.get("text") is not None:
                    continue
                findings.append(
                    _finding(
                        "TABLE_SHAPE_MISMATCH",
                        at("rows", row_index, "cells", cell_index, "text"),
                        "This is a label column and the cell carries a node instead of text.",
                    )
                )
                continue

            node_hash = cell.get("node_hash")
            if node_hash is None:
                findings.append(
                    _finding(
                        "TABLE_CELL_WITHOUT_NODE",
                        at("rows", row_index, "cells", cell_index, "node_hash"),
                        "This is a value column and the cell names no node. A number typed into a table is "
                        "indistinguishable, to every reader, from one that was measured.",
                    )
                )
                continue
            source = sources.get(node_hash)
            if source is None:
                findings.append(
                    _finding(
                        "EVIDENCE_NODE_UNRESOLVED",
                        at("rows", row_index, "cells", cell_index, "node_hash"),
                        f"This cell reads node {node_hash}, and the package does not carry it.",
                    )
                )
                continue
            if source.get("quantity") is None:
                findings.append(
                    _finding(
                        "RESULT_ROW_WITHOUT_VALUE",
                        at("rows", row_index, "cells", cell_index, "node_hash"),
                        f"This cell reads its value from a {source.get('kind')} node, which carries no quantity.",
                    )
                )
                continue
            unit = column.get("unit")
            if unit is not None and source["quantity"].get("unit") != unit:
                findings.append(
                    _finding(
                        "TABLE_SHAPE_MISMATCH",
                        at("rows", row_index, "cells", cell_index, "node_hash"),
                        f"The column is in {unit!r} and this node's quantity is in "
                        f"{source['quantity'].get('unit')!r}.",
                    )
                )

        for column_id in columns:
            if column_id in seen:
                continue
            findings.append(
                _finding(
                    "TABLE_SHAPE_MISMATCH",
                    at("rows", row_index, "cells"),
                    f"This row has no cell for column {column_id!r}. A missing cell renders as a blank.",
                )
            )

    return findings


def table_csv_artifact_findings(
    table: Mapping[str, Any],
    sources: Mapping[str, Mapping[str, Any]],
    schema_version: str,
    index: int,
    section: str = "tables",
) -> list[dict[str, str]]:
    """Whether the recorded CSV artifact is the artifact these rows render to.

    Called only for a table whose rows resolve: rendering an unresolved table
    raises, and a digest mismatch reported on top of a missing node sends a
    reader to the CSV when the problem is in the graph.
    """
    findings: list[dict[str, str]] = []
    data = render_table_csv(table, sources).encode("utf-8")
    artifact = table.get("csv_artifact") or {}

    over = _limit_finding(
        study_path(section, index, "csv_artifact", "byte_size"),
        "CSV bytes",
        len(data),
        STUDY_PACKAGE_LIMITS["max_csv_bytes"],
    )
    if over is not None:
        findings.append(over)

    if str(len(data)) != artifact.get("byte_size"):
        findings.append(
            _finding(
                "TABLE_CSV_ARTIFACT_MISMATCH",
                study_path(section, index, "csv_artifact", "byte_size"),
                f"The table renders to {len(data)} bytes and the artifact records "
                f"{artifact.get('byte_size')}.",
            )
        )

    expected = artifact_hash("research_package", data, schema_version)
    if expected != artifact.get("content_hash"):
        findings.append(
            _finding(
                "TABLE_CSV_ARTIFACT_MISMATCH",
                study_path(section, index, "csv_artifact", "content_hash"),
                f"The table renders to a CSV whose bytes hash to {expected}, and the artifact claims "
                f"{artifact.get('content_hash')}.",
            )
        )
    return findings


def table_list_findings(
    tables: Sequence[Mapping[str, Any]], section: str = "tables"
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    seen: set[Any] = set()
    for index, table in enumerate(tables):
        if not isinstance(table, Mapping):
            continue
        if table.get("table_id") in seen:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    study_path(section, index, "table_id"),
                    "Two tables share this id, so a report segment naming it has two tables to render.",
                )
            )
        seen.add(table.get("table_id"))
        over = _limit_finding(
            study_path(section, index, "caption"),
            "caption bytes",
            len(str(table.get("caption") or "").encode("utf-8")),
            STUDY_PACKAGE_LIMITS["max_report_bytes"],
        )
        if over is not None:
            findings.append(over)
    return findings


# ---------------------------------------------------------------------- figures


def table_cell_key(table_id: str, row_id: str, column_id: str) -> str:
    """A table cell's address, in the one spelling both a figure and an index use."""
    return f"{table_id}\x00{row_id}\x00{column_id}"


def index_table_cells(tables: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """Every value cell in every table, addressed the way a figure addresses one."""
    index: dict[str, str] = {}
    for table in tables:
        if not isinstance(table, Mapping):
            continue
        value_columns = {
            column.get("column_id")
            for column in table.get("columns") or []
            if isinstance(column, Mapping) and column.get("role") == "VALUE"
        }
        for row in table.get("rows") or []:
            if not isinstance(row, Mapping):
                continue
            for cell in row.get("cells") or []:
                if not isinstance(cell, Mapping):
                    continue
                if cell.get("column_id") not in value_columns or cell.get("node_hash") is None:
                    continue
                key = table_cell_key(
                    str(table.get("table_id")), str(row.get("row_id")), str(cell.get("column_id"))
                )
                index.setdefault(key, str(cell.get("node_hash")))
    return index


def resolve_figure_value_ref(ref: Mapping[str, Any], cells: Mapping[str, str]) -> str | None:
    """The node a coordinate resolves to, or None when it resolves to nothing."""
    if ref.get("kind") == "NODE":
        node_hash = ref.get("node_hash")
        return node_hash if isinstance(node_hash, str) else None
    table_id = ref.get("table_id")
    row_id = ref.get("row_id")
    column_id = ref.get("column_id")
    if table_id is None or row_id is None or column_id is None:
        return None
    return cells.get(table_cell_key(str(table_id), str(row_id), str(column_id)))


def figure_findings(
    figure: Mapping[str, Any],
    sources: Mapping[str, Mapping[str, Any]],
    cells: Mapping[str, str],
    index: int,
    section: str = "figures",
) -> list[dict[str, str]]:
    """A chart drawn from coordinates a reader cannot open is a picture."""
    findings: list[dict[str, str]] = []

    def at(*parts: Any) -> str:
        return study_path(section, index, *parts)

    series_ids: set[Any] = set()
    spec = figure.get("spec") or {}
    for series_index, series in enumerate(spec.get("series") or []):
        if not isinstance(series, Mapping):
            continue
        if series.get("series_id") in series_ids:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    at("spec", "series", series_index, "series_id"),
                    "Two series in this figure share one id, so a legend has two entries a reader cannot tell "
                    "apart.",
                )
            )
        series_ids.add(series.get("series_id"))

        for point_index, point in enumerate(series.get("points") or []):
            if not isinstance(point, Mapping):
                continue
            for axis in ("x", "y"):
                ref = point.get(axis)
                where = at("spec", "series", series_index, "points", point_index, axis)
                if not isinstance(ref, Mapping):
                    findings.append(
                        _finding("FIGURE_POINT_UNRESOLVED", where, "This coordinate names nothing.")
                    )
                    continue
                node_hash = resolve_figure_value_ref(ref, cells)
                if node_hash is None:
                    findings.append(
                        _finding(
                            "FIGURE_POINT_UNRESOLVED",
                            where,
                            "This coordinate resolves to no node, so the point was drawn from a number the "
                            "package does not carry.",
                        )
                    )
                    continue
                source = sources.get(node_hash)
                if source is None:
                    findings.append(
                        _finding(
                            "FIGURE_POINT_UNRESOLVED",
                            where,
                            f"This coordinate reads node {node_hash}, and the package does not carry it.",
                        )
                    )
                    continue
                if source.get("quantity") is None:
                    findings.append(
                        _finding(
                            "FIGURE_POINT_UNRESOLVED",
                            where,
                            f"This coordinate reads a {source.get('kind')} node, which carries no quantity.",
                        )
                    )

    artifact = figure.get("svg_artifact")
    if isinstance(artifact, Mapping):
        try:
            declared = int(str(artifact.get("byte_size")))
        except (TypeError, ValueError):
            declared = STUDY_PACKAGE_LIMITS["max_svg_bytes"] + 1
        over = _limit_finding(
            at("svg_artifact", "byte_size"),
            "declared SVG bytes",
            declared,
            STUDY_PACKAGE_LIMITS["max_svg_bytes"],
        )
        if over is not None:
            findings.append(over)

    return findings


def figure_list_findings(
    figures: Sequence[Mapping[str, Any]], section: str = "figures"
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    seen: set[Any] = set()
    for index, figure in enumerate(figures):
        if not isinstance(figure, Mapping):
            continue
        if figure.get("figure_id") in seen:
            findings.append(
                _finding(
                    "REPORT_DUPLICATE_ID",
                    study_path(section, index, "figure_id"),
                    "Two figures share this id.",
                )
            )
        seen.add(figure.get("figure_id"))
    return findings


# ----------------------------------------------------------------------- recipe

#: The runners this build is willing to see in an executable recipe.
#:
#: A recipe naming something else is a perfectly good record of a manual
#: reproduction. What it is not is an instruction anything here will follow, and
#: `RECIPE_RUNNER_NOT_APPROVED` is about that difference.
APPROVED_RUNNER_NAMES: tuple[str, ...] = ("ketqat-runner", "ketqat-engine")


def recipe_findings(
    recipe: Mapping[str, Any],
    carried_artifact_hashes: Iterable[str],
    section: str = "recipe",
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    carried = set(carried_artifact_hashes)

    if recipe.get("runner") not in APPROVED_RUNNER_NAMES:
        findings.append(
            _finding(
                "RECIPE_RUNNER_NOT_APPROVED",
                study_path(section, "runner"),
                f"This build does not approve {recipe.get('runner')!r} for automatic execution. Approved "
                f"runners: {', '.join(APPROVED_RUNNER_NAMES)}.",
            )
        )

    seen: set[str] = set()
    for key in ("input_refs", "expected_output_refs"):
        for index, ref in enumerate(recipe.get(key) or []):
            if not isinstance(ref, Mapping):
                continue
            scoped = f"{key}:{ref.get('name')}"
            if scoped in seen:
                findings.append(
                    _finding(
                        "RECIPE_ARTIFACT_UNRESOLVED",
                        study_path(section, key, index, "name"),
                        f"The recipe names {ref.get('name')!r} twice in {key}.",
                    )
                )
            seen.add(scoped)
            resolution = ref.get("resolution") or {}
            if resolution.get("kind") != "INLINE_IN_BUNDLE":
                continue
            if ref.get("content_hash") in carried:
                continue
            findings.append(
                _finding(
                    "RECIPE_ARTIFACT_UNRESOLVED",
                    study_path(section, key, index, "content_hash"),
                    f"The recipe says {ref.get('name')!r} travels inside this package, and no artifact in it "
                    "has that hash.",
                )
            )
    return findings


# ----------------------------------------------------------------- check ledger


def check_ledger_summary(entries: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """What the ledger adds up to, without collapsing what it says.

    `required_checks_passed` is deliberately not "no failures": a required check
    that did not run has not passed, and a summary counting only failures would
    report an unchecked study as clean.
    """
    passed = failed = not_run = inconclusive = 0
    required_passed = True
    for entry in entries:
        status = entry.get("status") if isinstance(entry, Mapping) else None
        if status == "PASS":
            passed += 1
        elif status == "FAIL":
            failed += 1
        elif status == "NOT_RUN":
            not_run += 1
        else:
            inconclusive += 1
        if isinstance(entry, Mapping) and entry.get("requirement") == "REQUIRED" and status != "PASS":
            required_passed = False
    return {
        "total": len(entries),
        "passed": passed,
        "failed": failed,
        "not_run": not_run,
        "inconclusive": inconclusive,
        "required_checks_passed": required_passed,
    }


def check_ledger_findings(
    entries: Sequence[Mapping[str, Any]], section: str = "check_ledger"
) -> list[dict[str, str]]:
    """What is wrong with the ledger itself, as distinct from what it says.

    A `FAIL` is not a finding: the ledger is the record of what happened, and a
    study with a failing optional check reported honestly.
    """
    findings: list[dict[str, str]] = []
    seen: dict[Any, int] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, Mapping):
            continue
        first = seen.get(entry.get("check_id"))
        if first is not None:
            findings.append(
                _finding(
                    "CHECK_LEDGER_DUPLICATE_ID",
                    study_path(section, index, "check_id"),
                    f"This check is recorded twice, first at index {first}. A ledger with two entries for one "
                    "check has two answers about it.",
                )
            )
            continue
        seen[entry.get("check_id")] = index
    return findings


def absent_required_checks(
    entries: Sequence[Mapping[str, Any]],
    required: Sequence[str],
    section: str = "check_ledger",
) -> list[dict[str, str]]:
    present = {entry.get("check_id") for entry in entries if isinstance(entry, Mapping)}
    return [
        _finding(
            "CHECK_LEDGER_REQUIRED_CHECK_ABSENT",
            study_path(section),
            f"The check {check_id!r} is required here and the ledger does not mention it. An absent check is "
            "not a passing one.",
        )
        for check_id in required
        if check_id not in present
    ]


# ---------------------------------------------------------------------- bundles

#: The record kinds whose values come out of a resource intelligence bundle.
BUNDLE_DERIVED_RECORD_KINDS = frozenset(
    {
        "resource_intelligence_bundle",
        "resource_estimate_snapshot",
        "advantage_threshold",
        "decision_assessment",
        "resource_scenario",
        "quantum_workload",
        "classical_baseline",
        "hardware_model_snapshot",
        "qec_model_snapshot",
        "economic_model",
    }
)

_BUNDLE_FIELD_PART = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)((?:\[[0-9]+\])*)$")
_BUNDLE_FIELD_INDEX = re.compile(r"\[([0-9]+)\]")


def resolve_bundle_field(document: Any, field_path: str) -> Any:
    """A value inside a bundle, or a sentinel absence.

    Own keys only and no attribute walk: a path of ``constructor`` would
    otherwise resolve on objects nobody wrote and report a claim as grounded in a
    field that does not exist.

    ``fullmatch`` rather than ``match``, for the reason spelled out in
    `study_values.py`: Python's ``$`` also matches just before a trailing
    newline, so ``"estimates\\n"`` matched this anchored pattern here and did not
    match the identical pattern in `resolveBundleField` in src/study/bundles.ts.
    A claim whose ``field_path`` carried a stray newline therefore resolved in
    this language and did not resolve in the other, and the two verifiers
    disagreed about whether the claim was grounded -- which is the one thing a
    second implementation exists to prevent.
    """
    current = document
    for part in field_path.split("."):
        match = _BUNDLE_FIELD_PART.fullmatch(part)
        if match is None or not isinstance(current, Mapping) or match.group(1) not in current:
            return None
        current = current[match.group(1)]
        for index in _BUNDLE_FIELD_INDEX.findall(match.group(2) or ""):
            if not isinstance(current, list):
                return None
            position = int(index)
            if position >= len(current):
                return None
            current = current[position]
    return current


def resolve_bundles(
    refs: Sequence[Mapping[str, Any]],
    schema_version: str,
    supplied: Mapping[str, Any] | None = None,
    distribution: str = "ONLINE",
    section: str = "bundle_refs",
) -> tuple[dict[str, Any], list[dict[str, str]], bool]:
    """Resolve every bundle the package references.

    **This does not recompute a bundle's science.** `verifyBundle` in the
    TypeScript SDK rebuilds a bundle's estimates, thresholds and assessments from
    its own stored inputs; ADR 0010 withholds that from this language on purpose,
    because a second implementation of one model disagrees with the first at the
    third decimal place and nobody can say which is right. So `science_recomputed`
    is always False in the result this module returns, and the value says so
    rather than the docstring alone.
    """
    supplied = supplied or {}
    findings: list[dict[str, str]] = []
    bundles: dict[str, Any] = {}
    resolved = True

    for index, ref in enumerate(refs):
        if not isinstance(ref, Mapping):
            continue
        path = study_path(section, index)
        embedded = ref.get("embedded")

        if isinstance(embedded, Mapping):
            document, decode_findings = _decode_embedded_bundle(
                embedded, schema_version, f"{path}.embedded"
            )
            if document is None:
                findings.extend(decode_findings)
                resolved = False
                continue
        elif distribution == "OFFLINE_EXPORT":
            findings.append(
                _finding(
                    "OFFLINE_EXPORT_BUNDLE_NOT_EMBEDDED",
                    f"{path}.embedded",
                    "This package calls itself an offline export and references a bundle without carrying it.",
                )
            )
            resolved = False
            continue
        else:
            if ref.get("reproducibility_hash") not in supplied:
                findings.append(
                    _finding(
                        "BUNDLE_UNRESOLVED",
                        f"{path}.reproducibility_hash",
                        f"Bundle {ref.get('reproducibility_hash')} is neither carried by this package nor "
                        "supplied to the verifier.",
                    )
                )
                resolved = False
                continue
            document = supplied[ref["reproducibility_hash"]]

        kind = document.get("bundle_kind") if isinstance(document, Mapping) else None
        if kind != ref.get("bundle_kind"):
            findings.append(
                _finding(
                    "BUNDLE_KIND_MISMATCH",
                    f"{path}.bundle_kind",
                    f"The reference says {ref.get('bundle_kind')!r} and the document says {kind!r}.",
                )
            )
            resolved = False
            continue

        recorded = document.get("reproducibility_hash") if isinstance(document, Mapping) else None
        if recorded != ref.get("reproducibility_hash"):
            findings.append(
                _finding(
                    "BUNDLE_HASH_MISMATCH",
                    f"{path}.reproducibility_hash",
                    f"The reference names {ref.get('reproducibility_hash')} and the document carries "
                    f"{recorded!r}.",
                )
            )
            resolved = False
            continue

        bundles[str(ref["reproducibility_hash"])] = document

    return bundles, findings, resolved


def _decode_embedded_bundle(
    embedded: Mapping[str, Any], schema_version: str, path: str
) -> tuple[Any, list[dict[str, str]]]:
    try:
        data = base64.b64decode(str(embedded.get("base64", "")), validate=True)
    except (binascii.Error, ValueError):
        return None, [
            _finding(
                "BUNDLE_UNRESOLVED",
                f"{path}.base64",
                "The embedded bundle is not standard base64 with no line breaks.",
            )
        ]

    over = _limit_finding(
        f"{path}.byte_size",
        "embedded bundle bytes",
        len(data),
        STUDY_PACKAGE_LIMITS["max_embedded_bundle_bytes"],
    )
    if over is not None:
        return None, [over]

    if str(len(data)) != embedded.get("byte_size"):
        return None, [
            _finding(
                "BUNDLE_HASH_MISMATCH",
                f"{path}.byte_size",
                f"The embedded bundle decodes to {len(data)} bytes and the record says "
                f"{embedded.get('byte_size')}.",
            )
        ]

    digest = artifact_hash("research_package", data, schema_version)
    if digest != embedded.get("content_hash"):
        return None, [
            _finding(
                "BUNDLE_HASH_MISMATCH",
                f"{path}.content_hash",
                f"The embedded bundle's bytes hash to {digest} and the record claims "
                f"{embedded.get('content_hash')}.",
            )
        ]

    try:
        return json.loads(data.decode("utf-8")), []
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [
            _finding(
                "BUNDLE_UNRESOLVED",
                f"{path}.base64",
                f"The embedded bundle's bytes are not JSON: {error}.",
            )
        ]


def bundle_field_findings(
    fields: Sequence[Mapping[str, Any]],
    bundles: Mapping[str, Any],
    declared: Iterable[str],
    path: str,
) -> list[dict[str, str]]:
    """Whether each named bundle field exists in the bundle it names.

    Two different absences, and only one of them is this claim's fault. A bundle
    the package never references is a citation of something the file does not
    admit to using. A bundle the package does reference and this caller could not
    obtain is already reported once, by `bundles_resolve`.
    """
    declared_set = set(declared)
    findings: list[dict[str, str]] = []
    for index, field in enumerate(fields):
        if not isinstance(field, Mapping):
            continue
        bundle_hash = field.get("bundle_hash")
        if bundle_hash not in declared_set:
            findings.append(
                _finding(
                    "BUNDLE_UNRESOLVED",
                    f"{path}[{index}].bundle_hash",
                    f"This claim reads bundle {bundle_hash}, and the package does not reference it in "
                    "bundle_refs.",
                )
            )
            continue
        document = bundles.get(str(bundle_hash))
        if document is None:
            continue
        if resolve_bundle_field(document, str(field.get("field_path", ""))) is not None:
            continue
        findings.append(
            _finding(
                "BUNDLE_FIELD_UNRESOLVED",
                f"{path}[{index}].field_path",
                f"The bundle carries nothing at {field.get('field_path')!r}.",
            )
        )
    return findings


# ------------------------------------------------------------------- the graph


def _nodes_by_hash(nodes: Sequence[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    index: dict[str, Mapping[str, Any]] = {}
    for node in nodes:
        if not isinstance(node, Mapping):
            continue
        recorded = node.get("content_hash")
        if isinstance(recorded, str) and recorded not in index:
            index[recorded] = node
    return index


def record_integrity_findings(package: Mapping[str, Any]) -> list[dict[str, str]]:
    """Records whose stated identity is not the identity of their contents.

    A node *is* its hash here, so a node claiming a hash its contents do not
    produce is not the node any cell, edge or report segment naming that hash
    refers to.
    """
    findings: list[dict[str, str]] = []
    for kind, section in (
        ("evidence_node", "nodes"),
        ("evidence_edge", "edges"),
        ("review_record", "reviews"),
        ("reproduction_record", "reproductions"),
    ):
        for index, record in enumerate(package.get(section) or []):
            if not isinstance(record, Mapping):
                continue
            expected = study_self_hash(kind, record)
            if expected == record.get("content_hash"):
                continue
            findings.append(
                _finding(
                    "STUDY_RECORD_NOT_HASHABLE",
                    study_path(section, index, "content_hash"),
                    f"This {kind} states hash {record.get('content_hash')} and its own contents canonicalize "
                    f"to {expected}.",
                )
            )
    return findings


def edge_endpoint_findings(
    nodes: Sequence[Mapping[str, Any]], edges: Sequence[Mapping[str, Any]]
) -> list[dict[str, str]]:
    """Edges whose endpoints are not nodes this package carries."""
    carried = {
        node.get("content_hash") for node in nodes if isinstance(node, Mapping)
    }
    findings: list[dict[str, str]] = []
    for index, edge in enumerate(edges):
        if not isinstance(edge, Mapping):
            continue
        for side in ("from_node_hash", "to_node_hash"):
            if edge.get(side) in carried:
                continue
            findings.append(
                _finding(
                    "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                    study_path("edges", index, side),
                    f"This {edge.get('kind')} edge names node {edge.get(side)}, and the package does not carry "
                    "it.",
                )
            )
    return findings


_PROVENANCE_EDGE_KINDS = ("derived_from", "used_input")


def _grounds_a_chain(node: Mapping[str, Any]) -> bool:
    rule = _GROUND_RULES.get(str(node.get("kind")))
    if rule == "always":
        return True
    if rule == "never":
        return False
    quantity = node.get("quantity")
    return isinstance(quantity, Mapping) and quantity.get("value") is None


def _provenance_parents(
    node: Mapping[str, Any], edges: Sequence[Mapping[str, Any]]
) -> list[str]:
    """The edges a provenance walk follows out of one node.

    From a claim the walk goes *backwards* along `supports`: evidence points at
    the claim. From anything else it goes forwards along `derived_from` and
    `used_input`. `used_model` is deliberately not followed -- a `model_ref` never
    grounds a chain, so following it can only add steps that end in nothing.
    """
    if node.get("kind") == "claim":
        return [
            str(edge.get("from_node_hash"))
            for edge in edges
            if isinstance(edge, Mapping)
            and edge.get("kind") == "supports"
            and edge.get("to_node_hash") == node.get("content_hash")
        ]
    return [
        str(edge.get("to_node_hash"))
        for edge in edges
        if isinstance(edge, Mapping)
        and edge.get("kind") in _PROVENANCE_EDGE_KINDS
        and edge.get("from_node_hash") == node.get("content_hash")
    ]


def claim_is_grounded(
    index: Mapping[str, Mapping[str, Any]],
    edges: Sequence[Mapping[str, Any]],
    claim_hash: str,
) -> bool:
    """Whether a claim's supporting tree terminates in evidence.

    One direct `supports` edge is not grounding, and treating it as grounding is
    the failure this walk exists to close: it certifies "a result supports this
    claim" without ever asking what the result came out of, so a graph of claims
    agreeing with each other passes every local check.

    A structural traversal rather than science, which is why this language may
    make it: nothing here re-derives a value, and the rules it follows are the
    ones the TypeScript registry emits.
    """
    claim = index.get(claim_hash)
    if claim is None or claim.get("kind") != "claim":
        return False
    memo: dict[str, bool] = {}

    def walk(node_hash: str, path: tuple[str, ...]) -> bool:
        if node_hash in path:
            return False
        if node_hash in memo:
            return memo[node_hash]
        node = index.get(node_hash)
        if node is None:
            memo[node_hash] = False
            return False
        if node_hash != claim_hash and _grounds_a_chain(node):
            memo[node_hash] = True
            return True
        parents = _provenance_parents(node, edges)
        if not parents:
            memo[node_hash] = False
            return False
        grounded = False
        for parent in parents:
            if walk(parent, path + (node_hash,)):
                grounded = True
        memo[node_hash] = grounded
        return grounded

    if not _provenance_parents(claim, edges):
        return False
    return walk(claim_hash, ())


def graph_findings(
    nodes: Sequence[Mapping[str, Any]], edges: Sequence[Mapping[str, Any]]
) -> list[dict[str, str]]:
    """Graph invariants this language checks, addressed to the collection.

    `$.nodes` and `$.edges` rather than an index, and that is a statement rather
    than a shortcut: these are checks made from a subject rather than from a
    position, and a subject is a label, which two records may share. The
    collection-addressed findings are also the ones the cross-language vectors
    record separately, because the two verifiers do not cover identical sets of
    them: cycles, supersession forks and reference agreement are the TypeScript
    verifier's alone.
    """
    findings: list[dict[str, str]] = []
    index = _nodes_by_hash(nodes)

    seen_nodes: set[str] = set()
    study_refs: set[Any] = set()
    for node in nodes:
        if not isinstance(node, Mapping):
            continue
        recorded = node.get("content_hash")
        if recorded in seen_nodes:
            findings.append(
                _finding(
                    "EVIDENCE_NODE_DUPLICATE",
                    study_path("nodes"),
                    f"Node hash {recorded} appears twice. A node is identified by its content.",
                )
            )
        if isinstance(recorded, str):
            seen_nodes.add(recorded)
        study_refs.add(node.get("study_ref"))

    seen_edges: set[Any] = set()
    for edge in edges:
        if not isinstance(edge, Mapping):
            continue
        if edge.get("content_hash") in seen_edges:
            findings.append(
                _finding(
                    "EVIDENCE_EDGE_DUPLICATE",
                    study_path("edges"),
                    f"Edge {edge.get('content_hash')} appears twice.",
                )
            )
        seen_edges.add(edge.get("content_hash"))
        study_refs.add(edge.get("study_ref"))

        origin = index.get(str(edge.get("from_node_hash")))
        target = index.get(str(edge.get("to_node_hash")))
        if origin is None or target is None:
            continue
        triple = (str(origin.get("kind")), str(edge.get("kind")), str(target.get("kind")))
        if triple in _EDGE_MATRIX:
            continue
        findings.append(
            _finding(
                "EVIDENCE_EDGE_NOT_PERMITTED",
                study_path("edges"),
                f"This family defines no relation {triple[0]!r} {triple[1]!r} {triple[2]!r}.",
            )
        )

    if len(study_refs) > 1:
        findings.append(
            _finding(
                "EVIDENCE_GRAPH_STUDY_MISMATCH",
                study_path("nodes"),
                "This graph carries records from more than one study. One graph, one study.",
            )
        )

    for node in nodes:
        if not isinstance(node, Mapping) or node.get("kind") != "claim":
            continue
        claim = node.get("claim")
        if not isinstance(claim, Mapping):
            continue
        value_ref = claim.get("value_ref")
        target = (
            index.get(str(value_ref.get("node_hash"))) if isinstance(value_ref, Mapping) else None
        )
        if target is None:
            findings.append(
                _finding(
                    "EVIDENCE_NODE_UNRESOLVED",
                    study_path("nodes"),
                    f"The claim {node.get('label')!r} reads its value from a node this package does not carry.",
                )
            )
            continue
        quantity = target.get("quantity")
        if isinstance(quantity, Mapping) and quantity.get("value") is None:
            findings.append(
                _finding(
                    "CLAIM_VALUE_UNKNOWN",
                    study_path("nodes"),
                    f"The claim {node.get('label')!r} reads its value from a node whose value is unknown.",
                )
            )

    return findings


# ------------------------------------------------------------------- claim map


def _asserts_relation(edge: Any, evidence_hash: Any, claim_hash: Any) -> bool:
    """Whether one edge asserts that this evidence bears on this claim.

    `supports` is read directionally -- evidence points at the claim, never the
    other way -- because "the claim supports the measurement" is not a statement
    anyone means. `contradicts` is read both ways: a disagreement is symmetric
    however the asserter happened to orient it.

    This must stay identical to `assertsRelation` in src/study/research-package.ts.
    """
    if not isinstance(edge, Mapping):
        return False
    kind = edge.get("kind")
    origin = edge.get("from_node_hash")
    target = edge.get("to_node_hash")
    if kind == "supports":
        return origin == evidence_hash and target == claim_hash
    if kind != "contradicts":
        return False
    return (origin == evidence_hash and target == claim_hash) or (
        origin == claim_hash and target == evidence_hash
    )


def claim_map_findings(
    package: Mapping[str, Any],
    bundles: Mapping[str, Any],
    declared_bundles: Iterable[str],
) -> list[dict[str, str]]:
    """Whether the claim map, the graph and the bundles say the same thing."""
    findings: list[dict[str, str]] = []
    nodes = package.get("nodes") or []
    edges = package.get("edges") or []
    index = _nodes_by_hash(nodes)
    edge_hashes = {edge.get("content_hash") for edge in edges if isinstance(edge, Mapping)}
    claim_map = package.get("claim_evidence_map") or []
    section = "claim_evidence_map"

    entry_by_claim: dict[Any, int] = {}
    for entry_index, entry in enumerate(claim_map):
        if not isinstance(entry, Mapping):
            continue
        first = entry_by_claim.get(entry.get("claim_node_hash"))
        if first is not None:
            findings.append(
                _finding(
                    "CLAIM_MAP_DUPLICATE_ENTRY",
                    study_path(section, entry_index, "claim_node_hash"),
                    f"This claim already has an entry at index {first}.",
                )
            )
            continue
        entry_by_claim[entry.get("claim_node_hash")] = entry_index

    for node_index, node in enumerate(nodes):
        if not isinstance(node, Mapping) or node.get("kind") != "claim":
            continue
        if node.get("content_hash") not in entry_by_claim:
            findings.append(
                _finding(
                    "CLAIM_WITHOUT_EVIDENCE_NODE",
                    study_path("nodes", node_index, "content_hash"),
                    f"The claim {node.get('label')!r} has no entry in the claim evidence map, so nothing states "
                    "what it rests on.",
                )
            )
            continue
        # The graph's own answer to the question the map answers. A claim the map
        # wires up while no supports edge points at it rests on nothing however
        # confident the map is.
        # Whether an edge points at the claim, not whether its source is carried:
        # a supports edge naming a node the package lost is an unresolved
        # endpoint, reported once as such, and reporting it again here as "no
        # evidence" would be one defect and two findings.
        if any(
            isinstance(edge, Mapping)
            and edge.get("kind") == "supports"
            and edge.get("to_node_hash") == node.get("content_hash")
            for edge in edges
        ):
            continue
        findings.append(
            _finding(
                "CLAIM_WITHOUT_EVIDENCE_NODE",
                study_path("nodes", node_index, "content_hash"),
                "No supports edge in this package points at the claim, so nothing in the graph backs it.",
            )
        )

    for entry_index, entry in enumerate(claim_map):
        if not isinstance(entry, Mapping):
            continue

        def at(*parts: Any) -> str:
            return study_path(section, entry_index, *parts)

        claim_hash = entry.get("claim_node_hash")
        if claim_hash not in index:
            findings.append(
                _finding(
                    "EVIDENCE_NODE_UNRESOLVED",
                    at("claim_node_hash"),
                    "The claim evidence map names a claim node the package does not carry.",
                )
            )

        evidence = entry.get("evidence_node_hashes") or []
        if not evidence:
            findings.append(
                _finding(
                    "CLAIM_WITHOUT_EVIDENCE_NODE",
                    at("evidence_node_hashes"),
                    "This claim is listed with no evidence nodes at all.",
                )
            )
        elif not (entry.get("edge_hashes") or []):
            findings.append(
                _finding(
                    "CLAIM_EVIDENCE_UNLINKED",
                    at("edge_hashes"),
                    "This entry cites evidence and names no edge at all.",
                )
            )

        reads_bundle = False
        for hash_index, node_hash in enumerate(evidence):
            if node_hash == claim_hash:
                findings.append(
                    _finding(
                        "CLAIM_EVIDENCE_SELF_REFERENTIAL",
                        at("evidence_node_hashes", hash_index),
                        "The claim is cited as its own evidence, and restating an assertion establishes nothing.",
                    )
                )
                continue
            evidence_node = index.get(node_hash)
            if evidence_node is None:
                findings.append(
                    _finding(
                        "EVIDENCE_NODE_UNRESOLVED",
                        at("evidence_node_hashes", hash_index),
                        f"The claim is said to rest on node {node_hash}, and the package does not carry it.",
                    )
                )
                continue
            reference = evidence_node.get("reference")
            if (
                isinstance(reference, Mapping)
                and reference.get("record_kind") in BUNDLE_DERIVED_RECORD_KINDS
            ):
                reads_bundle = True
            if any(_asserts_relation(edge, node_hash, claim_hash) for edge in edges):
                continue
            findings.append(
                _finding(
                    "CLAIM_EVIDENCE_UNLINKED",
                    at("evidence_node_hashes", hash_index),
                    f"The claim is said to rest on node {node_hash}, and no edge in this package joins the two.",
                )
            )

        for hash_index, edge_hash in enumerate(entry.get("edge_hashes") or []):
            if edge_hash in edge_hashes:
                continue
            findings.append(
                _finding(
                    "EVIDENCE_EDGE_ENDPOINT_UNRESOLVED",
                    at("edge_hashes", hash_index),
                    f"The claim evidence map cites edge {edge_hash}, and no edge in this package has that hash.",
                )
            )

        bundle_fields = entry.get("bundle_fields") or []
        if reads_bundle and not bundle_fields:
            findings.append(
                _finding(
                    "CLAIM_BUNDLE_FIELD_MISSING",
                    at("bundle_fields"),
                    "This claim rests on evidence that points into a resource intelligence bundle, and it does "
                    "not say which field of which bundle it reads.",
                )
            )
        findings.extend(
            bundle_field_findings(bundle_fields, bundles, declared_bundles, at("bundle_fields"))
        )

    return findings


# -------------------------------------------------------------------- the levels


def _rules_id_finding(package: Mapping[str, Any]) -> dict[str, str] | None:
    recorded = package.get(STUDY_HASH_RULES_KEY)
    if not isinstance(recorded, str) or recorded == "":
        return _finding(
            "STUDY_HASH_RULES_ID_MISSING",
            study_path(STUDY_HASH_RULES_KEY),
            f"A study-family record must name its hash rules in {STUDY_HASH_RULES_KEY}; nothing is inferred "
            "from silence (ADR 0010).",
        )
    if recorded not in STUDY_KNOWN_HASH_RULES_IDS:
        return _finding(
            "STUDY_HASH_RULES_ID_UNKNOWN",
            study_path(STUDY_HASH_RULES_KEY),
            f"This build does not know the hash rules id {recorded!r}.",
        )
    return None


def _refused_levels() -> dict[str, Any]:
    return {
        "schema_valid": False,
        "canonicalizable": False,
        "hash_matches": False,
        "record_integrity_valid": False,
        "graph_structurally_valid": False,
        "provenance_closed": False,
        "claims_resolve": False,
        "bundles_resolve": False,
        "science_recomputed": False,
        "independent_reproduction_present": False,
        "review_present": False,
        "attestation_level": "hash_only",
    }


def derive_status(levels: Mapping[str, Any]) -> str:
    """The status these levels add up to.

    Order matters and is the whole of the function. Must stay identical to
    `deriveStudyVerificationStatus` in src/study/verification.ts.
    """
    if not levels["schema_valid"] or not levels["canonicalizable"]:
        return "REFUSED"
    structural = all(
        levels[level]
        for level in (
            "hash_matches",
            "record_integrity_valid",
            "graph_structurally_valid",
            "provenance_closed",
            "claims_resolve",
            "bundles_resolve",
        )
    )
    if not structural:
        return "STRUCTURE_UNVERIFIED"
    if not levels["science_recomputed"]:
        return "STRUCTURE_VERIFIED"
    if not levels["independent_reproduction_present"]:
        return "SCIENCE_RECOMPUTED"
    return "INDEPENDENTLY_REPRODUCED"


def not_established(levels: Mapping[str, Any]) -> list[str]:
    """What this result does not establish, in sentences a surface can render."""
    sentences = [
        "Nothing here is signed. The attestation level is hash_only: a matching digest establishes that two "
        "byte sequences are the same byte sequence, and not that anyone authorised, produced, or stands "
        "behind them.",
        "This is structural verification, not reproduction. No model was re-run: the Python verifier hashes, "
        "validates and walks structure, and ADR 0010 withholds the science from it on purpose.",
    ]
    if levels["hash_matches"]:
        sentences.append(
            "A matching hash does not mean the content is correct. A wrong number, honestly recorded and "
            "correctly hashed, verifies exactly like a right one."
        )
    if not levels["independent_reproduction_present"]:
        sentences.append(
            "No reproduction is recorded. Nothing in this package reports a second run of the work reaching "
            "the same result."
        )
    else:
        sentences.append(
            "A reproduction record reports a match. Whether the party that ran it was independent of the "
            "party that wrote the study is not a property of this file."
        )
    if not levels["review_present"]:
        sentences.append("No person recorded a review verdict on any node in this package.")
    sentences.append(
        "A verified chain is not a complete one. Reordering and splicing are detectable; truncation is not, "
        "without an anchor this file does not carry."
    )
    return sentences


def _carried_artifact_hashes(package: Mapping[str, Any]) -> set[str]:
    hashes: set[str] = set()
    for table in package.get("tables") or []:
        if isinstance(table, Mapping) and isinstance(table.get("csv_artifact"), Mapping):
            hashes.add(str(table["csv_artifact"].get("content_hash")))
    for figure in package.get("figures") or []:
        if isinstance(figure, Mapping) and isinstance(figure.get("svg_artifact"), Mapping):
            hashes.add(str(figure["svg_artifact"].get("content_hash")))
    for ref in package.get("bundle_refs") or []:
        if isinstance(ref, Mapping) and isinstance(ref.get("embedded"), Mapping):
            hashes.add(str(ref["embedded"].get("content_hash")))
    return hashes


def structural_findings(
    package: Mapping[str, Any],
    bundles: Mapping[str, Any],
    declared_bundles: Iterable[str],
    required_checks: Sequence[str] = (),
) -> list[dict[str, str]]:
    """Every reference in the package, resolved against what the package carries.

    Collected in one function so a caller checking a package gets the same
    reading whoever assembled it: by `buildResearchPackage`, by hand, by an older
    build, or by a service with its own idea of what a claim map is.
    """
    nodes = package.get("nodes") or []
    tables = package.get("tables") or []
    figures = package.get("figures") or []
    sources = _nodes_by_hash(nodes)
    cells = index_table_cells(tables)
    schema_version = str(package.get("schema_version"))

    findings = list(table_list_findings(tables))
    for index, table in enumerate(tables):
        if not isinstance(table, Mapping):
            continue
        shape = table_findings(table, sources, index)
        if shape:
            findings.extend(shape)
            continue
        findings.extend(table_csv_artifact_findings(table, sources, schema_version, index))

    findings.extend(figure_list_findings(figures))
    for index, figure in enumerate(figures):
        if isinstance(figure, Mapping):
            findings.extend(figure_findings(figure, sources, cells, index))

    findings.extend(
        report_findings(
            package.get("report") or {},
            sources,
            tables,
            figures,
            package.get("references") or [],
            package.get("limitations") or [],
        )
    )
    recipe = package.get("recipe")
    if isinstance(recipe, Mapping):
        findings.extend(recipe_findings(recipe, _carried_artifact_hashes(package)))
    findings.extend(claim_map_findings(package, bundles, declared_bundles))
    findings.extend(absent_required_checks(package.get("check_ledger") or [], required_checks))
    return findings


def verify_research_package(
    value: Mapping[str, Any],
    *,
    bundles: Mapping[str, Any] | None = None,
    required_checks: Sequence[str] = (),
    validate_schema: bool = True,
) -> dict[str, Any]:
    """Check a research package the way a recipient has to: from the file alone.

    Every level is answered separately, because they fail separately and because
    a single boolean is quoted at its strongest reading. The order is deliberate:
    the ceilings come first, because a bound applied after the recursive walk it
    was meant to bound is a bound that did nothing; then the schema, the digest,
    the records, the graph, the report, tables and figures, and the bundles.

    **This does not recompute the science**, and ``verification_performed`` says
    so in the returned value rather than only in this docstring. A caller
    rendering "verified in Python" renders that field with it.
    """
    if not isinstance(value, Mapping):
        raise TypeError(
            f"A research package must be a JSON object, not {type(value).__name__}."
        )

    levels = _refused_levels()
    ledger = check_ledger_summary(value.get("check_ledger") or [])

    def result(findings: list[dict[str, str]], expected: str = "") -> dict[str, Any]:
        status = derive_status(levels)
        return {
            "levels": levels,
            "status": status,
            "verification_performed": "INTEGRITY_AND_STRUCTURE",
            "expected_hash": expected,
            "actual_hash": value.get("reproducibility_hash"),
            "findings": findings,
            "not_established": not_established(levels),
            "check_ledger": ledger,
            "problems": [f"{item['code']} {item['path']}: {item['message']}" for item in findings],
        }

    ceilings = package_limit_findings(value)
    if ceilings:
        return result(ceilings)

    rules = _rules_id_finding(value)
    if rules is not None:
        return result([rules])

    if validate_schema:
        # Imported here rather than at module scope: `study_validation` imports
        # this module for the package checks, and a top-level import in both
        # directions is a cycle.
        from .study_validation import KetQatValidationError, validate_study_record

        try:
            validate_study_record(dict(value), "research_package")
        except KetQatValidationError as error:
            return result(
                [_finding("STUDY_RECORD_NOT_HASHABLE", study_path(), str(error))]
            )

    ledger_shape = check_ledger_findings(value.get("check_ledger") or [])
    if ledger_shape:
        return result(ledger_shape)
    levels["schema_valid"] = True

    try:
        expected = study_self_hash("research_package", value)
    except StudyHashRefusal as error:
        return result(
            [_finding("STUDY_RECORD_NOT_HASHABLE", study_path(), f"{error.code}: {error}")]
        )
    levels["canonicalizable"] = True

    findings: list[dict[str, str]] = []
    levels["hash_matches"] = value.get("reproducibility_hash") == expected
    if not levels["hash_matches"]:
        findings.append(
            _finding(
                "STUDY_RECORD_NOT_HASHABLE",
                study_path("reproducibility_hash"),
                f"The package claims {value.get('reproducibility_hash')} and its own contents canonicalize to "
                f"{expected}.",
            )
        )

    integrity = record_integrity_findings(value)
    levels["record_integrity_valid"] = not integrity
    findings.extend(integrity)

    nodes = value.get("nodes") or []
    edges = value.get("edges") or []
    endpoints = edge_endpoint_findings(nodes, edges)
    graph = graph_findings(nodes, edges)
    levels["graph_structurally_valid"] = not endpoints and not graph
    findings.extend(endpoints)
    findings.extend(graph)

    index = _nodes_by_hash(nodes)
    levels["provenance_closed"] = all(
        claim_is_grounded(index, edges, str(node.get("content_hash")))
        for node in nodes
        if isinstance(node, Mapping) and node.get("kind") == "claim"
    )

    declared_bundles = [
        str(ref.get("reproducibility_hash"))
        for ref in value.get("bundle_refs") or []
        if isinstance(ref, Mapping)
    ]
    resolved_bundles, bundle_problems, bundles_resolve = resolve_bundles(
        value.get("bundle_refs") or [],
        str(value.get("schema_version")),
        bundles,
        str(value.get("distribution", "ONLINE")),
    )
    levels["bundles_resolve"] = bundles_resolve
    # Always False here, and stated rather than implied: recomputing a bundle's
    # estimates and decisions is the TypeScript verifier's job (ADR 0010).
    levels["science_recomputed"] = False
    findings.extend(bundle_problems)

    resolution = structural_findings(value, resolved_bundles, declared_bundles, required_checks)
    levels["claims_resolve"] = not resolution and not endpoints
    findings.extend(resolution)

    carried = {node.get("content_hash") for node in nodes if isinstance(node, Mapping)}
    levels["independent_reproduction_present"] = any(
        isinstance(record, Mapping)
        and record.get("outcome") == "MATCHED"
        and record.get("original_node_hash") in carried
        and record.get("observed_node_hash") in carried
        for record in value.get("reproductions") or []
    )
    levels["review_present"] = any(
        isinstance(record, Mapping) and record.get("subject_node_hash") in carried
        for record in value.get("reviews") or []
    )

    return result(findings, expected)
