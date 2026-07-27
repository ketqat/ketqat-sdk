"""Decoder adapters for QEC benchmarking.

A decoder is anything that turns detector samples into a prediction of which
logical observables flipped. Benchmarking decoders fairly means holding
everything else fixed, so each adapter here declares its own version and
assumptions, and the runner records them alongside every measurement.

Two real decoders ship:

* :class:`PyMatchingDecoder` -- minimum-weight perfect matching via PyMatching.
* :class:`LookupTableDecoder` -- exact maximum-likelihood decoding over error
  mechanisms up to a bounded fault weight, precomputed into a syndrome table.

The lookup decoder is not a stand-in for the matching decoder. It is a real
decoding strategy used for small codes, it is exact within its truncation
bound, and it has genuinely different accuracy and latency characteristics --
which is what makes a two-decoder comparison worth running at all.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any, Protocol


class DecoderError(RuntimeError):
    """Raised when a decoder cannot be constructed or run."""


@dataclass
class DecodeOutcome:
    """Predictions plus the timings a fair benchmark has to separate."""

    predictions: Any
    construction_seconds: float
    decode_seconds: float
    #: Populated by decoders that build a model before decoding, so model
    #: preparation is never silently counted as inference time.
    preparation_seconds: float = 0.0
    #: Assumptions a reader needs in order to interpret the numbers.
    assumptions: dict[str, Any] = field(default_factory=dict)


class DecoderAdapter(Protocol):
    """Contract every decoder must satisfy to be benchmarked."""

    name: str
    version: str

    def decode(self, circuit: Any, detector_samples: Any) -> DecodeOutcome: ...


def _require_dependencies() -> tuple[Any, Any]:
    try:
        import numpy as np
        import stim
    except ImportError as exc:  # pragma: no cover - exercised by dependency test
        raise DecoderError(
            'QEC decoding requires the `qec` dependency group. Install it with:\n\n'
            'pip install "ketqat[qec]"\n'
        ) from exc
    return np, stim


class PyMatchingDecoder:
    """Minimum-weight perfect matching, the standard surface-code decoder.

    Named ``pymatching`` to match what manifests already write and to keep the
    recorded backend string stable at ``stim-pymatching``. Renaming it would
    change the metadata of every future run for no scientific reason.
    """

    name = "pymatching"

    def __init__(self) -> None:
        try:
            import pymatching
        except ImportError as exc:  # pragma: no cover - exercised by dependency test
            raise DecoderError(
                'The pymatching decoder requires the `qec` dependency group. Install it with:\n\n'
                'pip install "ketqat[qec]"\n'
            ) from exc
        self._pymatching = pymatching
        self.version = getattr(pymatching, "__version__", "unknown")

    def decode(self, circuit: Any, detector_samples: Any) -> DecodeOutcome:
        construction_start = time.perf_counter_ns()
        detector_error_model = circuit.detector_error_model(decompose_errors=True)
        matching = self._pymatching.Matching.from_detector_error_model(detector_error_model)
        construction_seconds = (time.perf_counter_ns() - construction_start) / 1_000_000_000

        decode_start = time.perf_counter_ns()
        predictions = matching.decode_batch(detector_samples)
        decode_seconds = (time.perf_counter_ns() - decode_start) / 1_000_000_000

        return DecodeOutcome(
            predictions=predictions,
            construction_seconds=construction_seconds,
            decode_seconds=decode_seconds,
            assumptions={
                "algorithm": "minimum_weight_perfect_matching",
                "detector_error_model": "decomposed",
                "library": "pymatching",
                "library_version": self.version,
            },
        )


@dataclass(frozen=True)
class _Mechanism:
    """One independent error mechanism from a detector error model."""

    detectors: frozenset[int]
    observables: frozenset[int]


class LookupTableDecoder:
    """Exact maximum-likelihood decoding, truncated at a bounded fault weight.

    Enumerates every combination of up to ``max_fault_weight`` independent error
    mechanisms, records the syndrome each produces, and keeps the lowest-weight
    explanation for that syndrome. Decoding is then a dictionary lookup.

    The truncation is the decoder's defining assumption and is reported in every
    result: syndromes requiring more than ``max_fault_weight`` simultaneous
    faults are not in the table. Such a syndrome is an **abstention**, counted
    separately from a wrong prediction, because "did not decode" and "decoded
    incorrectly" are different failures and merging them would flatter or
    unfairly penalise the decoder depending on which way you squint.
    """

    name = "ketqat-lookup"
    version = "0.1.0"

    def __init__(self, max_fault_weight: int = 2, max_table_size: int = 2_000_000) -> None:
        if max_fault_weight < 1:
            raise DecoderError("max_fault_weight must be at least 1.")
        self.max_fault_weight = max_fault_weight
        self.max_table_size = max_table_size

    @staticmethod
    def _mechanisms(detector_error_model: Any) -> list[_Mechanism]:
        mechanisms: list[_Mechanism] = []
        for instruction in detector_error_model.flattened():
            if instruction.type != "error":
                continue
            detectors: set[int] = set()
            observables: set[int] = set()
            for target in instruction.targets_copy():
                if target.is_relative_detector_id():
                    detectors.add(target.val)
                elif target.is_logical_observable_id():
                    observables.add(target.val)
            # A mechanism flipping no detector is undetectable and therefore
            # carries no information for a syndrome-based decoder.
            if detectors:
                mechanisms.append(_Mechanism(frozenset(detectors), frozenset(observables)))
        return mechanisms

    def _build_table(self, detector_error_model: Any) -> dict[frozenset[int], frozenset[int]]:
        mechanisms = self._mechanisms(detector_error_model)
        table: dict[frozenset[int], frozenset[int]] = {frozenset(): frozenset()}

        for weight in range(1, self.max_fault_weight + 1):
            for combination in combinations(mechanisms, weight):
                detectors: set[int] = set()
                observables: set[int] = set()
                for mechanism in combination:
                    detectors ^= mechanism.detectors
                    observables ^= mechanism.observables
                key = frozenset(detectors)
                # Lower weight is more likely under independent noise, and
                # enumeration ascends by weight, so the first entry wins.
                if key not in table:
                    table[key] = frozenset(observables)
                    if len(table) > self.max_table_size:
                        raise DecoderError(
                            f"Lookup table exceeded {self.max_table_size} entries at fault weight "
                            f"{weight}. Lower max_fault_weight or use a decoder that does not "
                            "enumerate."
                        )
        return table

    def decode(self, circuit: Any, detector_samples: Any) -> DecodeOutcome:
        numpy, _ = _require_dependencies()

        construction_start = time.perf_counter_ns()
        detector_error_model = circuit.detector_error_model(decompose_errors=False)
        observable_count = detector_error_model.num_observables
        construction_seconds = (time.perf_counter_ns() - construction_start) / 1_000_000_000

        preparation_start = time.perf_counter_ns()
        table = self._build_table(detector_error_model)
        preparation_seconds = (time.perf_counter_ns() - preparation_start) / 1_000_000_000

        decode_start = time.perf_counter_ns()
        shots = detector_samples.shape[0]
        predictions = numpy.zeros((shots, max(observable_count, 1)), dtype=bool)
        abstentions = 0
        for shot in range(shots):
            fired = frozenset(int(index) for index in numpy.flatnonzero(detector_samples[shot]))
            correction = table.get(fired)
            if correction is None:
                # Not in the table: the decoder declines rather than guessing.
                abstentions += 1
                continue
            for observable in correction:
                predictions[shot, observable] = True
        decode_seconds = (time.perf_counter_ns() - decode_start) / 1_000_000_000

        return DecodeOutcome(
            predictions=predictions,
            construction_seconds=construction_seconds,
            decode_seconds=decode_seconds,
            preparation_seconds=preparation_seconds,
            assumptions={
                "algorithm": "exact_maximum_likelihood_truncated",
                "max_fault_weight": self.max_fault_weight,
                "table_entries": len(table),
                "abstentions": abstentions,
                "abstention_note": (
                    "Syndromes needing more than max_fault_weight simultaneous faults are absent "
                    "from the table. The decoder abstains and predicts no flip; abstentions are "
                    "reported separately from incorrect predictions."
                ),
                "detector_error_model": "undecomposed",
            },
        )


#: Decoders the runner can construct by name.
DECODER_REGISTRY: dict[str, Any] = {
    PyMatchingDecoder.name: PyMatchingDecoder,
    LookupTableDecoder.name: LookupTableDecoder,
}

#: Aliases kept so existing manifests continue to resolve.
DECODER_ALIASES: dict[str, str] = {
    "pymatching-mwpm": PyMatchingDecoder.name,
    "mwpm": PyMatchingDecoder.name,
    "minimum-weight-perfect-matching": PyMatchingDecoder.name,
    "lookup": LookupTableDecoder.name,
    "lookup-table": LookupTableDecoder.name,
}


def resolve_decoder(name: str, options: dict[str, Any] | None = None) -> Any:
    """Construct a decoder by name, rejecting unknown names rather than
    silently substituting a default -- which would make a benchmark compare
    something other than what it claims."""
    canonical = DECODER_ALIASES.get(name.lower(), name.lower())
    factory = DECODER_REGISTRY.get(canonical)
    if factory is None:
        known = ", ".join(sorted(DECODER_REGISTRY) + sorted(DECODER_ALIASES))
        raise DecoderError(f"Unknown decoder {name!r}. Known decoders: {known}.")
    return factory(**(options or {}))
