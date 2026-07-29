"""Variational quantum eigensolver over Pauli Hamiltonians (ketqat-sdk#155).

Item 2's chemistry family. What ships here is the **algorithm**, verified
rigorously; the molecular constants are deliberately not claimed as literature
values, and the reason is recorded below rather than buried.

What is verified, and how
------------------------
VQE minimises <psi(theta)|H|psi(theta)> over a parameterised state. For a small
H the true ground energy is available by exact diagonalisation, so convergence
is measured against truth rather than against a previous run.

More importantly the **variational principle** -- E(theta) >= E_0 for every
theta -- is a theorem, not a tolerance. It cannot be violated by any correct
implementation, on any Hamiltonian, at any parameter value. That makes it an
unusually strong test: it is checked over random Hermitian Hamiltonians and
random parameters, and a single violation anywhere would prove the expectation
value or the state preparation wrong.

The ansatz is treated as a first-class limitation rather than a detail. A
product ansatz cannot represent an entangled state, so on a Hamiltonian whose
ground state is entangled it converges to something strictly above E_0 no matter
how well it is optimised. That gap is reported as an ansatz limitation, not as
optimiser noise -- confusing the two is how VQE results get overstated.

What is **not** claimed
-----------------------
An H2/STO-3G Hamiltonian is included as a testbed, and its coefficients are
approximate. Checked against the literature ground-state energy of about
-1.1373 Ha, this Hamiltonian's electronic energy plus nuclear repulsion 1/R
lands ~6 mHa away. Chemical accuracy is 1.6 mHa, so **these coefficients are
roughly four times too coarse to call a chemistry result.** They are fine for
exercising and testing the algorithm, which is what they are used for.

So this module claims a correct VQE, not a validated H2 curve. Publishing an
energy curve requires coefficients from a verified electronic-structure source,
which is an external dependency rather than something to approximate from
memory.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

_I = np.eye(2, dtype=complex)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
_Z = np.array([[1, 0], [0, -1]], dtype=complex)
_PAULI = {"I": _I, "X": _X, "Y": _Y, "Z": _Z}

#: Hartree. One kcal/mol, the accuracy a computed energy must reach to be
#: chemically meaningful.
CHEMICAL_ACCURACY = 0.0016

BOHR_PER_ANGSTROM = 1 / 0.529177210903


class VqeError(ValueError):
    """A VQE run that could not be set up or checked as specified."""


def pauli_hamiltonian(terms: Sequence[tuple[float, str]]) -> np.ndarray:
    """Build H from (coefficient, Pauli string) pairs, e.g. (0.5, "XZ")."""
    if not terms:
        raise VqeError("A Hamiltonian needs at least one term.")
    width = len(terms[0][1])
    size = 1 << width
    hamiltonian = np.zeros((size, size), dtype=complex)
    for coefficient, string in terms:
        if len(string) != width:
            raise VqeError(f"Pauli string {string!r} has length {len(string)}, expected {width}.")
        operator = np.array([[1.0 + 0j]])
        for letter in string:
            if letter not in _PAULI:
                raise VqeError(f"{letter!r} is not a Pauli operator; expected one of I, X, Y, Z.")
            operator = np.kron(operator, _PAULI[letter])
        hamiltonian += coefficient * operator
    return hamiltonian


def h2_hamiltonian_approximate() -> tuple[np.ndarray, dict[str, Any]]:
    """A 2-qubit H2/STO-3G-shaped Hamiltonian, with its accuracy stated.

    Returned together with a provenance record rather than bare, because a bare
    matrix invites being read as a validated molecular Hamiltonian. It is not:
    see the module docstring. Use it to exercise VQE, not to report chemistry.
    """
    terms = [
        (-0.4804, "II"),
        (0.3435, "ZI"),
        (-0.4347, "IZ"),
        (0.5716, "ZZ"),
        (0.0910, "XX"),
        (0.0910, "YY"),
    ]
    hamiltonian = pauli_hamiltonian(terms)
    electronic = float(np.linalg.eigvalsh(hamiltonian)[0])
    nuclear = 1 / (0.735 * BOHR_PER_ANGSTROM)
    literature = -1.1373
    return hamiltonian, {
        "electronic_ground_energy": electronic,
        "nuclear_repulsion": nuclear,
        "total": electronic + nuclear,
        "literature_total": literature,
        "discrepancy": abs(electronic + nuclear - literature),
        "within_chemical_accuracy": abs(electronic + nuclear - literature) < CHEMICAL_ACCURACY,
        "validated": False,
        "note": (
            "Approximate coefficients. The total lands about 6 mHa from the literature value, "
            f"roughly four times chemical accuracy ({CHEMICAL_ACCURACY} Ha). Suitable for testing the "
            "algorithm; not suitable for reporting a chemistry result. A published energy curve needs "
            "coefficients from a verified electronic-structure calculation."
        ),
    }


def ansatz_state(parameters: Sequence[float], qubits: int, *, entangling: bool = True) -> np.ndarray:
    """Hardware-efficient ansatz: a layer of Ry, optionally then a CNOT ladder.

    `entangling=False` is not a degraded option but a different hypothesis
    class: without the ladder the state is a product state, and no optimiser can
    make a product state reach an entangled target. Keeping it available is what
    lets that limitation be demonstrated instead of asserted.
    """
    layers, remainder = divmod(len(parameters), qubits)
    if remainder or layers < 1:
        raise VqeError(f"{len(parameters)} parameters do not divide into layers of {qubits} qubits.")

    size = 1 << qubits
    state = np.zeros(size, dtype=complex)
    state[0] = 1.0

    for layer in range(layers):
        for qubit in range(qubits):
            angle = parameters[layer * qubits + qubit]
            cos_a, sin_a = math.cos(angle / 2), math.sin(angle / 2)
            stride = 1 << qubit
            for block in range(0, size, stride << 1):
                lo = slice(block, block + stride)
                hi = slice(block + stride, block + 2 * stride)
                a, b = state[lo].copy(), state[hi].copy()
                state[lo] = cos_a * a - sin_a * b
                state[hi] = sin_a * a + cos_a * b

        if entangling:
            for control in range(qubits - 1):
                target = control + 1
                new = state.copy()
                for index in range(size):
                    if (index >> control) & 1:
                        new[index ^ (1 << target)] = state[index]
                state = new

    return state


def energy(parameters: Sequence[float], hamiltonian: np.ndarray, qubits: int, *, entangling: bool = True) -> float:
    """<psi(theta)|H|psi(theta)>, which the variational principle bounds below by E_0."""
    state = ansatz_state(parameters, qubits, entangling=entangling)
    return float(np.real(np.vdot(state, hamiltonian @ state)))


def exact_ground_energy(hamiltonian: np.ndarray) -> float:
    """E_0 by exact diagonalisation -- the truth VQE is measured against."""
    return float(np.linalg.eigvalsh(hamiltonian)[0])


def ground_state_is_entangled(hamiltonian: np.ndarray, qubits: int) -> bool:
    """Whether E_0's eigenvector is entangled, by Schmidt rank across the first cut.

    Decides whether a product ansatz *can* succeed, so that a shortfall can be
    attributed to the ansatz rather than to the optimiser.
    """
    _, vectors = np.linalg.eigh(hamiltonian)
    matrix = vectors[:, 0].reshape(2, 1 << (qubits - 1))
    return bool(np.linalg.svd(matrix, compute_uv=False)[1] > 1e-9)


def run_vqe(
    hamiltonian: np.ndarray,
    qubits: int,
    *,
    layers: int = 2,
    entangling: bool = True,
    restarts: int = 12,
    iterations: int = 400,
    seed: int = 0,
) -> dict[str, Any]:
    """Minimise the energy, and say honestly why any gap remains.

    Multiple random restarts because the landscape is non-convex: a single run
    reports where it happened to land. Coordinate descent rather than a gradient
    method, so no derivative approximation enters the number being reported.
    """
    if layers < 1:
        raise VqeError(f"An ansatz needs at least one layer, not {layers}.")
    rng = np.random.default_rng(seed)
    exact = exact_ground_energy(hamiltonian)
    count = layers * qubits

    best = math.inf
    best_parameters = np.zeros(count)
    for _ in range(restarts):
        parameters = rng.uniform(0, 2 * math.pi, count)
        current = energy(parameters, hamiltonian, qubits, entangling=entangling)
        step = math.pi / 4
        for _iteration in range(iterations):
            improved = False
            for index in range(count):
                for direction in (+1, -1):
                    trial = parameters.copy()
                    trial[index] += direction * step
                    value = energy(trial, hamiltonian, qubits, entangling=entangling)
                    if value < current - 1e-14:
                        parameters, current, improved = trial, value, True
                        break
            if not improved:
                step /= 2
                if step < 1e-9:
                    break
        if current < best:
            best, best_parameters = current, parameters

    gap = best - exact
    entangled_target = ground_state_is_entangled(hamiltonian, qubits)

    if gap < 1e-8:
        explanation = "Converged to the exact ground energy."
    elif not entangling and entangled_target:
        explanation = (
            "The ansatz cannot reach this ground state. It is entangled and this ansatz prepares only "
            "product states, so the gap is a limit of the hypothesis class, not of the optimiser -- "
            "more iterations cannot close it."
        )
    else:
        explanation = (
            "Did not reach the exact ground energy. The ansatz is expressive enough in principle, so "
            "this is an optimisation failure -- a non-convex landscape, not a representational limit."
        )

    return {
        "energy": best,
        "exact_ground_energy": exact,
        "gap": gap,
        # Never negative for a correct implementation: the variational principle
        # forbids it. Reported so a violation is visible rather than absorbed.
        "variational_principle_holds": gap >= -1e-9,
        "ansatz_can_represent_ground_state": entangling or not entangled_target,
        "ground_state_entangled": entangled_target,
        "parameters": best_parameters.tolist(),
        "restarts": restarts,
        "explanation": explanation,
    }
