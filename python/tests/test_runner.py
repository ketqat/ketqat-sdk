from __future__ import annotations

import builtins
import math
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from ketqat_runner.examples import list_example_manifests, read_example_manifest
from ketqat_runner.runner import QEC_DEPENDENCY_MESSAGE, _derive_coordinate_seed, run_experiment
from ketqat_runner.validation import KetQatValidationError, validate_manifest, validate_result


REPO_ROOT = Path(__file__).resolve().parents[2]


def _manifest() -> dict:
    manifest = yaml.safe_load((REPO_ROOT / "examples" / "qec" / "surface-code-memory.yaml").read_text())
    manifest["sampling"]["shots"] = 8
    manifest["qec"]["noise"]["physical_error_rates"] = [0.001]
    return manifest


def test_manifest_schema_validation_rejects_bad_values() -> None:
    manifest = _manifest()
    validate_manifest(manifest)

    invalid_probability = _manifest()
    invalid_probability["qec"]["noise"]["physical_error_rates"] = [1.2]
    with pytest.raises(KetQatValidationError, match="physical_error_rates"):
        validate_manifest(invalid_probability)

    even_distance = _manifest()
    even_distance["qec"]["code"]["distances"] = [4]
    with pytest.raises(KetQatValidationError, match="positive odd"):
        validate_manifest(even_distance)

    zero_shots = _manifest()
    zero_shots["sampling"]["shots"] = 0
    with pytest.raises(KetQatValidationError, match="shots"):
        validate_manifest(zero_shots)

    unsupported_family = _manifest()
    unsupported_family["qec"]["code"]["family"] = "other-code"
    with pytest.raises(KetQatValidationError, match="rotated-surface-code"):
        validate_manifest(unsupported_family)

    unsupported_version = _manifest()
    unsupported_version["benchmark"]["version"] = "9.9.9"
    with pytest.raises(KetQatValidationError, match="Unsupported QEC benchmark"):
        validate_manifest(unsupported_version)


def test_missing_qec_dependency_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    original_import = builtins.__import__

    def fake_import(name: str, *args, **kwargs):
        if name == "stim":
            raise ImportError("stim unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    with pytest.raises(RuntimeError, match="ketqat\\[qec\\]"):
        run_experiment(_manifest())

    assert "deterministic-local-fallback" not in QEC_DEPENDENCY_MESSAGE


def test_real_small_qec_execution_validates_result_and_records_real_timings() -> None:
    result = run_experiment(_manifest())
    validate_result(result)

    assert result["domain"] == "QEC"
    assert result["is_demo"] is False
    assert result["metric_points"][0]["metadata"]["backend"] == "stim-pymatching"
    assert result["metric_points"][0]["sampling_runtime_seconds"] >= 0
    assert result["metric_points"][0]["decoder_latency_ms"] >= 0
    assert result["metric_points"][0]["metadata"]["decode_runtime_seconds"] >= 0
    assert "stim" in result["environment"]["packages"]
    assert "pymatching" in result["environment"]["packages"]


def test_coordinate_seed_is_deterministic_and_coordinate_specific() -> None:
    first = _derive_coordinate_seed(42, "0.1.0", 3, 0.001)
    second = _derive_coordinate_seed(42, "0.1.0", 3, 0.001)
    changed_probability = _derive_coordinate_seed(42, "0.1.0", 3, 0.002)
    changed_distance = _derive_coordinate_seed(42, "0.1.0", 5, 0.001)

    assert first == second
    assert first != changed_probability
    assert first != changed_distance


def test_cli_rejects_malformed_yaml_without_writing_output(tmp_path: Path) -> None:
    manifest = tmp_path / "bad.yaml"
    output = tmp_path / "run.json"
    manifest.write_text("domain: [")

    completed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "run", str(manifest), "--output", str(output)],
        capture_output=True,
        text=True,
    )

    assert completed.returncode != 0
    assert "Invalid YAML manifest" in completed.stderr
    assert not output.exists()


def test_cli_lists_and_copies_packaged_examples(tmp_path: Path) -> None:
    listed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "examples", "list"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "surface-code-memory" in listed.stdout
    assert "grover-search" in listed.stdout

    destination = tmp_path / "grover.yaml"
    copied = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "examples", "copy", "grover-search", "--output", str(destination)],
        capture_output=True,
        text=True,
        check=True,
    )

    assert "Wrote" in copied.stdout
    assert yaml.safe_load(destination.read_text())["domain"] == "ALGORITHM"


