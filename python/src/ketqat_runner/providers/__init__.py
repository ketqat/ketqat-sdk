"""Provider adapters (ADR 0004).

Each adapter translates a circuit to a vendor's representation, describes the
device as a dated snapshot, and normalizes results. Every one is behind an
optional extra so the base install stays small and so a machine without a
vendor SDK gets a clear message instead of an import error deep in a call
stack.

Three rules bind every adapter here, and they are enforced in code rather than
documented as intentions:

**A credential is a call argument.** No adapter holds one as state, no returned
record has a field for one, and none is written to disk or a log. Absent
credentials produce a not-run record.

**Execution class is decided by what actually ran, never by what was asked
for.** An official fake backend, a local simulator, and a noise model all
produce ``SIMULATION``. ``HARDWARE`` is reachable only when the vendor reports
that a physical device executed the circuit, which requires credentials and a
human's authorization.

**A device snapshot is a dated observation.** It is never refreshed in place,
because a result is only interpretable against the calibration it was compiled
for.
"""

from .base import (
    AdapterUnavailable,
    DeviceSnapshot,
    NotRunRecord,
    ProviderResult,
    not_run,
    redact,
)

__all__ = [
    "AdapterUnavailable",
    "DeviceSnapshot",
    "NotRunRecord",
    "ProviderResult",
    "not_run",
    "redact",
]
