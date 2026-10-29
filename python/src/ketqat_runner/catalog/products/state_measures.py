"""kq.qinfo.state-measures 1.0.0: entropy, entanglement and distance measures.

The state comes from a named preset or from a file the user supplies:

- `.npy`: a 1-D array (state vector) or a 2-D array (density matrix), read with
  `allow_pickle=False`.
- `.json`: `{"statevector": {"real": [...], "imag": [...]}}` or
  `{"density_matrix": {"real": [[...]], "imag": [[...]]}}` (`imag` may be
  omitted for real input).

The file's sha256 goes into the result, so a run record identifies the exact
input it measured and not only its path.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from ... import state_measures as sm
from ..params import ParameterError

ALL_MEASURES = (
    "von_neumann_entropy",
    "renyi_entropy",
    "purity",
    "reduced_entropy",
    "mutual_information",
    "concurrence",
    "negativity",
    "log_negativity",
    "fidelity",
    "trace_distance",
)
#: Measures that need a second state.
REFERENCE_MEASURES = {"fidelity", "trace_distance"}
#: Largest input file read, in bytes.
MAX_FILE_BYTES = 64 * 1024 * 1024


def _error(message: str) -> ParameterError:
    return ParameterError(message)


def validate(params: dict[str, Any]) -> None:
    preset = params["preset"]
    matrix_file = params["matrix_file"]
    if (preset is None) == (matrix_file is None):
        raise _error("Give exactly one of 'preset' and 'matrix_file'.")
    if preset == "werner" and params["werner_p"] is None:
        raise _error("preset=werner needs 'werner_p' in [0, 1].")
    if preset != "werner" and params["werner_p"] is not None:
        raise _error("'werner_p' applies only to preset=werner.")
    if preset != "ghz" and params["ghz_qubits"] is not None:
        raise _error("'ghz_qubits' applies only to preset=ghz.")
    if params["reference"] == "ideal" and matrix_file is not None and params["reference_file"] is None:
        raise _error("reference=ideal is defined only for presets. Give 'reference_file', or "
                     "reference=maximally-mixed or reference=zero.")
    if params["reference"] is not None and params["reference_file"] is not None:
        raise _error("Give at most one of 'reference' and 'reference_file'.")


def _read_array(path_text: str, label: str) -> tuple[Any, str]:
    import numpy as np

    path = Path(path_text).expanduser()
    if not path.is_file():
        raise _error(f"{label} {path_text!r} does not exist or is not a file.")
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise _error(f"{label} is {size} bytes; the limit is {MAX_FILE_BYTES}.")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    suffix = path.suffix.lower()
    if suffix == ".npy":
        import io

        try:
            array = np.load(io.BytesIO(raw), allow_pickle=False)
        except ValueError as exc:
            raise _error(f"{label} is not a NumPy array file without pickled objects: {exc}") from exc
        return np.asarray(array, dtype=np.complex128), digest
    if suffix == ".json":
        try:
            document = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise _error(f"{label} is not valid JSON: {exc}") from exc
        if not isinstance(document, dict) or len(document) != 1 or not (
            {"statevector", "density_matrix"} & set(document)
        ):
            raise _error(
                f"{label} must be an object with exactly one key, 'statevector' or "
                "'density_matrix', holding {'real': ..., 'imag': ...}."
            )
        key = next(iter(document))
        body = document[key]
        if not isinstance(body, dict) or "real" not in body or set(body) - {"real", "imag"}:
            raise _error(f"{label}: '{key}' must be an object with 'real' and optional 'imag'.")
        try:
            real = np.asarray(body["real"], dtype=np.float64)
            imag = np.asarray(body.get("imag", np.zeros_like(real)), dtype=np.float64)
        except (TypeError, ValueError) as exc:
            raise _error(f"{label}: entries must be numbers: {exc}") from exc
        if real.shape != imag.shape:
            raise _error(f"{label}: 'real' has shape {real.shape} but 'imag' has {imag.shape}.")
        expected_ndim = 1 if key == "statevector" else 2
        if real.ndim != expected_ndim:
            raise _error(f"{label}: '{key}' must be {expected_ndim}-dimensional; got shape {real.shape}.")
        return real + 1j * imag, digest
    raise _error(f"{label} must be a .npy or .json file.")


def _to_density(array: Any, label: str, tolerance: float) -> Any:
    try:
        if array.ndim == 1:
            return sm.validate_density_matrix(sm.density_matrix(array, tolerance), tolerance)
        if array.ndim == 2:
            return sm.validate_density_matrix(array, tolerance)
    except sm.StateMeasureError as exc:
        raise _error(f"{label}: {exc}") from exc
    raise _error(f"{label} must be a state vector (1-D) or a density matrix (2-D); got {array.ndim}-D.")


def _qubit_count(dimension: int) -> int | None:
    count = dimension.bit_length() - 1
    return count if count >= 1 and (1 << count) == dimension else None


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:  # noqa: ARG001 - deterministic
    import numpy as np

    tolerance = params["tolerance"]
    preset = params["preset"]
    state_info: dict[str, Any]
    ideal = None
    if preset == "bell":
        rho = sm.bell_state()
        ideal = rho
        state_info = {"source": "preset", "preset": "bell", "description": "|Phi+> = (|00> + |11>)/sqrt(2)"}
    elif preset == "ghz":
        qubits = params["ghz_qubits"] if params["ghz_qubits"] is not None else 3
        rho = sm.ghz_state(qubits)
        ideal = rho
        state_info = {"source": "preset", "preset": "ghz", "qubits": qubits,
                      "description": "(|0...0> + |1...1>)/sqrt(2)"}
    elif preset == "werner":
        p = float(params["werner_p"])
        rho = sm.werner_state(p)
        ideal = sm.singlet_state()
        state_info = {"source": "preset", "preset": "werner", "werner_p": p,
                      "description": "p |Psi-><Psi-| + (1-p) I/4"}
    else:
        array, digest = _read_array(params["matrix_file"], "matrix_file")
        rho = _to_density(array, "matrix_file", tolerance)
        state_info = {"source": "file", "sha256": digest, "kind": "statevector" if array.ndim == 1 else "density_matrix"}

    dimension = rho.shape[0]
    if params["dims"] is not None:
        try:
            dims = sm.validate_dims(params["dims"], dimension)
        except sm.StateMeasureError as exc:
            raise _error(str(exc)) from exc
    else:
        qubits = _qubit_count(dimension)
        if qubits is None:
            raise _error(f"The state has dimension {dimension}, which is not a qubit register; give 'dims'.")
        dims = [2] * qubits
    subsystem_a = params["subsystem_a"] if params["subsystem_a"] is not None else [0]
    if any(index >= len(dims) for index in subsystem_a):
        raise _error(f"'subsystem_a' {subsystem_a} refers to a subsystem beyond the {len(dims)} declared.")
    subsystem_b = [index for index in range(len(dims)) if index not in subsystem_a]
    bipartite = bool(subsystem_a) and bool(subsystem_b)

    reference = None
    reference_info: dict[str, Any] | None = None
    reference_choice = params["reference"]
    if params["reference_file"] is not None:
        array, digest = _read_array(params["reference_file"], "reference_file")
        reference = _to_density(array, "reference_file", tolerance)
        if reference.shape != rho.shape:
            raise _error(f"reference_file has dimension {reference.shape[0]}, the state has {dimension}.")
        reference_info = {"source": "file", "sha256": digest}
    else:
        if reference_choice is None:
            reference_choice = "ideal" if preset is not None else "maximally-mixed"
        if reference_choice == "ideal":
            reference = ideal
            reference_info = {"source": "ideal", "description": "the noiseless pure state of the preset"}
        elif reference_choice == "maximally-mixed":
            reference = sm.maximally_mixed(dimension)
            reference_info = {"source": "maximally-mixed", "description": "I/d"}
        else:
            reference = sm.zero_state(dimension)
            reference_info = {"source": "zero", "description": "|0...0><0...0|"}

    requested = params["measures"]
    explicit = requested is not None
    measures = list(requested) if explicit else list(ALL_MEASURES)
    values: dict[str, Any] = {}
    not_applicable: dict[str, str] = {}

    def skip(name: str, reason: str) -> None:
        if explicit:
            raise _error(f"Measure {name!r} does not apply: {reason}")
        not_applicable[name] = reason

    for name in measures:
        if name == "von_neumann_entropy":
            values[name] = sm.von_neumann_entropy(rho)
        elif name == "renyi_entropy":
            values[name] = {"alpha": params["renyi_alpha"], "value": sm.renyi_entropy(rho, params["renyi_alpha"])}
        elif name == "purity":
            values[name] = sm.purity(rho)
        elif name == "reduced_entropy":
            if not bipartite:
                skip(name, "needs a bipartition with both sides non-empty")
                continue
            values[name] = sm.von_neumann_entropy(sm.partial_trace(rho, dims, subsystem_a))
        elif name == "mutual_information":
            if not bipartite:
                skip(name, "needs a bipartition with both sides non-empty")
                continue
            values[name] = sm.mutual_information(rho, dims, subsystem_a)
        elif name == "concurrence":
            if dims != [2, 2]:
                skip(name, f"Wootters concurrence is defined for two qubits; dims are {dims}")
                continue
            values[name] = sm.concurrence(rho)
        elif name in ("negativity", "log_negativity"):
            if not bipartite:
                skip(name, "needs a bipartition with both sides non-empty")
                continue
            function = sm.negativity if name == "negativity" else sm.logarithmic_negativity
            values[name] = function(rho, dims, subsystem_a)
        elif name == "fidelity":
            values[name] = sm.fidelity(rho, reference)
        elif name == "trace_distance":
            values[name] = sm.trace_distance(rho, reference)

    eigenvalues = np.linalg.eigvalsh(rho)
    return {
        "state": state_info,
        "dimension": dimension,
        "dims": dims,
        "subsystem_a": sorted(subsystem_a),
        "subsystem_b": subsystem_b,
        "reference": reference_info if REFERENCE_MEASURES & set(values) else None,
        "measures": values,
        "not_applicable": not_applicable,
        "min_eigenvalue": float(eigenvalues[0]),
        "units": {"entropy": "bits", "log_negativity": "bits", "fidelity": "squared Uhlmann fidelity"},
        "tolerance": tolerance,
        "execution": "exact linear algebra (NumPy eigen/singular-value decompositions)",
    }