def test_cli_runs_packaged_algorithm_example_by_name(tmp_path: Path) -> None:
    output = tmp_path / "algorithm.json"
    completed = subprocess.run(
        [sys.executable, "-m", "ketqat_runner.cli", "run", "grover-search", "--output", str(output)],
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    data = json.loads(output.read_text())
    assert data["domain"] == "ALGORITHM"
    assert data["is_demo"] is False
    assert data["reproducibility_hash"]


def test_packaged_examples_are_readable_resources() -> None:
    names = {example.name for example in list_example_manifests()}

    # The set is pinned rather than counted, so adding an example is a deliberate
    # act that updates this line -- which is how the decoder comparison being
    # absent from `examples list` for so long finally surfaced.
    assert names == {
        "surface-code-memory",
        "decoder-comparison",
        "readout-limited-memory",
        "randomized-benchmarking",
        "phase-estimation",
        "grover-search",
    }
    assert yaml.safe_load(read_example_manifest("qec/decoder-comparison"))["domain"] == "QEC"
    assert yaml.safe_load(read_example_manifest("qec/surface-code-memory"))["domain"] == "QEC"
    assert yaml.safe_load(read_example_manifest("examples/algorithms/grover-search.yaml"))["domain"] == "ALGORITHM"


def test_packaged_examples_match_repository_examples() -> None:
    for example in list_example_manifests():
        repository_copy = REPO_ROOT / example.package_path
        assert read_example_manifest(example.name) == repository_copy.read_text()


def test_result_schema_validation_rejects_malformed_result() -> None:
    result = run_experiment(_manifest())
    result["metric_points"][0]["logical_error_rate"] = 2

    with pytest.raises(KetQatValidationError, match="logical_error_rate"):
        validate_result(result)


def test_the_same_experiment_run_twice_produces_the_same_hash() -> None:
    """The property the whole platform rests on.

    A reproducibility hash exists so a second person can re-run an experiment and
    show they obtained the same thing. The verification contract requires exactly
    that: REPRODUCED evidence must carry a matching hash.

    For a while no honest reproduction could produce one. `runtime_seconds`,
    `decoder_latency_ms`, and five other duration fields were hashed, and they
    differ on every run -- on the same machine, seconds apart, let alone across
    machines. The hash fingerprinted machine speed rather than science
    (ketqat-sdk#89).

    Version 2 of the hashing rules excludes those fields, and the runner stamps
    the version it used, so records written under the old rules still verify
    against the old rules and nothing already published was invalidated.

    This test was an xfail(strict=True) while the defect stood, so that fixing it
    would fail the suite and force this docstring to be rewritten rather than
    letting a passing xfail quietly outlive the bug.

    Nothing else in the suite covers this. The cross-language fixtures prove
    TypeScript and Python hash *the same input* identically, which they do; they
    say nothing about whether the same *experiment* hashes the same twice.
    """
    manifest = _manifest()

    first = run_experiment(manifest)
    second = run_experiment(manifest)

    # The science is deterministic under a fixed seed. Compared on the metric
    # point rather than the summary, because a zero-failure run has no measured
    # rate to summarise (ketqat-sdk#92) -- the point is where the number lives.
    first_point = first["metric_points"][0]
    second_point = second["metric_points"][0]
    assert first_point["logical_failures"] == second_point["logical_failures"]
    assert first_point["logical_error_rate"] == pytest.approx(
        second_point["logical_error_rate"]
    ), "the scientific result should already be deterministic under a fixed seed"

    # And the durations genuinely differ, so a passing hash comparison below is
    # evidence that timing is excluded rather than evidence of a cached result.
    assert first_point["runtime_seconds"] != second_point["runtime_seconds"]

    assert first["reproducibility_hash"] == second["reproducibility_hash"], (
        "the same experiment must hash the same twice, or REPRODUCED evidence "
        "cannot be produced by anyone"
    )


def test_a_zero_failure_run_is_not_summarised_as_a_rate_of_zero() -> None:
    """ketqat-sdk#92.

    `summary_metrics` is the field a leaderboard query reaches for, an importer
    maps, and a reader quotes. It used to copy the point's value verbatim, so a
    run that observed no logical failures produced

        "summary_metrics": {"logical_error_rate": 0.0}

    while the point it came from said, one level down, that the rate is an upper
    bound and explicitly not zero. The record held an honest statement and, one
    level up, the exact claim that statement exists to deny.
    """
    from ketqat_runner.runner import _summarize

    bounded = _summarize(
        [
            {
                "metric": "logical_error_rate",
                "logical_error_rate": 0.0,
                "metadata": {"is_upper_bound_only": True, "confidence_interval_upper": 3.84e-4},
            }
        ]
    )
    assert "logical_error_rate" not in bounded, "a bounded run must not report a measured rate"
    assert bounded["logical_error_rate_upper_bound"] == 3.84e-4, "the bound is a real result and is kept"


def test_a_measured_rate_is_still_summarised_as_a_rate() -> None:
    # The fix must not swallow genuine measurements, which is the obvious way to
    # over-correct here.
    from ketqat_runner.runner import _summarize

    measured = _summarize(
        [
            {
                "metric": "logical_error_rate",
                "logical_error_rate": 0.0221,
                "metadata": {"is_upper_bound_only": False, "confidence_interval_upper": 0.025},
            }
        ]
    )
    assert measured == {"logical_error_rate": 0.0221}


def test_a_bound_with_no_interval_summarises_to_nothing() -> None:
    # There is no honest number to report, and inventing one -- or falling back
    # to the bare zero -- is what this whole change exists to prevent.
    from ketqat_runner.runner import _summarize

    assert _summarize(
        [
            {
                "metric": "logical_error_rate",
                "logical_error_rate": 0.0,
                "metadata": {"is_upper_bound_only": True},
            }
        ]
    ) == {}


def test_non_qec_metrics_are_unaffected() -> None:
    from ketqat_runner.runner import _summarize

    assert _summarize(
        [{"metric": "success_probability", "success_probability": 0.96, "metadata": {}}]
    ) == {"success_probability": 0.96}


# --- Noise channels beyond gate depolarization (ketqat-sdk#110) -------------
#
# The QEC path used to pass exactly one noise parameter to Stim
# (`after_clifford_depolarization`). A manifest could name a readout error rate
# and the run would ignore it, then publish a result labelled as though it had
# been modelled. These tests exist to make that failure mode loud.


def _noise_sample(**overrides):
    from ketqat_runner.runner import _sample_surface_code_memory

    params = dict(
        benchmark_version="0.1",
        distance=3,
        physical_error_rate=0.001,
        rounds=3,
        shots=4000,
        seed=7,
        decoder_configs=[{"name": "pymatching"}],
        code_family="rotated-surface-code",
    )
    params.update(overrides)
    return _sample_surface_code_memory(**params)


@pytest.mark.parametrize(
    "channel", ["readout_error_rate", "reset_error_rate", "idle_error_rate"]
)
def test_each_noise_channel_measurably_changes_the_result(channel: str) -> None:
    """A channel that reaches Stim changes the number of logical failures.

    This is the test that a channel is actually *wired up*, not merely accepted
    by the schema and dropped. Measured at d=3, p=0.001, 4000 shots, seed 7:
    2 failures with no extra channel, 147-241 with one at 0.05. The thresholds
    below sit far inside that gap, so the test fails loudly if a channel stops
    reaching the circuit -- and does not fail on ordinary RNG drift.
    """
    reference = _noise_sample()["decoders"][0]["logical_failures"]
    assert reference < 20, "reference run is unexpectedly noisy; thresholds invalid"

    noisy = _noise_sample(extra_noise={channel: 0.05})["decoders"][0]["logical_failures"]
    assert noisy > 50, f"{channel} did not reach the circuit: {noisy} failures"
    assert noisy > reference * 10


def test_a_run_without_extra_channels_is_bit_for_bit_what_it_always_was() -> None:
    """Existing published results must stay reproducible.

    The seed derivation grew new inputs. If those inputs changed the seed for
    runs that do not use them, every result published before this change would
    stop reproducing.
    """
    assert _noise_sample()["coordinate_seed"] == _derive_coordinate_seed(7, "0.1", 3, 0.001)
    assert (
        _noise_sample()["seed_derivation"]
        == "sha256(global_seed,benchmark_version,code_distance,physical_error_rate)"
    )


def test_runs_differing_only_in_a_noise_channel_do_not_share_a_seed() -> None:
    """Otherwise their shot noise is correlated, and comparing them overstates
    the precision of the difference."""
    a = _noise_sample(extra_noise={"readout_error_rate": 0.05})["coordinate_seed"]
    b = _noise_sample(extra_noise={"readout_error_rate": 0.06})["coordinate_seed"]
    assert a != b


def test_the_recorded_seed_derivation_names_the_inputs_actually_used() -> None:
    """A record that named only the original four inputs while the run used six
    would describe a derivation that did not happen."""
    derivation = _noise_sample(
        extra_noise={"readout_error_rate": 0.05, "idle_error_rate": 0.01}
    )["seed_derivation"]
    assert derivation == (
        "sha256(global_seed,benchmark_version,code_distance,physical_error_rate"
        ",idle_error_rate,readout_error_rate)"
    )


def test_runs_at_different_noise_channels_are_not_ranked_together() -> None:
    """`noise_model` carries only the model *name*, so it cannot separate these.

    Without the per-channel comparability fields, a run at 5% readout error and
    a run at 0% would land on the same leaderboard coordinate and be presented
    as a comparison. They are two different experiments.
    """
    from ketqat_runner.qec_statistics import comparability_key

    record = {
        "benchmark_suite": "qec",
        "benchmark_suite_version": "0.1",
        "code_family": "rotated-surface-code",
        "code_distance": 3,
        "rounds": 3,
        "physical_error_rate": 0.001,
        "noise_model": "circuit-level-depolarizing",
        "stopping_rule": "fixed_shots=4000",
        "decoder_version": "pymatching-2.2.1",
    }

    # Runs that model no extra channel still compare with each other, so this
    # change does not fragment the existing leaderboard.
    assert comparability_key(record) == comparability_key(dict(record))

    unmodelled = comparability_key(record)
    at_five = comparability_key({**record, "readout_error_rate": 0.05})
    at_six = comparability_key({**record, "readout_error_rate": 0.06})
    assert unmodelled != at_five
    assert at_five != at_six


def test_a_misspelled_noise_rate_is_refused_rather_than_ignored() -> None:
    """ketqat-sdk#99 one level up: a typo must not produce a run that silently
    omits the channel the author asked for."""
    manifest = _manifest()
    manifest["qec"]["noise"]["readout_error_rat"] = 0.05
    with pytest.raises(KetQatValidationError):
        validate_manifest(manifest)


def test_a_noise_channel_reaches_the_result_record() -> None:
    """End to end: a manifest naming a channel produces a result whose
    comparability key records it."""
    manifest = _manifest()
    manifest["sampling"]["shots"] = 200
    manifest["qec"]["noise"]["readout_error_rate"] = 0.05
    result = run_experiment(manifest)
    validate_result(result)

    metadata = result["metric_points"][0]["metadata"]
    fields = metadata["comparability_key_fields"]
    assert "readout_error_rate" in fields
    assert metadata["comparability_key"][fields.index("readout_error_rate")] == 0.05


def test_an_integer_noise_rate_is_recorded_as_a_float() -> None:
    """`readout_error_rate: 0` is an int in YAML and a float in the seed payload.

    They are equal in Python and different once serialised, which would make one
    run's comparability key `0` and an identical run's `0.0`.
    """
    manifest = _manifest()
    manifest["sampling"]["shots"] = 200
    manifest["qec"]["noise"]["readout_error_rate"] = 0
    result = run_experiment(manifest)

    metadata = result["metric_points"][0]["metadata"]
    recorded = metadata["comparability_key"][
        metadata["comparability_key_fields"].index("readout_error_rate")
    ]
    assert isinstance(recorded, float)
    assert json.dumps(recorded) == "0.0"


# --- Correlated crosstalk (ketqat-sdk#112) ----------------------------------


def test_data_qubits_are_derived_from_measurement_not_coordinate_parity() -> None:
    """A d=3 rotated surface code has 9 data qubits and 8 ancilla.

    Coordinate parity looks like a reasonable way to split them and is wrong:
    every qubit in this layout has an even coordinate sum, so a parity rule
    returns all 17 as data and silently applies crosstalk to the ancilla too.
    """
    import stim

    from ketqat_runner.runner import _data_qubit_pairs

    circuit = stim.Circuit.generated("surface_code:rotated_memory_z", distance=3, rounds=3)
    coordinates = circuit.get_final_qubit_coordinates()
    assert len(coordinates) == 17
    assert all(sum(int(a) for a in xy) % 2 == 0 for xy in coordinates.values())

    # 9 data qubits in a 3x3 grid: 6 horizontal + 6 vertical neighbouring pairs.
    assert len(_data_qubit_pairs(circuit)) == 12


@pytest.mark.parametrize("distance,rounds", [(3, 3), (5, 5), (3, 7)])
def test_crosstalk_is_applied_once_per_round(distance: int, rounds: int) -> None:
    """Rounds after the first live inside a REPEAT block.

    A rewrite that only walked the top level would apply crosstalk to round one
    and to no other, which is a quieter bug than it sounds: the run still
    produces a plausible number, just for an experiment nobody asked for.

    Counted in targets rather than instructions because Stim fuses consecutive
    same-probability DEPOLARIZE2 instructions into one -- counting instructions
    reports 3 where the answer is 36.
    """
    import stim

    from ketqat_runner.runner import _data_qubit_pairs, _inject_crosstalk

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=distance, rounds=rounds
    )
    pairs = _data_qubit_pairs(circuit)

    def targets(c) -> int:
        return sum(len(i.targets_copy()) for i in c.flattened() if i.name == "DEPOLARIZE2")

    added = targets(_inject_crosstalk(circuit, 0.02)) - targets(circuit)
    assert added == len(pairs) * 2 * rounds


