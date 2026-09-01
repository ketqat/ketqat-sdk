"""Verify the same study records with the Python half of the release.

A recipient of a research package is not required to own the toolchain that
wrote it. That is the whole content of ADR 0010's two-implementation rule, and
this program is the consumer-side half of it: the records were built by the npm
tarball, written to disk, and are read back here by a wheel installed from
`dist-release/` with no checkout anywhere on the path.

Three things happen, in this order.

**Validation against the shipped JSON Schemas.** ``validate_study_record``
resolves its schema through ``importlib.resources`` inside the installed
package, so a schema that exists only in a source tree fails here rather than
validating for maintainers and for nobody else -- which is the exact shape of
the packaging defect the clean room exists to catch. The resolution is asserted
before it is used.

**Verification of the capsule and the package.** Both recompute the digest from
the file's own contents; the tampered package is rejected, and rejected for the
reason that is true.

**The parity corpus.** Every record, under every purpose, digested and written
to ``digests-python.json`` for ``compare-languages.mjs``. Refusals are recorded
by code rather than dropped: two languages refusing the same projection with the
same code is a parity statement, and a corpus that skipped those cases would be
a corpus selected for agreeing.

This implementation does not recompute the science and says so in what it
returns. Nothing here re-runs an estimator or re-derives a claim.
"""

from __future__ import annotations

import json
import os
import site
import sys
from importlib import resources
from pathlib import Path

import ketqat_runner
from ketqat_runner.study_hash import (
    receipt_hash,
    record_hash,
    semantic_hash,
    study_self_hash,
    verify_study_self_hash,
)
from ketqat_runner.study_limits import StudyHashRefusal
from ketqat_runner.study_registry import STUDY_RECORD_KIND_NAMES, study_shape_document
from ketqat_runner.study_rules import STUDY_HASH_RULES_ID
from ketqat_runner.study_validation import (
    STUDY_SCHEMA_FILES,
    KetQatValidationError,
    validate_study_record,
    verify_research_package,
)

RECORDS = Path(os.environ.get("KETQAT_RECORDS", "/tmp/ketqat-records"))

_passed = 0


def must(condition: bool, message: str, detail: str | None = None) -> None:
    """Fail the program, loudly, with the reason.

    Every assertion here is a property the release must have, so there is no
    partial pass to collect and report at the end. The exit code is what the
    workflow reads.

    ``message`` states the property, and a failure prints it *negated*. An
    earlier draft printed it unchanged behind a ``FAIL:`` prefix, so a failing
    run reported the sentence that had just turned out to be false -- the same
    defect ``verify-release-artifacts.mjs`` calls out, where a note printed the
    value expected rather than the value read. ``detail`` carries the observed
    values.
    """
    global _passed
    if not condition:
        suffix = "" if detail is None else f"\n  {detail}"
        raise SystemExit(f"FAIL: this did NOT hold: {message}{suffix}")
    _passed += 1
    print(f"  ok   {message}")


def read(name: str):
    return json.loads((RECORDS / f"{name}.json").read_text(encoding="utf-8"))


# Before anything: this run's output, gone. A program that fails must not leave a
# previous run's digests behind for `compare-languages.mjs` to read as this run's
# -- which is how a run whose Python half had already failed still reported "80
# digests agree".
for stale in ("digests-python", "python-install"):
    (RECORDS / f"{stale}.json").unlink(missing_ok=True)


# ------------------------------------------------------- where this came from
#
# Asserted before anything is validated. `validation.load_schema` prefers the
# packaged copy and *falls back* to walking parent directories for a `schemas/`
# directory, which is right for a developer running out of a checkout and is
# precisely the path that would hide a wheel shipping no schemas at all. So the
# packaged copy is proved present here, and proved to be the one inside the
# install.
runner_path = Path(ketqat_runner.__file__).resolve()
site_roots = [Path(root).resolve() for root in site.getsitepackages() + [site.getusersitepackages()]]
must(
    any(root in runner_path.parents for root in site_roots),
    f"ketqat_runner is imported from the install: {runner_path}",
)

packaged_schemas = resources.files("ketqat_runner").joinpath("schemas")
missing = [name for name in STUDY_SCHEMA_FILES.values() if not packaged_schemas.joinpath(name).is_file()]
must(
    not missing,
    f"all {len(STUDY_SCHEMA_FILES)} study JSON Schemas ship inside the wheel "
    f"({Path(str(packaged_schemas)).name}/ beside {runner_path.name})",
)

must(
    len(STUDY_RECORD_KIND_NAMES) > 0
    and study_shape_document()["hash_rules_id"] == STUDY_HASH_RULES_ID,
    f"the wheel carries the shape tables for {len(STUDY_RECORD_KIND_NAMES)} record kinds "
    f"under {STUDY_HASH_RULES_ID}",
)

