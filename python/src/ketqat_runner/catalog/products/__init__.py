"""Implementations of the Free catalog products, keyed by product ID.

Each entry names a module (imported only when that product runs, so running
Grover never imports Stim) and the product versions it implements. A version
listed in the catalog but absent here is refused rather than run with some
other version's code.

A module provides:

- `validate(params) -> None`: checks beyond the declared input constraints
  (cross-field rules, resource ceilings). Raises `ParameterError`.
- `run(params, seed) -> dict`: the JSON-serialisable result.

Pro products are not here. Their code is delivered as a signed bundle by
`ketqat pro install` and is loaded from `$KETQAT_HOME/pro/` instead.
"""

from __future__ import annotations

import importlib
from types import ModuleType

FREE_IMPLEMENTATIONS: dict[str, tuple[str, frozenset[str]]] = {
    "kq.algorithms.grover-search": ("grover", frozenset({"1.0.0"})),
    "kq.algorithms.quantum-phase-estimation": ("phase_estimation", frozenset({"1.0.0"})),
    "kq.qec.surface-code-memory": ("surface_code", frozenset({"1.0.0"})),
    "kq.qinfo.state-measures": ("state_measures", frozenset({"1.0.0"})),
}


def implemented_versions(product_id: str) -> frozenset[str]:
    entry = FREE_IMPLEMENTATIONS.get(product_id)
    return entry[1] if entry else frozenset()


def load_implementation(product_id: str) -> ModuleType:
    module_name, _ = FREE_IMPLEMENTATIONS[product_id]
    return importlib.import_module(f"{__name__}.{module_name}")