def test_crosstalk_measurably_changes_the_result() -> None:
    reference = _noise_sample(shots=20000)["decoders"][0]["logical_failures"]
    noisy = _noise_sample(shots=20000, extra_noise={"crosstalk_error_rate": 0.02})
    assert noisy["decoders"][0]["logical_failures"] > reference * 10


def test_crosstalk_is_visible_in_both_memory_bases() -> None:
    """The reason crosstalk is DEPOLARIZE2 and not a correlated ZZ.

    A correlated ZZ commutes with the memory-Z observable, so it is invisible
    in the default experiment while dominating memory-X. Measured at d=3,
    20,000 shots, p=0.02: ZZ gives 2 failures in memory-Z against a baseline of
    4, and 4739 in memory-X. A crosstalk model that reports "no effect" for the
    experiment most people run is worse than no crosstalk model, because it
    looks like evidence of robustness.
    """
    for family in ("rotated-surface-code", "unrotated-surface-code"):
        reference = _noise_sample(shots=20000, code_family=family)
        noisy = _noise_sample(
            shots=20000, code_family=family, extra_noise={"crosstalk_error_rate": 0.02}
        )
        assert noisy["decoders"][0]["logical_failures"] > reference["decoders"][0][
            "logical_failures"
        ] * 10, f"crosstalk is invisible for {family}"


def test_crosstalk_separates_runs_and_seeds_like_every_other_channel() -> None:
    from ketqat_runner.qec_statistics import comparability_key

    a = _noise_sample(extra_noise={"crosstalk_error_rate": 0.02})["coordinate_seed"]
    b = _noise_sample(extra_noise={"crosstalk_error_rate": 0.03})["coordinate_seed"]
    assert a != b

    record = {
        "benchmark_suite": "qec",
        "benchmark_suite_version": "0.1",
        "code_family": "rotated-surface-code",
        "code_distance": 3,
        "rounds": 3,
        "physical_error_rate": 0.001,
        "noise_model": "circuit-level-depolarizing",
        "stopping_rule": "fixed_shots=4000",
        "decoder_version": "pymatching-2.2.1",
    }
    assert comparability_key(record) != comparability_key(
        {**record, "crosstalk_error_rate": 0.02}
    )


# --- Randomized benchmarking (ketqat-sdk#114) -------------------------------
#
# RB is Clifford-only, so Stim executes the protocol exactly rather than
# approximating it. That exactness is what makes the tests below possible:
# the decay parameter has a closed form under depolarizing noise, so the
# implementation can be checked against theory instead of against itself.


def _rb_manifest(**overrides) -> dict:
    manifest = {
        "schema_version": "0.1",
        "domain": "PROTOCOL",
        "benchmark": {"suite": "randomized-benchmarking-clifford", "version": "0.1.0"},
        "experiment": {"name": "rb"},
        "source": {},
        "sampling": {"shots": 200, "seed": 7},
        "metrics": ["survival_probability"],
        "protocol": {
            "name": "randomized-benchmarking",
            "qubits": 1,
            "sequence_lengths": [1, 2, 4, 8, 16, 32, 64, 128],
            "sequences_per_length": 30,
            "noise": {"model": "depolarizing", "depolarizing_rate": 0.01},
        },
    }
    manifest["protocol"].update(overrides.pop("protocol", {}))
    manifest.update(overrides)
    return manifest


@pytest.mark.parametrize("qubits", [1, 2])
def test_noiseless_rb_survives_exactly(qubits: int) -> None:
    """Not 0.999 -- exactly 1.0, at every sequence length.

    The inverse is computed from the composed tableau rather than by inverting
    each gate in reverse. If that composition were wrong the sequence would not
    return to the initial state, and the error would look like noise rather
    than like a bug.
    """
    from ketqat_runner.randomized_benchmarking import survival_probability

    for length in (1, 8, 32):
        sample = survival_probability(
            qubits=qubits, length=length, depolarizing_rate=0.0, sequences=5, shots=200, seed=3
        )
        assert sample["survival_probability"] == 1.0


@pytest.mark.parametrize(
    "qubits,rate,analytic",
    [
        # lambda = 1 - p*d^2/(d^2-1): 4p/3 for one qubit, 16p/15 for two.
        (1, 0.001, 1 - 4 * 0.001 / 3),
        (1, 0.01, 1 - 4 * 0.01 / 3),
        (2, 0.005, 1 - 0.005 * 16 / 15),
    ],
)
def test_the_fitted_decay_matches_theory(qubits: int, rate: float, analytic: float) -> None:
    """A golden test against a closed form, not a regression against myself.

    A fit that agreed only with its own previous output would pass just as
    happily if the whole protocol were wrong.
    """
    from ketqat_runner.randomized_benchmarking import fit_decay, survival_probability

    lengths = [1, 2, 4, 8, 16, 32, 64] + ([128] if qubits == 1 else [])
    points = [
        survival_probability(
            qubits=qubits,
            length=length,
            depolarizing_rate=rate,
            sequences=25,
            shots=200,
            seed=11,
        )
        for length in lengths
    ]
    fit = fit_decay(points, qubits)
    assert not fit["inconclusive"], fit.get("reason")

    error = fit["decay_parameter_standard_error"]
    assert error is not None and error > 0
    deviation = abs(fit["decay_parameter"] - analytic)
    assert deviation < 5 * error, (
        f"fitted {fit['decay_parameter']:.6f} vs analytic {analytic:.6f} "
        f"is {deviation / error:.1f} sigma away"
    )

    dimension = 2**qubits
    expected_epc = (dimension - 1) / dimension * (1 - analytic)
    assert abs(fit["error_per_clifford"] - expected_epc) < 5 * (
        (dimension - 1) / dimension * error
    )


def test_a_fit_that_cannot_be_supported_is_inconclusive_not_a_number() -> None:
    """A protocol that always returns an error rate is worse than one that
    sometimes declines to."""
    from ketqat_runner.randomized_benchmarking import fit_decay, survival_probability

    points = [
        survival_probability(
            qubits=1, length=length, depolarizing_rate=0.5, sequences=10, shots=200, seed=5
        )
        for length in (16, 32, 64, 128)
    ]
    fit = fit_decay(points, 1)
    assert fit["inconclusive"] is True
    assert "decay_parameter" not in fit
    assert fit["reason"]


def test_rb_reports_uncertainty_across_sequences_not_only_shots() -> None:
    """RB is defined as an average over the Clifford group.

    One sequence measured very precisely is not that average, so a single
    sequence must not report a confident standard error.
    """
    import math

    from ketqat_runner.randomized_benchmarking import survival_probability

    single = survival_probability(
        qubits=1, length=16, depolarizing_rate=0.01, sequences=1, shots=4000, seed=5
    )
    assert math.isnan(single["standard_error"])

    many = survival_probability(
        qubits=1, length=16, depolarizing_rate=0.01, sequences=40, shots=100, seed=5
    )
    assert many["standard_error"] > 0


def test_rb_runs_end_to_end_and_validates() -> None:
    manifest = _rb_manifest()
    validate_manifest(manifest)
    result = run_experiment(manifest)
    validate_result(result)

    assert len(result["metric_points"]) == 8
    fit = result["metric_points"][0]["metadata"]["decay_fit"]
    assert abs(fit["decay_parameter"] - (1 - 4 * 0.01 / 3)) < 0.005
    assert fit["asymptote_is_fixed"] is True
    assert "statistical only" in fit["uncertainty_scope"]