# Where the wheel put its copies, recorded for `compare-languages.mjs` rather
# than passed in as an environment variable a caller could get wrong. The
# comparison it enables -- the schemas in the tarball against the schemas in the
# wheel -- is the one thing neither language can state alone, and it has to be
# about the paths the installs actually resolved.
RECORDS.mkdir(parents=True, exist_ok=True)
(RECORDS / "python-install.json").write_text(
    json.dumps(
        {
            "version": ketqat_runner.__version__,
            "package_dir": str(runner_path.parent),
            "schemas_dir": str(runner_path.parent / "schemas"),
            "record_kinds": [
                {
                    "record_kind": entry["record_kind"],
                    "self_hash_field": entry["self_hash_field"],
                    "self_hash_purpose": entry["self_hash_purpose"],
                }
                for entry in study_shape_document()["record_kinds"]
            ],
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

# -------------------------------------------- validation against those schemas

SINGLE_RECORDS = [
    ("study", "study"),
    ("study_event", "study-event"),
    ("study_plan", "study-plan"),
    ("study_plan", "study-plan-revision-2"),
    ("confirmation_receipt", "confirmation-receipt"),
    ("study_task_authorization", "study-task-authorization"),
    ("task_outcome", "task-outcome"),
    ("execution_capsule", "execution-capsule"),
    ("research_package", "research-package"),
]

for kind, name in SINGLE_RECORDS:
    validate_study_record(read(name), kind)
for kind, name in (("evidence_node", "evidence-nodes"), ("evidence_edge", "evidence-edges")):
    for entry in read(name):
        validate_study_record(entry, kind)
must(
    True,
    f"{len(SINGLE_RECORDS)} records and the whole evidence graph validate against the wheel's schemas",
)

# A record naming rules this build does not know is refused rather than read
# under the rules it does know. Checked here because "close enough" is how a
# field that changed meaning gets read under its old meaning.
future = dict(read("study"))
future["hash_rules_id"] = "study-v2"
try:
    validate_study_record(future, "study")
except KetQatValidationError as error:
    must("study-v2" in str(error), "a record naming unknown hash rules is refused, not reinterpreted")
else:
    raise SystemExit("FAIL: a record naming study-v2 was accepted by a study-v1 build")

# ------------------------------------------------------------------ the capsule

capsule = read("execution-capsule")
verdict = verify_study_self_hash("execution_capsule", capsule)
must(
    verdict["valid"] and verdict["self_hash_field"] == "reproducibility_hash",
    f"the capsule's reproducibility hash recomputes in Python: {verdict['expected'][:16]}…",
    f"field {verdict['self_hash_field']} under purpose {verdict['purpose']}: "
    f"expected {verdict['expected']}, the file records {verdict['actual']}",
)
must(
    capsule["seed"] == "18446744073709551615",
    "the 64-bit seed survives Python's JSON reader as an exact decimal string",
)

# ---------------------------------------------------------- the research package

package_verdict = verify_research_package(read("research-package"))
must(
    package_verdict["levels"]["hash_matches"]
    and package_verdict["levels"]["record_integrity_valid"]
    and package_verdict["levels"]["graph_structurally_valid"]
    and package_verdict["levels"]["provenance_closed"]
    and package_verdict["levels"]["claims_resolve"]
    and package_verdict["levels"]["bundles_resolve"],
    f"the research package verifies in Python to {package_verdict['status']} "
    f"({len(package_verdict['findings'])} finding(s))",
)
must(
    package_verdict["verification_performed"] == "INTEGRITY_AND_STRUCTURE",
    f"Python reports what it did: {package_verdict['verification_performed']}",
)
must(
    package_verdict["levels"]["science_recomputed"] is False,
    "and reports that it did not recompute the science, rather than leaving it to a docstring",
)

tampered = verify_research_package(read("research-package-tampered"))
must(
    tampered["levels"]["hash_matches"] is False and tampered["status"] != "STRUCTURE_VERIFIED",
    f"the tampered package is rejected in Python too: status {tampered['status']}",
)
must(
    any(finding["path"] == "$.reproducibility_hash" for finding in tampered["findings"]),
    "and the rejection is addressed to the digest that no longer describes the file",
)

# ------------------------------------------------------------------- the corpus

CORPUS = SINGLE_RECORDS + [("research_package", "research-package-tampered")]


def digests_of(record_kind: str, record) -> dict[str, str]:
    answers = {}
    for name, compute in (
        ("self", lambda: study_self_hash(record_kind, record)),
        ("semantic", lambda: semantic_hash(record_kind, record)),
        ("record", lambda: record_hash(record_kind, record)),
        ("receipt", lambda: receipt_hash(record_kind, record)),
    ):
        try:
            answers[name] = compute()
        except StudyHashRefusal as error:
            # The code, never the message. A message is written for a reader and
            # is deliberately not a contract between the two languages.
            answers[name] = f"refused:{error.code}"
    return answers


digests = {f"{kind}/{name}": digests_of(kind, read(name)) for kind, name in CORPUS}
for kind, name in (("evidence_node", "evidence-nodes"), ("evidence_edge", "evidence-edges")):
    for index, entry in enumerate(read(name)):
        digests[f"{kind}/{name}[{index}]"] = digests_of(kind, entry)

# Stamped with the corpus these records came from, so `compare-languages.mjs`
# can refuse to compare a half computed now against a half left behind by an
# earlier run. Two halves of a parity claim computed at different times are not
# a parity claim.
corpus = read("corpus")
(RECORDS / "digests-python.json").write_text(
    json.dumps({"corpus_id": corpus["corpus_id"], "digests": digests}, indent=2) + "\n",
    encoding="utf-8",
)
must(
    len(digests) == len(CORPUS) + len(read("evidence-nodes")) + len(read("evidence-edges")),
    f"{len(digests)} records hashed under 4 purposes each, for the parity comparison",
    f"corpus {corpus['corpus_id'][:16]}… over {len(corpus['records'])} files",
)

print(f"\n{_passed} check(s) passed: the Python contracts, from the installed wheel", file=sys.stdout)
