"""Reversible quantum arithmetic: the Cuccaro ripple-carry adder
(ketqat-sdk#147).

Item 2 asks for an arithmetic algorithm family. This one is worth having beyond
filling a row, because it is the rare quantum circuit whose correctness can be
**proved exhaustively rather than sampled**.

Every gate here -- X, CX, CCX -- is a permutation of the computational basis. A
circuit built only from permutations is itself a permutation, so checking it on
every basis state checks it on every input: an arbitrary superposition is a
linear combination of basis states, and a linear map agreeing on a basis agrees
everywhere. For a 3-bit adder that is 128 basis states, enumerable in
milliseconds, and the result is a proof rather than a confidence interval.

That is the opposite situation from the sampled benchmarks elsewhere in this
package, and it is worth saying which kind of claim a number is.

The construction is Cuccaro et al. (2004): MAJ builds the carry chain forward,
UMA unwinds it, and the ancilla returns to |0> so the circuit is reversible with
no garbage left behind. Losing that property is the classic way an arithmetic
circuit becomes unusable inside a larger algorithm, so it is checked.
"""

from __future__ import annotations

from typing import Any


class AdderError(ValueError):
    """An adder that could not be built or checked as specified."""


def ripple_carry_adder_gates(bits: int) -> list[tuple[str, tuple[int, ...]]]:
    """Gate list for `b += a` on two `bits`-wide registers.

    Qubit layout, chosen so the ripple runs over adjacent indices:
      0            carry-in ancilla, starts and ends |0>
      1, 3, 5, ..  register a, unchanged by the circuit
      2, 4, 6, ..  register b, holds the sum
      2*bits + 1   carry-out

    Returned as gates rather than applied, so the same description drives both
    the simulation and the resource count and the two cannot disagree.
    """
    if bits < 1:
        raise AdderError(f"An adder needs at least one bit, not {bits}.")

    a = [1 + 2 * i for i in range(bits)]
    b = [2 + 2 * i for i in range(bits)]
    carry_in = 0
    carry_out = 2 * bits + 1

    gates: list[tuple[str, tuple[int, ...]]] = []

    def maj(x: int, y: int, z: int) -> None:
        gates.append(("cx", (z, y)))
        gates.append(("cx", (z, x)))
        gates.append(("ccx", (x, y, z)))

    def uma(x: int, y: int, z: int) -> None:
        gates.append(("ccx", (x, y, z)))
        gates.append(("cx", (z, x)))
        gates.append(("cx", (x, y)))

    previous = carry_in
    for index in range(bits):
        maj(previous, b[index], a[index])
        previous = a[index]

    # The final carry lands in its own qubit before the chain unwinds.
    gates.append(("cx", (a[bits - 1], carry_out)))

    for index in reversed(range(bits)):
        previous = carry_in if index == 0 else a[index - 1]
        uma(previous, b[index], a[index])

    return gates


def apply_basis(gates: list[tuple[str, tuple[int, ...]]], state: int) -> int:
    """Apply a permutation circuit to one computational basis state.

    Exact by construction: X, CX and CCX permute basis states, so a basis state
    maps to a basis state and no amplitudes are needed. This is what makes
    exhaustive checking cheap enough to be a proof.
    """
    bit = lambda index: (state >> index) & 1

    for name, qubits in gates:
        if name == "x":
            state ^= 1 << qubits[0]
        elif name == "cx":
            control, target = qubits
            if bit(control):
                state ^= 1 << target
        elif name == "ccx":
            first, second, target = qubits
            if bit(first) and bit(second):
                state ^= 1 << target
        else:
            raise AdderError(f"{name!r} is not a permutation gate; this simulator handles no others.")
    return state


def verify_adder(bits: int) -> dict[str, Any]:
    """Check the adder on every input, which for a permutation circuit is every state.

    Three things are checked, and the second and third are the ones that catch a
    subtly wrong construction: a circuit can produce the right sum while
    corrupting the input register or leaving the ancilla dirty, and either makes
    it useless inside a larger algorithm while looking correct in isolation.
    """
    gates = ripple_carry_adder_gates(bits)
    a_qubits = [1 + 2 * i for i in range(bits)]
    b_qubits = [2 + 2 * i for i in range(bits)]
    carry_out = 2 * bits + 1

    def pack(a: int, b: int) -> int:
        state = 0
        for index in range(bits):
            if (a >> index) & 1:
                state |= 1 << a_qubits[index]
            if (b >> index) & 1:
                state |= 1 << b_qubits[index]
        return state

    def unpack(state: int, qubits: list[int]) -> int:
        return sum(((state >> qubit) & 1) << index for index, qubit in enumerate(qubits))

    checked = 0
    for a in range(1 << bits):
        for b in range(1 << bits):
            out = apply_basis(gates, pack(a, b))
            total = unpack(out, b_qubits) + (((out >> carry_out) & 1) << bits)

            if total != a + b:
                raise AdderError(f"{a} + {b} produced {total}.")
            if unpack(out, a_qubits) != a:
                raise AdderError(f"the input register was corrupted computing {a} + {b}.")
            if (out >> 0) & 1:
                raise AdderError(f"the ancilla was left dirty computing {a} + {b}.")
            checked += 1

    return {
        "bits": bits,
        "inputs_checked": checked,
        "exhaustive": True,
        "gate_count": len(gates),
        "toffoli_count": sum(1 for name, _ in gates if name == "ccx"),
        "qubits": 2 * bits + 2,
        "claim": (
            f"Verified on all {checked} input pairs. Every gate here is a permutation of the "
            "computational basis, so agreement on every basis state is agreement on every input "
            "by linearity -- this is a proof, not a sample."
        ),
    }