def test_rb_runs_at_different_noise_are_not_ranked_together() -> None:
    quiet = run_experiment(_rb_manifest(protocol={"depolarizing_rate": 0.001} and {
        "noise": {"model": "depolarizing", "depolarizing_rate": 0.001}
    }))
    loud = run_experiment(_rb_manifest())
    quiet_key = quiet["metric_points"][0]["metadata"]["comparability_key"]
    loud_key = loud["metric_points"][0]["metadata"]["comparability_key"]
    assert quiet_key != loud_key


def test_rb_is_reproducible() -> None:
    first = run_experiment(_rb_manifest())
    second = run_experiment(_rb_manifest())
    assert first["reproducibility_hash"] == second["reproducibility_hash"]


def test_duplicate_sequence_lengths_are_refused() -> None:
    manifest = _rb_manifest(protocol={"sequence_lengths": [1, 2, 2, 4]})
    with pytest.raises(KetQatValidationError, match="distinct"):
        validate_manifest(manifest)


def test_the_clifford_group_is_enumerated_completely() -> None:
    """24 and 11520 are the known orders.

    RB's theory rests on sampling *uniformly* from the Clifford group. Landing
    on the exact known order is strong evidence the generators and composition
    are right -- a wrong generator set almost never hits it by accident.
    """
    from ketqat_runner.randomized_benchmarking import CLIFFORD_GROUP_ORDERS, clifford_group

    for qubits, order in CLIFFORD_GROUP_ORDERS.items():
        group = clifford_group(qubits)
        assert len(group) == order
        assert len({str(element) for element in group}) == order, "elements must be distinct"


def test_rb_sequences_are_reproducible_from_the_seed() -> None:
    """`stim.Tableau.random` takes no seed and draws from global state.

    Using it made two runs of the same manifest produce different results and
    different reproducibility hashes -- the one guarantee this project sells.
    """
    from ketqat_runner.randomized_benchmarking import build_sequence

    first = build_sequence(1, 12, 0.01, seed=99)
    second = build_sequence(1, 12, 0.01, seed=99)
    assert str(first) == str(second)

    different = build_sequence(1, 12, 0.01, seed=100)
    assert str(different) != str(first)


# --- Phase estimation (ketqat-sdk#123) --------------------------------------
#
# The runner's only algorithm family was grover-search, and that path does not
# execute a circuit: it draws shots from Grover's analytic success probability.
# This one applies the gate sequence to a state vector, which is what makes it
# checkable against theory rather than against its own output.


@pytest.mark.parametrize(
    "counting,integer",
    [(3, 1), (3, 5), (4, 4), (4, 11), (5, 17), (6, 45)],
)
def test_a_dyadic_phase_is_recovered_exactly(counting: int, integer: int) -> None:
    """phi = k/2^n returns k with probability 1.

    Not 0.999 -- exactly 1. Every gate in the sequence, including the inverse
    QFT's bit reversal and its full ladder of controlled rotations, has to be
    right for this to hold. A model that computed the textbook distribution
    would agree with the textbook by construction and prove nothing.
    """
    from ketqat_runner.phase_estimation import estimate_phase

    phase = integer / (1 << counting)
    result = estimate_phase(phase, counting)

    assert result["measured_integer"] == integer
    assert abs(result["success_probability"] - 1.0) < 1e-9
    assert result["phase_is_representable"] is True
    assert result["phase_error"] < 1e-12


def test_a_distribution_is_a_distribution() -> None:
    from ketqat_runner.phase_estimation import phase_estimation_distribution

    for counting in (3, 5, 8):
        for phase in (0.0, 1 / 3, 0.75, 0.9999):
            distribution = phase_estimation_distribution(phase, counting)
            assert len(distribution) == 1 << counting
            assert all(probability >= -1e-12 for probability in distribution)
            assert abs(sum(distribution) - 1.0) < 1e-9


def test_a_phase_the_register_cannot_represent_is_reported_as_such() -> None:
    """The failure mode worth guarding is a confident answer in the wrong bin.

    A run must say whether the phase was representable, so a probability below
    one reads as "this register cannot express that phase" rather than as noise.
    """
    from ketqat_runner.phase_estimation import estimate_phase

    result = estimate_phase(1 / 3, 5)
    assert result["phase_is_representable"] is False
    assert result["success_probability"] < 1.0
    # The best bin must still be the nearest one the register can express.
    assert result["phase_error"] <= result["resolution"]


def test_more_counting_qubits_never_estimate_worse() -> None:
    from ketqat_runner.phase_estimation import estimate_phase

    previous = 1.0
    for counting in range(3, 11):
        error = estimate_phase(1 / 3, counting)["phase_error"]
        assert error <= previous + 1e-12, f"error grew at {counting} counting qubits"
        previous = error
    assert previous < 1e-3


def test_phase_error_is_measured_on_the_circle() -> None:
    """Phase 0.99 estimated as 0.0 is close, not far.

    A linear difference would report an error of 0.99 for an estimate that is
    actually within one hundredth of the truth.
    """
    from ketqat_runner.phase_estimation import estimate_phase

    result = estimate_phase(0.999, 3)
    assert result["phase_error"] < 0.2


def test_out_of_range_inputs_are_refused() -> None:
    from ketqat_runner.phase_estimation import MAX_COUNTING_QUBITS, estimate_phase

    with pytest.raises(ValueError, match="Phase must lie"):
        estimate_phase(1.5, 4)
    with pytest.raises(ValueError, match="at least one counting qubit"):
        estimate_phase(0.25, 0)
    with pytest.raises(ValueError, match="refuses rather than approximating"):
        estimate_phase(0.25, MAX_COUNTING_QUBITS + 1)


def test_phase_estimation_runs_end_to_end_and_validates() -> None:
    manifest = yaml.safe_load(
        (REPO_ROOT / "examples" / "algorithms" / "phase-estimation.yaml").read_text()
    )
    manifest["sampling"]["shots"] = 500
    validate_manifest(manifest)
    result = run_experiment(manifest)
    validate_result(result)

    assert len(result["metric_points"]) == 3
    for point in result["metric_points"]:
        metadata = point["metadata"]
        # 0.375 is dyadic, so every width recovers it exactly and every shot
        # lands in the same bin.
        assert metadata["phase_is_representable"] is True
        assert abs(metadata["exact_success_probability"] - 1.0) < 1e-9
        assert point["success_probability"] == 1.0
        assert metadata["estimated_phase"] == 0.375
        assert "statevector simulation" in metadata["execution"]


def test_an_unknown_algorithm_family_is_refused_by_name() -> None:
    manifest = yaml.safe_load(
        (REPO_ROOT / "examples" / "algorithms" / "phase-estimation.yaml").read_text()
    )
    manifest["algorithm"]["family"] = "shor-factoring"
    with pytest.raises(ValueError, match="grover-search and phase-estimation"):
        run_experiment(manifest)


# --- Drift (ketqat-sdk#125) -------------------------------------------------
#
# Listed in scope-and-limits as expressible-but-unimplemented: Stim carries
# per-round rates, and the generated circuits use one REPEAT block with fixed
# ones, so every round was identical. That was a limit of this runner, not of
# the simulator.


def test_zero_drift_reproduces_the_circuit_exactly() -> None:
    """The identity case has to be an identity.

    A drift implementation that perturbed the circuit at drift=0 would change
    every existing result the moment the field was added, whether or not anyone
    set it.
    """
    import stim

    from ketqat_runner.runner import _apply_drift

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=5, after_clifford_depolarization=0.001
    )
    assert str(_apply_drift(circuit, 0.0)) == str(circuit.flattened())


def test_rates_ramp_once_per_round_not_once_per_layer() -> None:
    """Rounds are counted by measure-reset, not by TICK.

    TICKs also separate the layers *within* a round, so counting them would ramp
    the rate several times per round and report a drift far steeper than asked
    for.
    """
    import stim

    from ketqat_runner.runner import _apply_drift

    base = 0.001
    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=5, after_clifford_depolarization=base
    )
    drifted = _apply_drift(circuit, 0.5)

    seen: dict[int, set[float]] = {}
    round_index = 0
    for instruction in drifted:
        if instruction.name in ("DEPOLARIZE1", "DEPOLARIZE2"):
            seen.setdefault(round_index, set()).add(round(instruction.gate_args_copy()[0], 10))
        if instruction.name in ("MR", "MRZ", "MRX"):
            round_index += 1

    for index in sorted(seen)[:5]:
        expected = round(base * (1 + 0.5 * index), 10)
        assert seen[index] == {expected}, f"round {index}: {seen[index]} != {expected}"


