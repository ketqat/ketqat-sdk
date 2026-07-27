"""Provider adapter tests.

These run against the vendors' **own** local and fake facilities, so they
exercise the real SDKs rather than a stand-in written here. Nothing in this file
can submit a paid task or reach a physical device.

The cases that matter most are the ones asserting what the adapters *cannot* do.
An adapter that quietly mislabels a simulation as a measurement is worse than
one that fails, because the number survives into a figure and a citation.
"""

from __future__ import annotations

import pytest

from ketqat_runner.providers import NotRunRecord, redact
from ketqat_runner.providers import braket as braket_adapter
from ketqat_runner.providers import ibm as ibm_adapter

BELL_QISKIT = """OPENQASM 3.0;
include "stdgates.inc";
qubit[2] q;
bit[2] c;
h q[0];
cx q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
"""

BELL_BRAKET = """OPENQASM 3.0;
qubit[2] q;
bit[2] c;
h q[0];
cnot q[0], q[1];
c[0] = measure q[0];
c[1] = measure q[1];
"""

requires_ibm = pytest.mark.skipif(not ibm_adapter.available(), reason="the ibm extra is not installed")
requires_braket = pytest.mark.skipif(
    not braket_adapter.available(), reason="the braket extra is not installed"
)


# ---------------------------------------------------------------------------
# Credential handling -- runs without either extra
# ---------------------------------------------------------------------------


def test_redaction_reaches_every_depth() -> None:
    # A traceback or a debug dump carrying a token is an ordinary accident, so
    # the defence has to be structural rather than a rule reviewers remember.
    payload = {
        "token": "ibm-secret",
        "nested": {"aws_secret_access_key": "aws-secret", "region": "us-east-1"},
        "list": [{"api_key": "k"}, {"visible": "yes"}],
    }
    cleaned = redact(payload)
    serialized = str(cleaned)

    assert "ibm-secret" not in serialized
    assert "aws-secret" not in serialized
    assert "k" != cleaned["list"][0]["api_key"]
    # Non-secret values survive, so redaction stays useful for debugging.
    assert cleaned["nested"]["region"] == "us-east-1"
    assert cleaned["list"][1]["visible"] == "yes"


def test_ibm_discovery_without_a_token_is_a_not_run_record() -> None:
    # Not an empty list, and not a fallback to the fake backends. A caller asking
    # what an account can reach must not be handed simulators that look like an
    # answer to that question.
    record = ibm_adapter.list_backends(None)
    assert isinstance(record, NotRunRecord)
    assert record.reason == "credentials_unavailable"
    assert record.status == "NOT_RUN"
    assert not hasattr(record, "counts")


def test_capabilities_state_the_absence_of_hardware_submission() -> None:
    # Written out rather than left for a reader to infer from a missing
    # function.
    for adapter in (ibm_adapter, braket_adapter):
        capabilities = adapter.describe_capabilities()
        assert capabilities["highest_execution_class"] == "SIMULATION"
        assert capabilities["does_not_support"], adapter.PROVIDER


def test_no_adapter_exposes_a_paid_submission_path() -> None:
    # The strongest available guarantee short of running one: neither module
    # defines a callable that submits to a device. If someone adds one, this
    # fails and the review is about that, not about a diff line.
    forbidden = {"submit_to_hardware", "run_on_hardware", "create_task", "submit"}
    for adapter in (ibm_adapter, braket_adapter):
        exposed = {name for name in dir(adapter) if not name.startswith("_")}
        assert not (exposed & forbidden), f"{adapter.PROVIDER} exposes {exposed & forbidden}"


def test_execution_class_is_not_a_parameter() -> None:
    # A caller must not be able to ask for a label. Checked against the
    # signatures, because a default argument would be easy to add and hard to
    # notice.
    import inspect

    for function in (
        ibm_adapter.run_on_fake_backend,
        braket_adapter.run_on_local_simulator,
    ):
        parameters = inspect.signature(function).parameters
        assert "execution_class" not in parameters, function.__qualname__


# ---------------------------------------------------------------------------
# IBM, against IBM's own fake backends
# ---------------------------------------------------------------------------


