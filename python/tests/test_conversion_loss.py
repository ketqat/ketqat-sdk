"""Cross-framework conversion loss, measured rather than declared (ketqat-sdk#210).

Item 2 requires recording loss and equivalence for framework conversion. The emitter
produced an OpenQASM 3 -> 2 loss report and `FRAMEWORK_DIALECTS` recorded which frameworks
read only 2.0, and nothing joined them -- so a conversion to pytket or PennyLane reported
nothing lost while inheriting every restriction of the older dialect.

Three of these tests exist because I got the measurement wrong first. Each records the
mistake, because every one of them produced a plausible-looking finding that was false,
and the next person probing these libraries will hit the same three.
"""

from __future__ import annotations

import pytest

from ketqat_runner.conversion_loss import (
    EMITTED_QELIB1_GATES,
    ProbeUnavailable,
    accepts_openqasm3,
    conversion_loss,
    reader_for,
    unreadable_gates,
)

FRAMEWORKS = ["qiskit", "cirq", "pytket", "pennylane"]


def _require(framework: str) -> None:
    try:
        reader_for(framework)
    except ProbeUnavailable:
        pytest.skip(f"{framework} is not installed; an absent framework is not a refusing one")


# --------------------------------------------------------------------------- mistakes


def test_qiskit_needs_its_legacy_include_path_to_find_qelib1() -> None:
    """Mistake 1: `qasm2.loads(source)` cannot resolve `qelib1.inc`.

    Called plainly it reports `'swap' is not defined in this scope` for most of the
    standard library -- which reads exactly like a portability finding and is a
    configuration error. My first probe concluded this project's emitter produced files
    Qiskit could not read. It does not.
    """
    _require("qiskit")
    from qiskit.qasm2 import LEGACY_CUSTOM_INSTRUCTIONS, LEGACY_INCLUDE_PATH, loads

    source = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nswap q[0],q[1];\n'
    with pytest.raises(Exception, match="not defined in this scope"):
        loads(source)
    # With the legacy include path it is accepted, so the refusal was never about `swap`.
    loads(source, include_path=LEGACY_INCLUDE_PATH, custom_instructions=LEGACY_CUSTOM_INSTRUCTIONS)


def test_qiskit_openqasm3_is_a_different_reader() -> None:
    """Mistake 2: probing OpenQASM 3 through the OpenQASM 2 reader.

    That fails by construction and reports a loss Qiskit does not have. The module keeps a
    separate OpenQASM 3 reader map for exactly this reason.
    """
    _require("qiskit")
    qasm3 = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n'
    from qiskit.qasm3 import loads as loads3

    loads3(qasm3)  # the OpenQASM 3 reader accepts it
    assert accepts_openqasm3("qiskit")["accepts_version_header"] is True


def test_a_single_bit_condition_compares_against_a_bool() -> None:
    """Mistake 3: `if (c[0] == 1)` is not valid OpenQASM 3 for a single bit.

    Qiskit refuses it with "conditions must be 'bit == const bool' or
    'bitarray == const int'". That refusal is about the comparison, not about single-bit
    conditions, and taking it for the latter made Qiskit look like it lacked a feature it
    has.
    """
    _require("qiskit")
    from qiskit.qasm3 import loads as loads3

    header = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\nh q[0];\nc[0] = measure q[0];\n'
    with pytest.raises(Exception, match="bit == const bool"):
        loads3(header + "if (c[0] == 1) { x q[1]; }\n")
    loads3(header + "if (c[0] == true) { x q[1]; }\n")


# ---------------------------------------------------------------------------- findings


def test_qiskit_loses_nothing_on_this_route() -> None:
    """Measured, not assumed: it reads both dialects and every gate the emitter writes."""
    _require("qiskit")
    report = conversion_loss("qiskit")
    assert report["lossless"] is True, f"unexpected losses: {report['losses']}"
    assert unreadable_gates("qiskit") == []


def test_cirq_cannot_read_cu() -> None:
    """The one gate in the emitter's set that is not universally readable.

    33 of 34 are accepted by all four readers. Reporting the other 33 as lossy would have
    been the false finding; reporting `cu` as fine would be the missed one.
    """
    _require("cirq")
    refused = unreadable_gates("cirq")
    assert "cu" in refused
    # Everything else must be readable, or the finding is much larger than one gate and
    # the emitter's gate set needs revisiting rather than annotating.
    assert set(refused) == {"cu"}, f"more than cu is unreadable: {sorted(refused)}"
    assert len(EMITTED_QELIB1_GATES) - len(refused) == 33


def test_cirq_is_lenient_about_the_version_header() -> None:
    """The hazard worth naming: it takes a 3.0 header on a file it parses as 2.0.

    So a 3.0 file using only 2.0-expressible constructs is read without complaint, which
    invites the belief that cirq supports OpenQASM 3 and that the conversion was lossless.
    Genuinely 3.0-only syntax is refused.
    """
    _require("cirq")
    report = accepts_openqasm3("cirq")
    assert report["accepts_version_header"] is True
    assert report["accepts_openqasm3_only_syntax"] is False
    assert report["lenient_about_the_header"] is True
    detail = " ".join(entry["detail"] for entry in conversion_loss("cirq")["losses"])
    assert "look like OpenQASM 3 support" in detail


@pytest.mark.parametrize("framework", ["pytket", "pennylane"])
def test_qasm2_only_frameworks_report_the_dialect_downgrade(framework: str) -> None:
    """The gap this module closes: these conversions previously reported nothing lost."""
    _require(framework)
    report = conversion_loss(framework)
    assert report["lossless"] is False
    features = {entry["feature"] for entry in report["losses"]}
    assert "openqasm3_constructs" in features
    assert report["reads"] == ["2.0"]
    # Neither takes the 3.0 header at all, unlike cirq.
    assert accepts_openqasm3(framework)["accepts_version_header"] is False


def test_pennylane_has_no_export_path() -> None:
    """A one-way conversion is loss even when nothing is dropped going in."""
    _require("pennylane")
    report = conversion_loss("pennylane")
    assert report["writes"] == []
    assert "no_export_path" in {entry["feature"] for entry in report["losses"]}


# ------------------------------------------------------------------------- properties


@pytest.mark.parametrize("framework", FRAMEWORKS)
def test_every_loss_says_how_it_was_established(framework: str) -> None:
    """`probed` was measured in this run; `recorded` is a documented dialect property.

    Without the distinction a reader cannot tell a measurement from a note somebody typed,
    which is the whole difference this module exists to make.
    """
    _require(framework)
    for entry in conversion_loss(framework)["losses"]:
        assert entry["basis"] in {"probed", "recorded"}
        assert entry["detail"].strip()
        assert entry["feature"].strip()


def test_lossless_is_a_measured_claim_not_a_default() -> None:
    """An unknown framework raises rather than returning a clean report.

    Returning `lossless: True` for something never probed would be the worst possible
    default: silence that reads as a guarantee.
    """
    with pytest.raises(ValueError, match="No OpenQASM reader recorded"):
        conversion_loss("nonesuch")