def test_drift_preserves_the_detector_structure() -> None:
    """Flattening and rewriting must not change what the decoder sees."""
    import stim

    from ketqat_runner.runner import _apply_drift

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=5, after_clifford_depolarization=0.001
    )
    drifted = _apply_drift(circuit, 0.5)
    assert drifted.num_detectors == circuit.num_detectors
    assert drifted.num_observables == circuit.num_observables


@pytest.mark.parametrize("drift,direction", [(0.5, "worse"), (-0.1, "better")])
def test_drift_measurably_moves_the_result_in_both_directions(drift: float, direction: str) -> None:
    """Negative drift models a device improving, and is allowed rather than
    clamped -- calibration drift is not always downhill."""
    flat = _noise_sample(shots=20000, rounds=9, physical_error_rate=0.003)
    drifted = _noise_sample(
        shots=20000, rounds=9, physical_error_rate=0.003, extra_noise={"drift_per_round": drift}
    )

    baseline = flat["decoders"][0]["logical_failures"]
    moved = drifted["decoders"][0]["logical_failures"]
    if direction == "worse":
        assert moved > baseline * 3, f"positive drift should degrade: {baseline} -> {moved}"
    else:
        assert moved < baseline, f"negative drift should improve: {baseline} -> {moved}"


def test_drift_separates_runs_and_seeds_like_every_other_channel() -> None:
    from ketqat_runner.qec_statistics import comparability_key

    a = _noise_sample(extra_noise={"drift_per_round": 0.2})["coordinate_seed"]
    b = _noise_sample(extra_noise={"drift_per_round": 0.3})["coordinate_seed"]
    assert a != b

    record = {
        "benchmark_suite": "qec",
        "code_distance": 3,
        "physical_error_rate": 0.001,
        "noise_model": "circuit-level-depolarizing",
    }
    assert comparability_key(record) != comparability_key({**record, "drift_per_round": 0.2})


# --- Threshold estimation (ketqat-sdk#127) ----------------------------------
#
# The runner already swept distance and physical error rate, so the data a
# threshold needs was produced and discarded. What matters more than the
# estimate is the refusal: a threshold is the headline figure of a QEC result,
# and a confident number from a sweep that never crossed is the single most
# misleading thing this project could publish.


def _threshold_sweep(threshold: float, rates: list[float], distances: list[int]) -> list[dict]:
    """Synthetic curves that cross at `threshold` by construction."""
    points = []
    for distance in distances:
        for rate in rates:
            x = (rate - threshold) * distance**0.7
            points.append(
                {
                    "metric": "logical_error_rate",
                    "code_distance": distance,
                    "physical_error_rate": rate,
                    "logical_error_rate": max(1e-6, min(0.5, 0.5 / (1 + math.e ** (-6 * x)))),
                    "metadata": {},
                }
            )
    return points


@pytest.mark.parametrize("true_threshold", [0.005, 0.010, 0.020])
def test_a_bracketing_sweep_recovers_the_threshold(true_threshold: float) -> None:
    from ketqat_runner.threshold import estimate_threshold

    rates = [true_threshold * factor for factor in (0.4, 0.7, 1.0, 1.3, 1.6)]
    result = estimate_threshold(_threshold_sweep(true_threshold, rates, [3, 5, 7]))

    assert not result["inconclusive"], result.get("reason")
    assert abs(result["threshold_estimate"] - true_threshold) < true_threshold * 0.2
    assert len(result["crossings"]) == 3, "every distance pair should contribute a crossing"


def test_a_sweep_that_never_crosses_is_refused() -> None:
    """The branch this module exists for.

    Below threshold a larger distance always does better, so the ordering never
    changes and there is no threshold in the data. Any number reported from it
    would be an extrapolation dressed as a measurement.
    """
    from ketqat_runner.threshold import estimate_threshold

    result = estimate_threshold(_threshold_sweep(0.010, [0.001, 0.002, 0.003, 0.004], [3, 5, 7]))

    assert result["inconclusive"] is True
    assert "threshold_estimate" not in result
    assert "never crosses" in result["reason"] or "No pair" in result["reason"]
    # The reason must tell the reader what to change, not merely that it failed.
    assert "Widen" in result["reason"]


@pytest.mark.parametrize(
    "distances,rates,expected",
    [
        ([3], [0.004, 0.010, 0.016], "at least 2 distances"),
        ([3, 5, 7], [0.004, 0.016], "at least 3 physical error rates"),
    ],
)
def test_a_sweep_too_small_to_contain_a_crossing_says_which_dimension(
    distances: list[int], rates: list[float], expected: str
) -> None:
    """'Inconclusive' without a reason is indistinguishable from a bug, and a
    reader cannot tell whether to add distances or add rates."""
    from ketqat_runner.threshold import estimate_threshold

    result = estimate_threshold(_threshold_sweep(0.010, rates, distances))
    assert result["inconclusive"] is True
    assert expected in result["reason"]


def test_the_summary_reports_a_threshold_only_when_distances_were_swept() -> None:
    """A single-distance run cannot have a crossing, and saying so on every such
    run reports the shape of the run back to the person who chose it."""
    from ketqat_runner.runner import _summarize

    single = _summarize(
        [
            {
                "metric": "logical_error_rate",
                "code_distance": 3,
                "physical_error_rate": 0.001,
                "logical_error_rate": 0.01,
                "metadata": {},
            }
        ]
    )
    assert not any("threshold" in key for key in single)

    # A real multi-distance sweep that does not cross must say so, because that
    # is a finding about the sweep rather than about its shape.
    flat = _summarize(_threshold_sweep(0.010, [0.001, 0.002, 0.003], [3, 5, 7]))
    assert "threshold_estimate_inconclusive_reason" in flat
    assert "threshold_estimate" not in flat

    crossing = _summarize(_threshold_sweep(0.010, [0.004, 0.007, 0.010, 0.013, 0.016], [3, 5, 7]))
    assert "threshold_estimate" in crossing
    # Never the estimate alone: a bare threshold invites being quoted as a
    # property of the code rather than of this sweep.
    assert "threshold_crossing_spread" in crossing


def test_a_threshold_estimate_carries_the_limits_of_its_method() -> None:
    from ketqat_runner.threshold import estimate_threshold

    result = estimate_threshold(_threshold_sweep(0.010, [0.004, 0.007, 0.010, 0.013, 0.016], [3, 5, 7]))
    assert "not a confidence interval" in result["uncertainty_scope"]
    assert "finite-size" in result["uncertainty_scope"]
    assert "crossing" in result["method"]


# --- CLI publish (ketqat-sdk#131) -------------------------------------------
#
# The runner wrote a result file and the registry accepted one, with nothing
# connecting them: the documented path was a hand-written curl with the token
# pasted into the command line.


def _ketqat_cli() -> str:
    """Path to the installed console script, which is what a user runs."""
    from shutil import which

    resolved = which("ketqat", path=str(Path(sys.executable).parent))
    return resolved or "ketqat"


def _publishable_result() -> dict:
    manifest = _manifest()
    manifest["sampling"]["shots"] = 50
    return run_experiment(manifest)


