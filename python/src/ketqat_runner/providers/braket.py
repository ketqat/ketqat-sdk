"""Amazon Braket adapter, built on the amazon-braket-sdk.

Uses Amazon's own SDK, so circuits are expressed in Braket's IR and results come
back in the shape Braket defines rather than one reconstructed here.

**Nothing in this module submits a paid task.** Two paths exist:

* ``LocalSimulator`` -- Amazon's official local simulator. It runs on this
  machine, costs nothing, and needs no AWS account. Recorded as ``SIMULATION``.

* ``AwsDevice`` -- used only to *read*: list devices and read their properties
  into a dated snapshot. Reading requires AWS credentials, which are resolved by
  boto3 from the caller's own environment and never read, stored, or logged
  here.

``AwsQuantumTask`` creation is deliberately absent, not merely unused. There is
no code path that can create a billable task, so no configuration mistake or
unexpected argument can produce one. Paid execution belongs behind an explicit,
human-authorized action recorded as a separate item.

Install with::

    pip install "ketqat[braket]"
"""

from __future__ import annotations

from typing import Any

from .base import (
    AdapterUnavailable,
    DeviceSnapshot,
    NotRunRecord,
    ProviderResult,
    not_run,
    redact,
    utc_now,
)

PROVIDER = "braket"

# Amazon's local simulators. "braket_sv" is the state-vector simulator;
# "braket_dm" is the density-matrix simulator used for noise.
LOCAL_SIMULATORS = ("braket_sv", "braket_dm")

_INSTALL_HINT = 'Braket support is an optional extra. Install it with: pip install "ketqat[braket]"'


def _require_braket() -> Any:
    try:
        import braket  # noqa: PLC0415
    except ImportError as error:  # pragma: no cover - exercised by the skip path
        raise AdapterUnavailable(f"{_INSTALL_HINT} ({error})") from error
    return braket


def available() -> bool:
    """Whether the Braket extra is installed."""
    try:
        _require_braket()
    except AdapterUnavailable:
        return False
    return True


def _circuit_from_qasm(qasm: str) -> Any:
    """Parse OpenQASM 3 through Braket's own program type.

    Braket accepts OpenQASM 3 directly, so no translation layer sits between the
    submitted text and what runs. A hand-written converter here would be a second
    dialect to keep in step with theirs.
    """
    _require_braket()
    from braket.ir.openqasm import Program  # noqa: PLC0415

    return Program(source=qasm)


def snapshot_local_simulator(name: str = "braket_sv") -> DeviceSnapshot:
    """Describe Amazon's local simulator as a dated snapshot.

    A simulator has no coupling map and no calibration, and the snapshot says so
    rather than leaving the fields empty for a reader to interpret. An empty
    coupling map could otherwise be mistaken for a fully connected device.
    """
    if name not in LOCAL_SIMULATORS:
        raise ValueError(f"{name!r} is not a Braket local simulator; expected one of {LOCAL_SIMULATORS}")

    _require_braket()
    from braket.devices import LocalSimulator  # noqa: PLC0415

    device = LocalSimulator(name)
    properties = device.properties
    action = properties.action.get("braket.ir.openqasm.program")
    supported = sorted(getattr(action, "supportedOperations", []) or []) if action else []

    return DeviceSnapshot(
        provider=PROVIDER,
        device=name,
        observed_at=utc_now(),
        qubit_count=int(getattr(properties.paradigm, "qubitCount", 0) or 0),
        basis_gates=supported,
        coupling_map=[],
        is_simulator=True,
        properties={"source": "braket.devices.LocalSimulator"},
        notes=[
            "Amazon's local simulator. It has no coupling map and no calibration, so an empty "
            "coupling map here means 'not applicable', not 'fully connected'.",
        ],
    )


def list_devices(region: str = "us-east-1") -> list[dict[str, Any]] | NotRunRecord:
    """List AWS-hosted Braket devices.

    Credentials are resolved by boto3 from the caller's own environment; this
    function neither reads nor accepts them, so there is nothing here to store or
    log. Without usable credentials it returns a not-run record rather than
    falling back to the local simulators, because a caller asking what an account
    can reach must not be handed a simulator that looks like an answer.

    Listing devices is a metadata read and creates no task, so it is not billable.
    """
    _require_braket()
    try:
        from braket.aws import AwsDevice  # noqa: PLC0415

        devices = AwsDevice.get_devices(aws_session=None)
    except Exception as error:  # noqa: BLE001 - vendor and boto3 errors are not enumerable
        return not_run(
            PROVIDER,
            "(discovery)",
            "credentials_unavailable",
            "AWS Braket could not be queried, usually because no credentials are configured in "
            f"this environment: {redact(str(error))[:300]}. The local simulators remain available "
            f"offline: {', '.join(LOCAL_SIMULATORS)}.",
        )

    del region
    return [
        {
            "arn": device.arn,
            "name": device.name,
            "status": device.status,
            "provider": device.provider_name,
            "is_simulator": "SIMULATOR" in str(device.type).upper(),
        }
        for device in devices
    ]


