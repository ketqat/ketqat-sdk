"""kq.algorithms.vqe-ground-state 1.0.0: VQE over a Pauli Hamiltonian.

Wraps `ketqat_runner.vqe`: a hardware-efficient Ry + CNOT-ladder ansatz,
coordinate-descent optimisation with seeded random restarts, and the energy
reported against the exact ground energy from diagonalisation. The gap is
attributed honestly: to the ansatz when a product ansatz faces an entangled
ground state, otherwise to the optimiser.

Three Hamiltonians: the SDK's approximate H2/STO-3G testbed (whose
coefficients are explicitly not literature-accurate, see the provenance block
in the result), a transverse-field Ising chain built from its definition, or
your own list of (coefficient, Pauli string) terms.
"""

from __future__ import annotations

from typing import Any

from ...vqe import VqeError, h2_hamiltonian_approximate, pauli_hamiltonian, run_vqe
from ..params import ParameterError

MAX_QUBITS = 6
MAX_SECONDS = 30.0
#: Upper estimate of one energy evaluation: 5 us x layers x 2^qubits (measured
#: 170-800 us at 4-6 qubits and 2 layers on a 2024 laptop).
SECONDS_PER_EVALUATION_UNIT = 5e-6
PAULI_LETTERS = set("IXYZ")


def _round(value: float) -> float:
    return round(float(value), 12) + 0.0


def estimate_seconds(params: dict[str, Any]) -> float:
    qubits, layers = params["qubits"], params["layers"]
    evaluations = params["restarts"] * params["iterations"] * 2 * layers * qubits
    return evaluations * SECONDS_PER_EVALUATION_UNIT * layers * (1 << qubits)


def hamiltonian_terms(params: dict[str, Any]) -> list[tuple[float, str]]:
    kind = params["hamiltonian"]
    qubits = params["qubits"]
    if kind == "h2-approximate":
        if qubits != 2:
            raise ParameterError("hamiltonian=h2-approximate is a 2-qubit Hamiltonian; set qubits=2.")
        return [(-0.4804, "II"), (0.3435, "ZI"), (-0.4347, "IZ"), (0.5716, "ZZ"), (0.0910, "XX"), (0.0910, "YY")]
    if kind == "transverse-ising":
        coupling = 1.0 if params["ising_coupling"] is None else float(params["ising_coupling"])
        field = 1.0 if params["ising_field"] is None else float(params["ising_field"])
        terms = [(-coupling, "I" * i + "ZZ" + "I" * (qubits - i - 2)) for i in range(qubits - 1)]
        terms += [(-field, "I" * i + "X" + "I" * (qubits - i - 1)) for i in range(qubits)]
        return terms
    if params["terms"] is None:
        raise ParameterError("hamiltonian=custom needs 'terms', a list of {\"coefficient\": number, \"pauli\": string}.")
    terms = []
    for index, term in enumerate(params["terms"]):
        if set(term) != {"coefficient", "pauli"}:
            raise ParameterError(f"terms[{index}] must have exactly the keys 'coefficient' and 'pauli'; got {sorted(term)}.")
        coefficient, pauli = term["coefficient"], term["pauli"]
        if isinstance(coefficient, bool) or not isinstance(coefficient, (int, float)):
            raise ParameterError(f"terms[{index}].coefficient must be a number; got {coefficient!r}.")
        if not isinstance(pauli, str) or len(pauli) != qubits or set(pauli) - PAULI_LETTERS:
            raise ParameterError(
                f"terms[{index}].pauli must be a string of {qubits} letters from I, X, Y, Z; got {pauli!r}."
            )
        terms.append((float(coefficient), pauli))
    if not terms:
        raise ParameterError("'terms' must list at least one term.")
    return terms


def validate(params: dict[str, Any]) -> None:
    kind = params["hamiltonian"]
    if kind != "custom" and params["terms"] is not None:
        raise ParameterError("'terms' applies only to hamiltonian=custom.")
    if kind != "transverse-ising" and (params["ising_coupling"] is not None or params["ising_field"] is not None):
        raise ParameterError("'ising_coupling' and 'ising_field' apply only to hamiltonian=transverse-ising.")
    if params["qubits"] > MAX_QUBITS:
        raise ParameterError(f"qubits={params['qubits']} exceeds the {MAX_QUBITS}-qubit ceiling of this product.")
    hamiltonian_terms(params)
    seconds = estimate_seconds(params)
    if seconds > MAX_SECONDS:
        raise ParameterError(
            f"qubits={params['qubits']}, layers={params['layers']}, restarts={params['restarts']}, "
            f"iterations={params['iterations']} could take up to about {seconds:.0f} s of coordinate descent "
            f"(limit {MAX_SECONDS:.0f} s). Reduce restarts or iterations, or use fewer qubits or layers."
        )


def run(params: dict[str, Any], seed: int) -> dict[str, Any]:
    terms = hamiltonian_terms(params)
    qubits = params["qubits"]
    try:
        hamiltonian = pauli_hamiltonian(terms)
        report = run_vqe(
            hamiltonian,
            qubits,
            layers=params["layers"],
            entangling=params["entangling"],
            restarts=params["restarts"],
            iterations=params["iterations"],
            seed=seed,
        )
    except VqeError as exc:
        raise ParameterError(str(exc)) from exc

    result: dict[str, Any] = {
        "hamiltonian": {
            "kind": params["hamiltonian"],
            "qubits": qubits,
            "terms": [{"coefficient": coefficient, "pauli": pauli} for coefficient, pauli in terms],
        },
        "ansatz": {
            "form": "layers of Ry(theta) on every qubit" + (", each followed by a CNOT ladder" if params["entangling"] else " (product state, no entangling gates)"),
            "layers": params["layers"],
            "entangling": params["entangling"],
            "parameter_count": params["layers"] * qubits,
        },
        "optimizer": {
            "method": "coordinate descent with step halving",
            "restarts": params["restarts"],
            "iterations": params["iterations"],
        },
        "energy": _round(report["energy"]),
        "exact_ground_energy": _round(report["exact_ground_energy"]),
        "gap": _round(report["gap"]),
        "variational_principle_holds": bool(report["variational_principle_holds"]),
        "ground_state_entangled": bool(report["ground_state_entangled"]),
        "ansatz_can_represent_ground_state": bool(report["ansatz_can_represent_ground_state"]),
        "parameters": [_round(value) for value in report["parameters"]],
        "explanation": report["explanation"],
        "execution": "exact statevector energies; ground energy by dense diagonalisation",
    }
    if params["hamiltonian"] == "h2-approximate":
        _, provenance = h2_hamiltonian_approximate()
        result["h2_provenance"] = {
            "validated": False,
            "nuclear_repulsion_hartree": _round(provenance["nuclear_repulsion"]),
            "total_energy_hartree": _round(provenance["total"]),
            "literature_total_hartree": provenance["literature_total"],
            "discrepancy_hartree": _round(provenance["discrepancy"]),
            "within_chemical_accuracy": False,
            "note": provenance["note"],
        }
    return result