@requires_ibm
def test_ibm_snapshot_carries_a_real_topology() -> None:
    snapshot = ibm_adapter.snapshot_fake_backend("fake_brisbane")

    assert snapshot.provider == "ibm"
    assert snapshot.qubit_count == 127
    # A real device's sparse connectivity, not a fully connected placeholder.
    assert 100 < len(snapshot.coupling_map) < 127 * 126
    assert "ecr" in snapshot.basis_gates, "IBM's Eagle devices use ECR, not CX"
    assert snapshot.is_simulator is True
    assert snapshot.observed_at.endswith("+00:00")
    # The snapshot says what it is. A reader who finds this file six months from
    # now must not mistake it for a measurement of a live device.
    assert any("simulation" in note.lower() for note in snapshot.notes)


@requires_ibm
def test_ibm_transpilation_reports_routing_cost() -> None:
    # Routing onto a sparse coupling map inserts gates, and those gates are error
    # the original circuit did not have. Reporting the depth without the cost
    # would make a device look better than it is.
    report = ibm_adapter.transpile_for(BELL_QISKIT, "fake_brisbane")

    assert report["after"]["depth"] > report["before"]["depth"]
    assert report["loss_report"], "added depth must be named, not applied silently"
    assert report["loss_report"][0]["kind"] == "routing_overhead"
    assert report["execution_class"] == "SIMULATION"
    assert "ecr" in report["basis_gates"]


@requires_ibm
def test_ibm_fake_backend_run_is_labelled_simulation() -> None:
    result = ibm_adapter.run_on_fake_backend(BELL_QISKIT, "fake_brisbane", shots=512, seed=7)

    assert result.execution_class == "SIMULATION"
    assert sum(result.counts.values()) == 512
    assert result.snapshot is not None and result.snapshot.is_simulator

    # IBM's recorded noise is present: a noiseless Bell state yields only 00 and
    # 11, so seeing some 01 and 10 is evidence the device error model applied.
    # Asserted loosely, since the exact rate is IBM's to change.
    correlated = result.counts.get("00", 0) + result.counts.get("11", 0)
    assert correlated > 512 * 0.6, "the Bell correlation should dominate"
    assert correlated < 512, "a real device's error model should produce some incorrect outcomes"


@requires_ibm
def test_ibm_rejects_a_backend_it_does_not_publish() -> None:
    # Named rejection rather than a silent fallback to a default device, which
    # would attribute results to hardware the caller never asked for.
    with pytest.raises(ValueError, match="published fake backends"):
        ibm_adapter.snapshot_fake_backend("fake_not_a_real_device")


# ---------------------------------------------------------------------------
# Braket, against Amazon's own local simulator
# ---------------------------------------------------------------------------


@requires_braket
def test_braket_snapshot_says_a_simulator_has_no_topology() -> None:
    snapshot = braket_adapter.snapshot_local_simulator("braket_sv")

    assert snapshot.provider == "braket"
    assert snapshot.is_simulator is True
    assert snapshot.coupling_map == []
    assert snapshot.basis_gates, "the supported gate set should be read from the device"
    # An empty coupling map is ambiguous on its own: it could mean "no
    # connectivity constraints" or "not recorded". The note disambiguates it.
    assert any("not applicable" in note.lower() for note in snapshot.notes)


@requires_braket
def test_braket_local_run_is_labelled_simulation() -> None:
    result = braket_adapter.run_on_local_simulator(BELL_BRAKET, shots=512)

    assert result.execution_class == "SIMULATION"
    assert sum(result.counts.values()) == 512
    # The local simulator is noiseless, so only the correlated outcomes appear.
    assert set(result.counts) <= {"00", "11"}
    assert any("nothing was billed" in note for note in result.notes)


@requires_braket
def test_braket_rejects_an_unknown_simulator() -> None:
    with pytest.raises(ValueError, match="local simulator"):
        braket_adapter.run_on_local_simulator(BELL_BRAKET, simulator="not_a_simulator")


@requires_braket
def test_braket_discovery_without_credentials_is_a_not_run_record() -> None:
    # This test is only meaningful where AWS credentials are absent, which is the
    # case in CI. Where they exist the call legitimately succeeds, so the
    # assertion covers both shapes rather than failing on a configured machine.
    outcome = braket_adapter.list_devices()
    if isinstance(outcome, NotRunRecord):
        assert outcome.reason == "credentials_unavailable"
        assert "local simulators remain available" in outcome.detail
    else:
        assert isinstance(outcome, list)