def snapshot_aws_device(arn: str) -> DeviceSnapshot | NotRunRecord:
    """Read an AWS-hosted device into a dated snapshot.

    A metadata read, not a task: no shots are run and nothing is billed. The
    snapshot is what makes a later result interpretable, so it is taken before
    any execution rather than reconstructed afterwards.
    """
    _require_braket()
    try:
        from braket.aws import AwsDevice  # noqa: PLC0415

        device = AwsDevice(arn)
        properties = device.properties
        paradigm = getattr(properties, "paradigm", None)
        connectivity = getattr(paradigm, "connectivity", None)
        graph = getattr(connectivity, "connectivityGraph", {}) or {}

        edges: list[tuple[int, int]] = []
        for source, targets in graph.items():
            for target in targets:
                try:
                    edges.append((int(source), int(target)))
                except (TypeError, ValueError):
                    # Some devices label qubits non-numerically. Skipped rather
                    # than coerced, and named in the notes below, because a
                    # silently dropped edge is a wrong topology.
                    continue

        action = properties.action.get("braket.ir.openqasm.program")
        supported = sorted(getattr(action, "supportedOperations", []) or []) if action else []
        is_simulator = "SIMULATOR" in str(getattr(device, "type", "")).upper()

        notes = [
            "Read from the AWS Braket device catalog without creating a task, so nothing was billed.",
        ]
        if graph and not edges:
            notes.append(
                "This device labels its qubits non-numerically, so the coupling map is empty here "
                "rather than partially converted."
            )

        return DeviceSnapshot(
            provider=PROVIDER,
            device=device.name,
            observed_at=utc_now(),
            qubit_count=int(getattr(paradigm, "qubitCount", 0) or 0),
            basis_gates=supported,
            coupling_map=edges,
            is_simulator=is_simulator,
            properties={"arn": arn, "status": str(device.status)},
            notes=notes,
        )
    except Exception as error:  # noqa: BLE001
        return not_run(
            PROVIDER,
            arn,
            "credentials_unavailable",
            f"The device could not be read: {redact(str(error))[:300]}",
        )


def run_on_local_simulator(
    qasm: str,
    shots: int = 1024,
    simulator: str = "braket_sv",
) -> ProviderResult:
    """Execute on Amazon's official local simulator.

    Recorded as ``SIMULATION`` unconditionally, and there is no argument that can
    change it. Runs on this machine, so no AWS account is involved and nothing is
    billed.
    """
    _require_braket()
    from braket.devices import LocalSimulator  # noqa: PLC0415

    if simulator not in LOCAL_SIMULATORS:
        raise ValueError(f"{simulator!r} is not a Braket local simulator; expected one of {LOCAL_SIMULATORS}")

    device = LocalSimulator(simulator)
    snapshot = snapshot_local_simulator(simulator)
    program = _circuit_from_qasm(qasm)

    submitted_at = utc_now()
    task = device.run(program, shots=shots)
    measurement = task.result().measurement_counts
    finished_at = utc_now()

    return ProviderResult(
        provider=PROVIDER,
        device=simulator,
        provider_job_id=str(getattr(task, "id", "local")),
        shots=shots,
        counts={str(key): int(value) for key, value in dict(measurement).items()},
        # Not a parameter. No argument reaches this field, so a caller cannot ask
        # this function to label a local run as hardware.
        execution_class="SIMULATION",
        submitted_at=submitted_at,
        finished_at=finished_at,
        snapshot=snapshot,
        notes=[
            f"Executed on Amazon's local {simulator} simulator on this machine. No AWS task was "
            "created and nothing was billed.",
        ],
    )


def describe_capabilities() -> dict[str, Any]:
    """What this adapter can and cannot do, in one place."""
    return {
        "provider": PROVIDER,
        "installed": available(),
        "install_hint": _INSTALL_HINT,
        "offline_backends": list(LOCAL_SIMULATORS),
        "supports": [
            "device discovery from the AWS Braket catalog, using the caller's own credentials",
            "dated device snapshots, read without creating a task",
            "execution on Amazon's local simulators, recorded as SIMULATION",
        ],
        "does_not_support": [
            "creating an AwsQuantumTask -- there is no code path that can produce a billable task, "
            "so no configuration mistake can cause one",
        ],
        "highest_execution_class": "SIMULATION",
    }
