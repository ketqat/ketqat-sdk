"""IBM Quantum adapter, built on Qiskit and qiskit-ibm-runtime.

Uses IBM's own SDK rather than their REST API, so transpilation targets the
device's real basis and coupling map as Qiskit models them, and a result comes
back in the shape IBM defines rather than one reconstructed here.

**Nothing in this module submits to hardware.** Two paths exist:

* ``FakeBackend`` -- IBM's official fake backends, which carry a **snapshot of a
  real device's calibration** taken by IBM. Compiling against one is a genuine
  exercise of the device's basis, coupling map, and error rates. Executing on
  one is a simulation, recorded as ``SIMULATION``, always.

* ``QiskitRuntimeService`` -- the live service, used only to *read*: list
  backends and read their properties. Reading requires a credential, supplied as
  a call argument, and produces a not-run record when absent.

Submission to a physical device is deliberately absent, not merely unused. There
is no code path here that could spend a person's quota, so no configuration
mistake or unexpected argument can cause one. That belongs behind an explicit,
human-authorized action recorded as a separate item.

Install with::

    pip install "ketqat[ibm]"
"""

from __future__ import annotations

from typing import Any, Iterable

from .base import (
    AdapterUnavailable,
    DeviceSnapshot,
    NotRunRecord,
    ProviderResult,
    not_run,
    redact,
    utc_now,
)

PROVIDER = "ibm"

# IBM's officially published fake backends. Named explicitly rather than
# discovered by reflection, so an SDK upgrade that adds or renames one is a
# visible change here rather than a silent difference in what we claim to
# support.
KNOWN_FAKE_BACKENDS = (
    "fake_brisbane",
    "fake_kyiv",
    "fake_sherbrooke",
    "fake_torino",
)

_INSTALL_HINT = 'IBM support is an optional extra. Install it with: pip install "ketqat[ibm]"'


def _require_qiskit() -> tuple[Any, Any]:
    try:
        import qiskit  # noqa: PLC0415
        import qiskit_ibm_runtime  # noqa: PLC0415
    except ImportError as error:  # pragma: no cover - exercised by the skip path
        raise AdapterUnavailable(f"{_INSTALL_HINT} ({error})") from error
    return qiskit, qiskit_ibm_runtime


def available() -> bool:
    """Whether the IBM extra is installed.

    Callers should branch on this rather than catching ImportError, so a missing
    extra is reported as a missing extra and not as an adapter failure.
    """
    try:
        _require_qiskit()
    except AdapterUnavailable:
        return False
    return True


def _load_fake_backend(name: str) -> Any:
    _, runtime = _require_qiskit()
    from qiskit_ibm_runtime import fake_provider  # noqa: PLC0415

    # IBM names these FakeBrisbane, FakeKyiv, and so on.
    class_name = "".join(part.capitalize() for part in name.split("_"))
    backend_class = getattr(fake_provider, class_name, None)
    if backend_class is None:
        raise ValueError(
            f"{name!r} is not one of IBM's published fake backends. "
            f"Known: {', '.join(KNOWN_FAKE_BACKENDS)}."
        )
    del runtime
    return backend_class()


def snapshot_fake_backend(name: str) -> DeviceSnapshot:
    """Read one of IBM's official fake backends as a dated snapshot.

    The calibration in a fake backend is IBM's own recording of a real device at
    a point in time. That makes it a legitimate compilation target and an
    illegitimate source of measurements, which is why ``is_simulator`` is true
    and every execution against it is recorded as ``SIMULATION``.
    """
    backend = _load_fake_backend(name)
    coupling = backend.coupling_map
    edges = [tuple(edge) for edge in coupling.get_edges()] if coupling is not None else []

    return DeviceSnapshot(
        provider=PROVIDER,
        device=backend.name,
        observed_at=utc_now(),
        qubit_count=backend.num_qubits,
        basis_gates=sorted(backend.operation_names),
        coupling_map=edges,
        is_simulator=True,
        properties={"source": "qiskit_ibm_runtime.fake_provider"},
        notes=[
            "Calibration recorded by IBM for a real device at an earlier date. Compiling against "
            "it exercises the real basis and coupling map; executing against it is a simulation.",
        ],
    )


def list_backends(token: str | None = None, instance: str | None = None) -> list[str] | NotRunRecord:
    """List backends visible to an account.

    The token is a parameter and is never stored, logged, or attached to an
    error. Without one this returns a not-run record rather than falling back to
    the fake backends, because a caller asking what an account can reach must not
    be handed a list of simulators that looks like an answer.
    """
    if not token:
        return not_run(
            PROVIDER,
            "(discovery)",
            "credentials_unavailable",
            "No IBM Quantum token was supplied, so no account could be queried. "
            f"The published fake backends remain available offline: {', '.join(KNOWN_FAKE_BACKENDS)}.",
        )

    _, runtime = _require_qiskit()
    try:
        service = runtime.QiskitRuntimeService(channel="ibm_quantum_platform", token=token, instance=instance)
        return sorted(backend.name for backend in service.backends())
    except Exception as error:  # noqa: BLE001 - vendor errors are not enumerable
        # The message is redacted before it is surfaced: a vendor error can echo
        # the request, and the request carried the token.
        return not_run(
            PROVIDER,
            "(discovery)",
            "provider_unsupported_feature",
            f"IBM Quantum could not be queried: {redact(str(error))[:300]}",
        )


