"""Implementations of every catalog product, keyed by product ID.

Each entry names a module (imported only when that product runs, so running
Grover never imports Stim) and the product versions it implements. A version
listed in the catalog but absent here is refused rather than run with some
other version's code.

A module provides:

- `validate(params) -> None`: checks beyond the declared input constraints
  (cross-field rules, resource ceilings). Raises `ParameterError`.
- `run(params, seed) -> dict`: the JSON-serialisable result.

Every product is free and open source and runs from this package; nothing is
downloaded, unlocked or loaded from elsewhere. The four products that were offered
as KetQat Pro until 2026-11-23 (channel analysis, surface-code threshold study,
randomized benchmarking suite, quantum volume certification) are subpackages
here. Their 1.0.0 and 1.1.0 versions are the same code, so a 1.0.0 run record
reproduces under this SDK.
"""

from __future__ import annotations

import importlib
from types import ModuleType

#: 1.0.0 was first distributed outside this repository; 1.1.0 is the identical
#: implementation released here under Apache-2.0.
_RELICENSED = frozenset({"1.0.0", "1.1.0"})

IMPLEMENTATIONS: dict[str, tuple[str, frozenset[str]]] = {
    "kq.algorithms.grover-search": ("grover", frozenset({"1.0.0"})),
    "kq.algorithms.quantum-phase-estimation": ("phase_estimation", frozenset({"1.0.0"})),
    "kq.algorithms.qaoa-maxcut": ("qaoa", frozenset({"1.0.0"})),
    "kq.algorithms.vqe-ground-state": ("vqe", frozenset({"1.0.0"})),
    "kq.algorithms.quantum-fourier-transform": ("fourier", frozenset({"1.0.0"})),
    "kq.algorithms.trotter-ising-dynamics": ("trotter", frozenset({"1.0.0"})),
    "kq.algorithms.quantum-teleportation": ("teleportation", frozenset({"1.0.0"})),
    "kq.qec.surface-code-memory": ("surface_code", frozenset({"1.0.0"})),
    "kq.qec.steane-code-fault-tolerance": ("steane", frozenset({"1.0.0"})),
    "kq.qec.repetition-code-memory": ("repetition_code", frozenset({"1.0.0"})),
    "kq.qinfo.state-measures": ("state_measures", frozenset({"1.0.0"})),
    "kq.qinfo.state-tomography": ("tomography", frozenset({"1.0.0"})),
    "kq.qinfo.channel-analysis": ("channel_analysis", _RELICENSED),
    "kq.qec.surface-code-threshold-study": ("threshold_study", _RELICENSED),
    "kq.qinfo.randomized-benchmarking-suite": ("rb_suite", _RELICENSED),
    "kq.qinfo.quantum-volume-certification": ("qv_certification", _RELICENSED),
}


def implemented_versions(product_id: str) -> frozenset[str]:
    entry = IMPLEMENTATIONS.get(product_id)
    return entry[1] if entry else frozenset()


def load_implementation(product_id: str) -> ModuleType:
    module_name, _ = IMPLEMENTATIONS[product_id]
    return importlib.import_module(f"{__name__}.{module_name}")
