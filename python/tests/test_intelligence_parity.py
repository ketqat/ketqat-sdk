from __future__ import annotations

import json
from pathlib import Path

from ketqat_runner.hashing import calculate_reproducibility_hash


FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "reproducibility"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURE_DIR / name).read_text())


def test_resource_intelligence_bundle_hashes_identically_in_both_languages() -> None:
    """The bundle a TypeScript build emitted, hashed by the Python canonicalizer.

    A resource intelligence bundle is the artifact a decision travels in
    (ketqat-sdk#236). If the two implementations disagreed about its canonical
    form, a bundle produced by the web app would fail verification by the local
    CLI, and the reproducibility claim on the report would be false.

    This is not a new hashing rule. The bundle deliberately reuses the existing
    version 2 exclusion set rather than adding fields to it -- which is why
    every timestamp inside it is called `created_at`, a key the canonicalizer
    has dropped at every level since version 1.
    """
    expected = _fixture("expected-hashes.json")
    bundle = _fixture("resource-intelligence-bundle.json")

    assert calculate_reproducibility_hash(bundle, 2) == expected["v2"]["resource_intelligence_bundle"]
    # The hash the bundle carries is the hash of the bundle: nothing was signed
    # over a payload different from the one shipped.
    assert bundle["reproducibility_hash"] == expected["v2"]["resource_intelligence_bundle"]
    assert bundle["reproducibility_hash_version"] == 2


def test_volatile_fields_do_not_change_the_bundle_hash() -> None:
    expected = _fixture("expected-hashes.json")["v2"]["resource_intelligence_bundle"]
    bundle = _fixture("resource-intelligence-bundle.json")

    volatile = {
        **bundle,
        "id": "db-row-id",
        "slug": "some-slug",
        "created_at": "2030-01-01T00:00:00.000Z",
        "updated_at": "2030-01-01T00:00:00.000Z",
        "owner_username": "someone",
        "visibility": "PRIVATE",
        "ui_metadata": {"expanded": True},
    }
    assert calculate_reproducibility_hash(volatile, 2) == expected, (
        "database identity, timestamps and presentation state must not enter the hash"
    )


def test_changing_an_assumption_changes_the_bundle_hash() -> None:
    """The converse, which is the half that makes the first one worth having.

    A hash that ignores volatile fields and *also* ignored a scientific one
    would pass the test above while being useless.
    """
    expected = _fixture("expected-hashes.json")["v2"]["resource_intelligence_bundle"]
    bundle = _fixture("resource-intelligence-bundle.json")

    changed = json.loads(json.dumps(bundle))
    changed["scenarios"][1]["hardware"]["physical_error_rate"] = 1e-4
    assert calculate_reproducibility_hash(changed, 2) != expected

    changed = json.loads(json.dumps(bundle))
    changed["classical_baseline"]["runtime"] = 1.0
    assert calculate_reproducibility_hash(changed, 2) != expected

    changed = json.loads(json.dumps(bundle))
    changed["estimates"][1]["total_physical_qubits"]["value"] = 1
    assert calculate_reproducibility_hash(changed, 2) != expected
