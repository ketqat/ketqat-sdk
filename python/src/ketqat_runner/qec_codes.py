"""QEC code catalog and code-to-hardware suitability (RFC 0006).

The catalog records families, their structural properties, and what a device
must be able to do to run them. Two things it deliberately does not do:

* It does not reproduce any external catalog's data or prose. Entries here are
  structural facts stated in the project's own words, with external references
  recorded as pointers rather than copied content.
* It does not emit recommendations. A code-to-hardware pairing carries an
  evidence level, and ``THEORETICALLY_SUITABLE`` is never displayed as though
  it were ``DEMONSTRATED``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: Structural families. A code may belong to several, e.g. the surface code is
#: stabilizer, CSS, and topological at once.
CODE_FAMILIES = (
    "STABILIZER",
    "CSS",
    "SUBSYSTEM",
    "TOPOLOGICAL",
    "SURFACE",
    "TORIC",
    "COLOR",
    "QUANTUM_LDPC",
    "HYPERGRAPH_PRODUCT",
    "BIVARIATE_BICYCLE",
    "CONCATENATED",
    "BOSONIC",
    "GKP",
    "CAT",
    "QUDIT",
    "ERASURE_TOLERANT",
    "APPROXIMATE",
    "FLOQUET",
)

#: How well a code/hardware pairing is supported. Ordered weakest to strongest,
#: with the negative and unknown cases kept distinct from each other.
SUITABILITY_LEVELS = (
    "UNKNOWN",
    "INCOMPATIBLE_UNDER_ASSUMPTIONS",
    "REQUIRES_NONLOCAL_CONNECTIVITY",
    "REQUIRES_FAST_FEEDFORWARD",
    "REQUIRES_LOSS_DETECTION",
    "THEORETICALLY_SUITABLE",
    "SIMULATED",
    "DEMONSTRATED",
    "COMPATIBLE",
)


@dataclass(frozen=True)
class QecCode:
    """A code family entry.

    ``requires_*`` fields are the properties a device must have. They exist so
    suitability can be *derived* from a hardware snapshot rather than asserted,
    which keeps the claim checkable.
    """

    slug: str
    name: str
    families: tuple[str, ...]
    description: str
    #: Whether syndrome extraction needs measurement partway through a circuit.
    requires_mid_circuit_measurement: bool = True
    #: Whether the code needs classical feedback within the circuit.
    requires_feed_forward: bool = False
    #: Whether it needs couplings beyond nearest neighbours on a planar grid.
    requires_nonlocal_connectivity: bool = False
    #: Whether it depends on detecting lost or leaked qubits.
    requires_loss_detection: bool = False
    #: Distances the packaged runner can actually simulate, when applicable.
    supported_distances: tuple[int, ...] = ()
    #: Stim circuit generator name, when this code is directly runnable.
    stim_generator: str | None = None
    #: External references as pointers, never copied content.
    references: tuple[str, ...] = ()
    notes: tuple[str, ...] = field(default_factory=tuple)


CATALOG: dict[str, QecCode] = {
    code.slug: code
    for code in (
        QecCode(
            slug="rotated-surface-code-memory-x",
            name="Rotated surface code (X memory)",
            families=("STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"),
            description=(
                "Planar topological code on a rotated lattice, preserving one logical qubit "
                "through repeated rounds of syndrome extraction."
            ),
            supported_distances=(3, 5, 7, 9),
            stim_generator="surface_code:rotated_memory_x",
            references=("https://errorcorrectionzoo.org/c/surface",),
            notes=("Nearest-neighbour connectivity on a two-dimensional grid is sufficient.",),
        ),
        QecCode(
            slug="rotated-surface-code-memory-z",
            name="Rotated surface code (Z memory)",
            families=("STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"),
            description="Rotated surface code memory experiment in the Z basis.",
            supported_distances=(3, 5, 7, 9),
            stim_generator="surface_code:rotated_memory_z",
            references=("https://errorcorrectionzoo.org/c/surface",),
        ),
        QecCode(
            slug="unrotated-surface-code-memory-x",
            name="Unrotated surface code (X memory)",
            families=("STABILIZER", "CSS", "TOPOLOGICAL", "SURFACE"),
            description="Unrotated surface code memory; more physical qubits per distance than the rotated layout.",
            supported_distances=(3, 5, 7),
            stim_generator="surface_code:unrotated_memory_x",
            references=("https://errorcorrectionzoo.org/c/surface",),
        ),
        QecCode(
            slug="repetition-code-memory",
            name="Repetition code (memory)",
            families=("STABILIZER", "CSS"),
            description=(
                "One-dimensional classical repetition code protecting against a single error "
                "type. Useful as a control: it is not a full quantum code."
            ),
            supported_distances=(3, 5, 7, 9, 11),
            stim_generator="repetition_code:memory",
            references=("https://errorcorrectionzoo.org/c/quantum_repetition",),
            notes=(
                "Protects against one error type only, so a low logical error rate here is not "
                "evidence of quantum error correction.",
            ),
        ),
        QecCode(
            slug="color-code-memory-xyz",
            name="Color code (XYZ memory)",
            families=("STABILIZER", "CSS", "TOPOLOGICAL", "COLOR"),
            description="Triangular color code memory, admitting transversal Clifford gates.",
            supported_distances=(3, 5, 7),
            stim_generator="color_code:memory_xyz",
            references=("https://errorcorrectionzoo.org/c/color",),
            notes=("Syndrome extraction uses weight-six stabilizers on a three-colorable lattice.",),
        ),
    )
}


def get_code(slug: str) -> QecCode:
    code = CATALOG.get(slug)
    if code is None:
        raise KeyError(f"Unknown QEC code {slug!r}. Known codes: {', '.join(sorted(CATALOG))}.")
    return code


def codes_in_family(family: str) -> list[QecCode]:
    upper = family.upper()
    return [code for code in CATALOG.values() if upper in code.families]


def assess_suitability(code: QecCode, capabilities: dict[str, Any]) -> dict[str, Any]:
    """Derive a code/hardware suitability level from a hardware snapshot.

    Derived, not asserted: every blocking requirement is listed, so the claim
    can be checked against the snapshot it came from. The result never exceeds
    ``THEORETICALLY_SUITABLE`` here, because ``SIMULATED`` and ``DEMONSTRATED``
    are claims about experiments that were actually run, not about capability
    matching, and only a recorded run may raise the level.
    """
    blockers: list[str] = []
    level = "THEORETICALLY_SUITABLE"

    if code.requires_mid_circuit_measurement and not capabilities.get("mid_circuit_measurement"):
        blockers.append("mid-circuit measurement is required for syndrome extraction")
        level = "INCOMPATIBLE_UNDER_ASSUMPTIONS"
    if code.requires_feed_forward and not capabilities.get("feed_forward"):
        blockers.append("classical feed-forward is required")
        level = "REQUIRES_FAST_FEEDFORWARD"
    if code.requires_nonlocal_connectivity and not (
        capabilities.get("all_to_all_connectivity") or capabilities.get("dynamic_connectivity")
    ):
        blockers.append("non-local connectivity is required")
        level = "REQUIRES_NONLOCAL_CONNECTIVITY"
    if code.requires_loss_detection and not (
        capabilities.get("loss_detection") or capabilities.get("erasure_conversion")
    ):
        blockers.append("loss or erasure detection is required")
        level = "REQUIRES_LOSS_DETECTION"

    return {
        "code": code.slug,
        "level": level,
        "blockers": blockers,
        "evidence": (
            "Derived from the capability fields of the supplied hardware snapshot. This is a "
            "capability match, not an experimental result: only a recorded run may raise the "
            "level to SIMULATED or DEMONSTRATED."
        ),
    }