def transpile_for(qasm: str, backend_name: str, optimization_level: int = 1) -> dict[str, Any]:
    """Compile OpenQASM 3 to a device's basis and coupling map.

    Real work with no spend: the circuit is rewritten into the gates the device
    actually implements and routed onto its connectivity. The depth and gate
    counts this reports are the ones that would run, which is what makes a
    resource estimate against a real device meaningful.
    """
    qiskit, _ = _require_qiskit()
    from qiskit import qasm3  # noqa: PLC0415

    backend = _load_fake_backend(backend_name)
    circuit = qasm3.loads(qasm)
    before = {"depth": circuit.depth(), "size": circuit.size(), "qubits": circuit.num_qubits}

    transpiled = qiskit.transpile(circuit, backend=backend, optimization_level=optimization_level)
    after = {"depth": transpiled.depth(), "size": transpiled.size(), "qubits": transpiled.num_qubits}

    loss_report: list[dict[str, Any]] = []
    if after["depth"] > before["depth"]:
        # Named rather than presented as neutral: routing on a sparse coupling
        # map inserts SWAPs, and the added depth is error the original circuit
        # did not have.
        loss_report.append(
            {
                "kind": "routing_overhead",
                "detail": (
                    f"Depth rose from {before['depth']} to {after['depth']} routing onto "
                    f"{backend.name}'s coupling map. The added gates are additional error."
                ),
            }
        )

    return {
        "provider": PROVIDER,
        "device": backend.name,
        "before": before,
        "after": after,
        "basis_gates": sorted(backend.operation_names),
        "loss_report": loss_report,
        "qasm": qiskit.qasm3.dumps(transpiled),
        "execution_class": "SIMULATION",
    }


def run_on_fake_backend(
    qasm: str,
    backend_name: str,
    shots: int = 1024,
    seed: int | None = None,
) -> ProviderResult:
    """Execute against an official fake backend.

    Recorded as ``SIMULATION`` unconditionally. The noise model comes from a real
    device, which makes the numbers useful and does not make them measurements:
    nothing here touched a physical qubit.
    """
    qiskit, _ = _require_qiskit()
    from qiskit import qasm3  # noqa: PLC0415

    backend = _load_fake_backend(backend_name)
    snapshot = snapshot_fake_backend(backend_name)

    circuit = qasm3.loads(qasm)
    transpiled = qiskit.transpile(circuit, backend=backend, optimization_level=1)

    submitted_at = utc_now()
    run_kwargs: dict[str, Any] = {"shots": shots}
    if seed is not None:
        run_kwargs["seed_simulator"] = seed
    job = backend.run(transpiled, **run_kwargs)
    raw_counts = job.result().get_counts()
    finished_at = utc_now()

    counts = {str(key).replace(" ", ""): int(value) for key, value in dict(raw_counts).items()}

    return ProviderResult(
        provider=PROVIDER,
        device=backend.name,
        provider_job_id=str(getattr(job, "job_id", lambda: "local")()),
        shots=shots,
        counts=counts,
        # Not a parameter. A caller cannot ask this function to label its output
        # HARDWARE, because no argument reaches this field.
        execution_class="SIMULATION",
        submitted_at=submitted_at,
        finished_at=finished_at,
        snapshot=snapshot,
        notes=[
            f"Executed on IBM's published fake backend {backend.name}, which carries a recorded "
            "calibration from a real device. No physical qubit was involved.",
        ],
    )


def describe_capabilities() -> dict[str, Any]:
    """What this adapter can and cannot do, in one place.

    Written out so a caller does not have to infer the absence of hardware
    submission from the absence of a function.
    """
    return {
        "provider": PROVIDER,
        "installed": available(),
        "install_hint": _INSTALL_HINT,
        "offline_backends": list(KNOWN_FAKE_BACKENDS),
        "supports": [
            "backend discovery with an account token",
            "dated device snapshots from official fake backends",
            "transpilation to a device basis and coupling map",
            "execution against official fake backends, recorded as SIMULATION",
        ],
        "does_not_support": [
            "submitting to a physical device -- there is no code path that spends quota, so no "
            "configuration mistake can cause a submission",
        ],
        "highest_execution_class": "SIMULATION",
    }


def iter_known_backends() -> Iterable[str]:
    return iter(KNOWN_FAKE_BACKENDS)