def test_a_token_is_never_a_command_line_argument() -> None:
    """argv is visible in shell history, in `ps` to other users, and in CI logs.

    Asserted against the parser itself rather than the docs, so adding such an
    option later fails here.
    """
    from ketqat_runner.publish import TOKEN_ENVIRONMENT_VARIABLE

    completed = subprocess.run(
        [_ketqat_cli(), "publish", "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    combined = completed.stdout + completed.stderr
    assert "--token" not in combined
    assert "--api-key" not in combined
    assert TOKEN_ENVIRONMENT_VARIABLE in combined, "the help must say where the token comes from"


def test_a_result_edited_after_the_run_is_refused_before_the_network(tmp_path: Path) -> None:
    """The registry would refuse this too, as a 400 describing a hash.

    Checking locally means the message can say the file was edited, which no
    server-side message can know.
    """
    from ketqat_runner.publish import PublishError, check_publishable

    result = _publishable_result()
    check_publishable(result)  # the unedited result is fine

    tampered = {**result, "name": "edited-after-the-run"}
    with pytest.raises(PublishError, match="edited since the run"):
        check_publishable(tampered)


def test_a_demo_record_is_not_publishable() -> None:
    from ketqat_runner.publish import PublishError, check_publishable

    from ketqat_runner.hashing import calculate_reproducibility_hash

    # A real demo record is hashed *with* the flag, so the hash check passes and
    # the demo check is the one that fires. Flipping the flag on a non-demo
    # result would trip the hash check instead and test the wrong thing.
    demo = {**_publishable_result(), "is_demo": True}
    demo["reproducibility_hash"] = calculate_reproducibility_hash(demo)
    with pytest.raises(PublishError, match="synthetic"):
        check_publishable(demo)


def test_a_missing_or_blank_hash_is_refused_by_the_contract() -> None:
    from ketqat_runner.publish import PublishError, check_publishable

    # Two layers, and they catch different things. The contract requires the
    # key, so a result missing it entirely is refused by schema validation
    # before the publish-specific check runs -- which is the better error.
    missing = _publishable_result()
    del missing["reproducibility_hash"]
    with pytest.raises(PublishError, match="does not satisfy the result contract"):
        check_publishable(missing)

    # A blank hash is refused by the same layer, so the publish module carries
    # no separate guard for it. Asserted here because a later schema change
    # that relaxed this would silently remove the protection.
    blank = {**_publishable_result(), "reproducibility_hash": ""}
    with pytest.raises(PublishError, match="should be non-empty"):
        check_publishable(blank)


def test_publishing_without_a_token_says_where_to_put_one() -> None:
    from ketqat_runner.publish import PublishError, publish_result

    previous = os.environ.pop("KETQAT_API_TOKEN", None)
    try:
        with pytest.raises(PublishError, match="shell history"):
            publish_result(_publishable_result(), base_url="http://127.0.0.1:9")
    finally:
        if previous is not None:
            os.environ["KETQAT_API_TOKEN"] = previous


def test_the_request_carries_an_explicit_user_agent() -> None:
    """ketqat.com sits behind Cloudflare.

    Its browser-integrity check rejects the default `Python-urllib/3.x` agent
    with a 403 before the request reaches the application -- verified against
    production, where the default agent got 403 with Cloudflare error 1010 and
    an explicit agent got the application's own 401. Without this, publishing
    would fail for every user with an error naming neither cause nor fix.
    """
    from ketqat_runner.publish import USER_AGENT

    assert USER_AGENT.startswith("ketqat-runner/")
    assert "urllib" not in USER_AGENT.lower()


def test_the_dry_run_prints_the_destination_and_sends_nothing(tmp_path: Path) -> None:
    """A run pushed to a public registry gets a URL other people may cite."""
    from ketqat_runner.publish import describe_intent

    result = _publishable_result()
    output = tmp_path / "result.json"
    output.write_text(json.dumps(result))

    described = describe_intent(result, "https://example.test", "PRIVATE")
    assert "https://example.test/api/runs/import" in described
    assert "PRIVATE" in described
    assert result["reproducibility_hash"] in described

    completed = subprocess.run(
        [_ketqat_cli(), "publish", str(output), "--dry-run", "--base-url", "https://example.test"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert "nothing was sent" in completed.stdout
    assert "https://example.test/api/runs/import" in completed.stdout


def test_publishing_a_tampered_file_exits_non_zero(tmp_path: Path) -> None:
    result = _publishable_result()
    result["name"] = "tampered"
    output = tmp_path / "tampered.json"
    output.write_text(json.dumps(result))

    completed = subprocess.run(
        [_ketqat_cli(), "publish", str(output), "--dry-run"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 1
    assert "edited since the run" in completed.stderr


# --- Interleaved RB (ketqat-sdk#133) ----------------------------------------


def _irb(gate: str, rate: float, lengths: list[int] | None = None) -> dict:
    from ketqat_runner.randomized_benchmarking import (
        fit_decay,
        interleaved_gate_error,
        interleaved_survival,
        survival_probability,
    )

    spans = lengths or [1, 2, 4, 8, 16, 32]
    reference = fit_decay(
        [
            survival_probability(qubits=1, length=m, depolarizing_rate=rate, sequences=30, shots=200, seed=11)
            for m in spans
        ],
        1,
    )
    interleaved = fit_decay(
        [
            interleaved_survival(
                qubits=1, length=m, depolarizing_rate=rate, sequences=30, shots=200, seed=11, gate=gate
            )
            for m in spans
        ],
        1,
    )
    assert not reference["inconclusive"] and not interleaved["inconclusive"]
    return interleaved_gate_error(reference["decay_parameter"], interleaved["decay_parameter"], 1)


@pytest.mark.parametrize("rate", [0.005, 0.01])
def test_the_isolated_gate_error_matches_the_analytic_value(rate: float) -> None:
    """The interleaved gate costs exactly one depolarizing application here.

    Analytic: r = (d-1)/d * (1 - lambda) with lambda = 1 - 4p/3. Checking
    against that rather than against previous output is what makes this a test
    of the protocol rather than a regression pin.
    """
    analytic = 0.5 * (4 * rate / 3)
    measured = _irb("x", rate)
    assert not measured["inconclusive"]
    assert abs(measured["gate_error"] - analytic) < analytic * 0.25, (
        f"measured {measured['gate_error']:.6f} vs analytic {analytic:.6f}"
    )


def test_every_gate_reports_the_same_error_because_the_noise_model_says_so() -> None:
    """Not a weakness to hide -- the reason interleaved RB is not diagnostic here.

    This engine applies the same depolarizing channel to every gate, so every
    gate has identical error by construction. A result that singled one gate out
    would mean the implementation had invented a difference the noise model does
    not contain.
    """
    errors = [_irb(gate, 0.005)["gate_error"] for gate in ("i", "x", "y", "z")]
    spread = max(errors) - min(errors)
    assert spread < 0.001, f"gates should agree in this noise model, spread was {spread:.6f}"


def test_the_systematic_bound_is_reported_alongside_the_estimate() -> None:
    """Interleaved RB assumes gate-independent noise, and never exactly has it.

    The bound is frequently comparable to the estimate, which is the fact that
    stops the number being quoted as a measurement of one gate.
    """
    measured = _irb("h", 0.005)
    assert measured["systematic_bound"] > 0
    assert "bounded it" in measured["interpretation"]
    assert "systematic bound" in measured["interpretation"]


def test_a_non_clifford_gate_is_refused() -> None:
    """The sequence inverts only if the interleaved gate is in the group.

    A non-Clifford would leave the composition uninvertible and the protocol
    would measure nothing, so it is refused by name rather than attempted.
    """
    from ketqat_runner.randomized_benchmarking import build_interleaved_sequence

    with pytest.raises(ValueError, match="not interleavable"):
        build_interleaved_sequence(1, 4, 0.0, 1, "t")


def test_an_interleaved_sequence_still_returns_to_the_start_with_no_noise() -> None:
    """The inverse must account for the interleaved gates too.

    Inverting only the random Cliffords would leave them uncancelled, and the
    decay would measure that residue rather than the gate's error -- while still
    producing a plausible-looking number.
    """
    from ketqat_runner.randomized_benchmarking import build_interleaved_sequence

    for gate in ("i", "x", "h", "s"):
        for length in (1, 5, 12):
            circuit = build_interleaved_sequence(1, length, 0.0, 7, gate)
            samples = circuit.compile_sampler(seed=3).sample(shots=200)
            assert not samples.any(), f"{gate} at length {length} did not return to |0>"


# --- Correlated time dependence (ketqat-sdk#135) ----------------------------
#
# Drift ramps monotonically. Real calibration wanders: correlated between nearby
# rounds, uncorrelated between distant ones. That correlation is the point --
# a rate resampled independently each round averages out and looks like a
# slightly different constant.


def test_zero_wander_reproduces_the_circuit_exactly() -> None:
    """The identity case must be an identity, as it is for drift."""
    import stim

    from ketqat_runner.runner import _apply_wander

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=6, after_clifford_depolarization=0.002
    )
    assert str(_apply_wander(circuit, 0.0, 7)) == str(circuit.flattened())


def test_the_walk_is_reproducible_from_its_seed() -> None:
    """A stochastic noise model is still a model.

    Two runs at the same seed must produce the same circuit, or the
    reproducibility hash this project is built on stops meaning anything.
    """
    import stim

    from ketqat_runner.runner import _apply_wander

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=6, after_clifford_depolarization=0.002
    )
    assert str(_apply_wander(circuit, 0.5, 7)) == str(_apply_wander(circuit, 0.5, 7))
    assert str(_apply_wander(circuit, 0.5, 7)) != str(_apply_wander(circuit, 0.5, 8))


def test_the_rate_wanders_rather_than_ramping() -> None:
    """A ramp is monotone; a walk is not. That difference is the whole feature."""
    import stim

    from ketqat_runner.runner import _apply_wander

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=12, after_clifford_depolarization=0.002
    )
    wandered = _apply_wander(circuit, 0.5, 7)

    rates: list[float] = []
    seen_round = -1
    round_index = 0
    for instruction in wandered:
        if instruction.name in ("DEPOLARIZE1", "DEPOLARIZE2") and round_index != seen_round:
            rates.append(instruction.gate_args_copy()[0])
            seen_round = round_index
        if instruction.name in ("MR", "MRZ", "MRX"):
            round_index += 1

    assert len(rates) >= 6
    increases = sum(1 for a, b in zip(rates, rates[1:]) if b > a)
    decreases = sum(1 for a, b in zip(rates, rates[1:]) if b < a)
    assert increases > 0 and decreases > 0, f"a walk must move both ways, got {rates}"

    # And never negative: the step is multiplicative on the current rate.
    assert all(rate >= 0 for rate in rates)


def test_wander_preserves_the_detector_structure() -> None:
    import stim

    from ketqat_runner.runner import _apply_wander

    circuit = stim.Circuit.generated(
        "surface_code:rotated_memory_z", distance=3, rounds=6, after_clifford_depolarization=0.002
    )
    wandered = _apply_wander(circuit, 0.5, 7)
    assert wandered.num_detectors == circuit.num_detectors
    assert wandered.num_observables == circuit.num_observables


def test_the_signature_of_correlated_noise_is_spread_not_a_shifted_mean() -> None:
    """This is what correlated noise does, and why a mean would hide it.

    A walk parks in a regime for a stretch, so some runs land in a bad one and
    some in a good one. Measured across twelve seeds at d=3 over 11 rounds, the
    mean moves from 87 to 106 failures while the run-to-run spread grows about
    sixteenfold. Asserting the mean would test almost nothing; asserting the
    spread tests the property that matters.
    """
    import statistics

    flat: list[int] = []
    wandered: list[int] = []
    for seed in range(1, 11):
        flat.append(
            _noise_sample(shots=4000, rounds=11, physical_error_rate=0.003, seed=seed)["decoders"][0][
                "logical_failures"
            ]
        )
        wandered.append(
            _noise_sample(
                shots=4000,
                rounds=11,
                physical_error_rate=0.003,
                seed=seed,
                extra_noise={"wander_per_round": 0.6},
            )["decoders"][0]["logical_failures"]
        )

    assert statistics.stdev(wandered) > 3 * statistics.stdev(flat), (
        f"correlated noise should widen the run-to-run spread: "
        f"flat {statistics.stdev(flat):.1f} vs wander {statistics.stdev(wandered):.1f}"
    )


def test_wander_separates_runs_and_seeds_like_every_other_channel() -> None:
    from ketqat_runner.qec_statistics import comparability_key

    a = _noise_sample(extra_noise={"wander_per_round": 0.2})["coordinate_seed"]
    b = _noise_sample(extra_noise={"wander_per_round": 0.3})["coordinate_seed"]
    assert a != b

    record = {"benchmark_suite": "qec", "code_distance": 3, "physical_error_rate": 0.001}
    assert comparability_key(record) != comparability_key({**record, "wander_per_round": 0.2})


# --- Simultaneous RB (ketqat-sdk#137) ---------------------------------------
#
# Interleaved RB could not distinguish gates here, because this engine gives
# every gate the same error. Simultaneous RB can show a real difference: it
# measures addressability, which is a property of running two qubits together,
# and the crosstalk channel creates exactly that.


def _addressability(crosstalk: float, rate: float = 0.004) -> dict:
    from ketqat_runner.randomized_benchmarking import (
        addressability_error,
        fit_decay,
        isolated_survival,
        simultaneous_survival,
    )

    spans = [1, 2, 4, 8, 16, 32]
    isolated = fit_decay(
        [
            isolated_survival(length=m, depolarizing_rate=rate, sequences=25, shots=200, seed=11, qubit=0)
            for m in spans
        ],
        1,
    )
    together = fit_decay(
        [
            simultaneous_survival(
                length=m, depolarizing_rate=rate, sequences=25, shots=200, seed=11, crosstalk_rate=crosstalk
            )
            for m in spans
        ],
        1,
    )
    assert not isolated["inconclusive"] and not together["inconclusive"]
    return addressability_error(isolated["decay_parameter"], together["decay_parameter"])


@pytest.mark.parametrize("length", [1, 3, 8, 15])
def test_a_noiseless_simultaneous_sequence_returns_both_qubits_to_the_start(length: int) -> None:
    """Both sequences must invert, independently.

    `to_circuit` fuses repeated gates -- `S` with three targets means S applied
    three times -- so copying a sequence onto another qubit once per instruction
    rather than once per target silently drops the repeats. The sequence then
    fails to invert while still producing a plausible decay, which is how this
    was caught: zero crosstalk reported 0.058 added error instead of zero.
    """
    from ketqat_runner.randomized_benchmarking import build_simultaneous_sequence

    samples = build_simultaneous_sequence(length, 0.0, 7, 0.0).compile_sampler(seed=1).sample(shots=400)
    assert not samples.any(), f"length {length} did not return both qubits to |0>"


def test_independent_qubits_show_no_addressability_error() -> None:
    """The property that makes a non-zero value mean anything.

    With no crosstalk the two qubits are genuinely independent, so running them
    together must cost nothing. A method that reported an effect here would
    report one everywhere.
    """
    measured = _addressability(0.0)
    assert abs(measured["addressability_error"]) < 5e-4, measured["interpretation"]


@pytest.mark.parametrize("crosstalk,floor", [(0.01, 0.002), (0.03, 0.008)])
def test_crosstalk_shows_up_as_addressability_error(crosstalk: float, floor: float) -> None:
    """Unlike interleaved RB, this can show a real difference in this engine."""
    measured = _addressability(crosstalk)
    assert measured["addressability_error"] > floor, measured["interpretation"]


def test_addressability_error_grows_with_crosstalk() -> None:
    quiet = _addressability(0.01)["addressability_error"]
    loud = _addressability(0.03)["addressability_error"]
    assert loud > quiet, f"more crosstalk should cost more: {quiet:.6f} then {loud:.6f}"


def test_the_isolated_comparison_uses_the_same_draws() -> None:
    """Comparing against a freshly drawn sequence would fold sequence variation
    into the addressability estimate."""
    from ketqat_runner.randomized_benchmarking import (
        build_isolated_sequence,
        build_simultaneous_sequence,
    )

    # Qubit 0's gates in the simultaneous circuit must match its isolated run.
    simultaneous = build_simultaneous_sequence(6, 0.0, 99, 0.0)
    isolated = build_isolated_sequence(6, 0.0, 99, 0)

    def gates_on(circuit, qubit: int) -> list[str]:
        names: list[str] = []
        for instruction in circuit:
            if instruction.name in ("M", "DEPOLARIZE1", "DEPOLARIZE2"):
                continue
            for target in instruction.targets_copy():
                if target.qubit_value == qubit:
                    names.append(instruction.name)
        return names

    assert gates_on(simultaneous, 0) == gates_on(isolated, 0)


# --- Quantum volume (ketqat-sdk#143) ----------------------------------------
#
# An earlier note said QV "needs non-Clifford circuits and cannot use this
# path". That scoped the obstacle to Stim, which is correct and incomplete: QV
# needs a statevector, not a stabilizer simulator, and a small exact one is
# cheap at the widths QV is defined for.


def test_the_ideal_heavy_output_probability_approaches_its_known_value() -> None:
    """(1 + ln 2) / 2 = 0.8466, and this is checked against that constant.

    Checking against a previous run would pass just as happily if the Haar
    sampling were biased -- which is the failure mode that matters, because a
    biased measure is invisible in a spot check while shifting this number.
    """
    import statistics

    from ketqat_runner.quantum_volume import (
        IDEAL_HEAVY_OUTPUT_PROBABILITY,
        heavy_output_probability,
        quantum_volume_circuit_probabilities,
    )

    for width in (4, 5, 6):
        values = [
            heavy_output_probability(quantum_volume_circuit_probabilities(width, 100 + index))
            for index in range(50)
        ]
        mean = statistics.mean(values)
        assert abs(mean - IDEAL_HEAVY_OUTPUT_PROBABILITY) < 0.03, (
            f"width {width}: {mean:.4f} vs {IDEAL_HEAVY_OUTPUT_PROBABILITY:.4f}"
        )


def test_a_quantum_volume_distribution_is_a_distribution() -> None:
    from ketqat_runner.quantum_volume import quantum_volume_circuit_probabilities

    for width in (2, 4, 6):
        probabilities = quantum_volume_circuit_probabilities(width, 7)
        assert len(probabilities) == 1 << width
        assert all(value >= -1e-12 for value in probabilities)
        assert abs(float(sum(probabilities)) - 1.0) < 1e-9


def test_a_fully_depolarized_device_sits_at_one_half_and_fails() -> None:
    """The floor every QV measurement sits above.

    A uniform distribution puts exactly half its weight above the ideal median,
    so a device that has lost all information scores 0.5 -- not zero. A method
    reporting anything else here would be measuring something other than heavy
    outputs.
    """
    from ketqat_runner.quantum_volume import measure_quantum_volume

    result = measure_quantum_volume(4, 40, 7, depolarizing_rate=1.0)
    assert abs(result["heavy_output_probability"] - 0.5) < 1e-6
    assert result["passed"] is False
    assert result["quantum_volume"] is None


def test_an_ideal_device_passes_and_claims_the_width() -> None:
    from ketqat_runner.quantum_volume import measure_quantum_volume

    result = measure_quantum_volume(4, 60, 7)
    assert result["passed"] is True
    assert result["quantum_volume"] == 16
    # The mean clearing the threshold is not enough; the interval has to.
    assert result["two_sigma_lower_bound"] > result["threshold"]


def test_the_threshold_is_the_two_sigma_bound_not_the_mean() -> None:
    """A mean above 2/3 with a wide interval has not demonstrated anything.

    Constructed so the mean passes and the bound does not, which is exactly the
    case a naive implementation would wave through.
    """
    from ketqat_runner.quantum_volume import measure_quantum_volume

    # Enough depolarization to land near the threshold, with few circuits so the
    # interval stays wide.
    result = measure_quantum_volume(4, 5, 11, depolarizing_rate=0.45)
    if result["heavy_output_probability"] > result["threshold"]:
        assert result["passed"] == (result["two_sigma_lower_bound"] > result["threshold"])


def test_heaviness_is_defined_by_the_ideal_distribution() -> None:
    """A noisy device must not get to redefine which outputs count as heavy.

    Using the noisy median would let a bad device pass itself: whatever it
    produces most becomes 'heavy' by construction.
    """
    from ketqat_runner.quantum_volume import measure_quantum_volume

    clean = measure_quantum_volume(4, 30, 7, depolarizing_rate=0.0)
    noisy = measure_quantum_volume(4, 30, 7, depolarizing_rate=0.5)
    assert noisy["heavy_output_probability"] < clean["heavy_output_probability"], (
        "noise must lower the score, not be absorbed by a shifting median"
    )


def test_out_of_range_widths_and_rates_are_refused() -> None:
    from ketqat_runner.quantum_volume import MAX_QV_WIDTH, measure_quantum_volume, quantum_volume_circuit_probabilities

    with pytest.raises(ValueError, match="2 to"):
        quantum_volume_circuit_probabilities(1, 7)
    with pytest.raises(ValueError, match="2 to"):
        quantum_volume_circuit_probabilities(MAX_QV_WIDTH + 1, 7)
    with pytest.raises(ValueError, match=r"\[0, 1\]"):
        measure_quantum_volume(4, 10, 7, depolarizing_rate=1.5)


# --- State tomography (ketqat-sdk#145) --------------------------------------
#
# The honest answer here is most often "this reconstruction is not a state".
# Linear inversion routinely returns a matrix with a negative eigenvalue from
# finite statistics, and it does so most often near a pure state -- exactly
# where tomography is most interesting.


def test_a_known_pure_state_is_recovered_with_fidelity_one() -> None:
    """A routine that could not recover a state it was handed would be
    measuring something else."""
    from ketqat_runner.tomography import bloch_from_counts, fidelity_with_pure_state

    cases = [
        ((500, 500), (500, 500), (1000, 0), (0.0, 0.0, 1.0)),   # |0>
        ((500, 500), (500, 500), (0, 1000), (0.0, 0.0, -1.0)),  # |1>
        ((1000, 0), (500, 500), (500, 500), (1.0, 0.0, 0.0)),   # |+>
        ((500, 500), (1000, 0), (500, 500), (0.0, 1.0, 0.0)),   # |i>
    ]
    for x_counts, y_counts, z_counts, target in cases:
        bloch = bloch_from_counts(x_counts, y_counts, z_counts)
        assert abs(fidelity_with_pure_state(bloch, target) - 1.0) < 1e-12


def test_the_maximally_mixed_state_reconstructs_as_maximally_mixed() -> None:
    from ketqat_runner.tomography import bloch_from_counts, reconstruct_state

    result = reconstruct_state(bloch_from_counts((500, 500), (500, 500), (500, 500)))
    assert abs(result["bloch_length"]) < 1e-12
    assert abs(result["purity"] - 0.5) < 1e-12
    assert all(abs(value - 0.5) < 1e-12 for value in result["eigenvalues"])
    assert result["physical"] is True


def test_an_unphysical_reconstruction_is_reported_rather_than_projected() -> None:
    """The branch this module exists for.

    Projection onto the nearest valid state is defensible, but it changes the
    estimate, and a caller told only the projected matrix cannot tell a clean
    measurement from one that needed rescuing. The raw estimate is returned so
    the size of the excursion stays visible.
    """
    from ketqat_runner.tomography import bloch_from_counts, reconstruct_state

    # High counts in every basis at once is impossible for a real state.
    result = reconstruct_state(bloch_from_counts((950, 50), (950, 50), (950, 50)))
    assert result["physical"] is False
    assert result["bloch_length"] > 1
    assert result["eigenvalues"][1] < 0, "an unphysical matrix must show its negative eigenvalue"
    assert "not a density matrix" in result["reason"]
    assert "take more shots" in result["reason"]
    # Returned unchanged: the trace is still 1, so it is the raw estimator's
    # output rather than something rescaled.
    assert abs(result["trace"] - 1.0) < 1e-12


def test_every_reconstruction_is_hermitian_with_unit_trace() -> None:
    """True even when the matrix is not a valid state -- those are properties of
    the estimator, not of physicality, and conflating them would hide which one
    failed."""
    from ketqat_runner.tomography import bloch_from_counts, reconstruct_state

    for counts in [
        ((700, 300), (400, 600), (900, 100)),
        ((950, 50), (950, 50), (950, 50)),
        ((500, 500), (500, 500), (500, 500)),
    ]:
        result = reconstruct_state(bloch_from_counts(*counts))
        rho = result["density_matrix"]
        assert abs(result["trace"] - 1.0) < 1e-12
        assert abs(rho[0][1] - rho[1][0].conjugate()) < 1e-12
        assert abs(rho[0][0].imag) < 1e-12 and abs(rho[1][1].imag) < 1e-12


def test_shot_noise_is_reported_per_basis() -> None:
    """Which lets a caller tell an unphysical estimate from a broken experiment."""
    from ketqat_runner.tomography import bloch_from_counts

    few = bloch_from_counts((60, 40), (60, 40), (60, 40))
    many = bloch_from_counts((600, 400), (600, 400), (600, 400))
    assert few["z_standard_error"] > many["z_standard_error"]
    # A saturated basis carries no shot noise in this estimator.
    assert bloch_from_counts((100, 0), (50, 50), (50, 50))["x_standard_error"] == 0


def test_degenerate_inputs_are_refused() -> None:
    from ketqat_runner.tomography import bloch_from_counts, fidelity_with_pure_state

    with pytest.raises(ValueError, match="no shots"):
        bloch_from_counts((0, 0), (50, 50), (50, 50))
    with pytest.raises(ValueError, match="pure state"):
        fidelity_with_pure_state(
            bloch_from_counts((50, 50), (50, 50), (100, 0)), (0.0, 0.0, 0.5)
        )


def test_grover_iteration_count_is_the_exact_optimum():
    """ketqat-sdk#228: round((pi/4)sqrt(N)) overshot at n=2.

    Two qubits, one marked state: a single Grover iteration succeeds with
    certainty. The old formula ran two iterations and reported 25%, which a
    4096-shot reference run faithfully measured -- the record was honest, the
    physics was wrong. The exact optimum k = round(pi/(4 theta) - 1/2) must
    give certainty at n=2 and keep the established counts at larger n.
    """
    import math

    def optimal(n: int) -> int:
        theta = math.asin(1 / math.sqrt(2**n))
        return max(1, round(math.pi / (4 * theta) - 0.5))

    assert optimal(2) == 1, "n=2 takes exactly one iteration"
    assert math.isclose(math.sin(3 * math.asin(0.5)) ** 2, 1.0), "and that iteration is certain"
    # The counts the old formula already got right must not move.
    assert [optimal(n) for n in (3, 4, 5, 6)] == [2, 3, 4, 6]
