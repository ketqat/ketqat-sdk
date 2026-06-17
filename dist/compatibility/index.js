function reason(code, message, path) {
    return { code, message, path };
}
export function compareRunCompatibility(left, right, suites = []) {
    const reasons = [];
    if (left.domain !== right.domain) {
        reasons.push(reason("DOMAIN_MISMATCH", "Runs from QEC and algorithm domains cannot be compared.", "domain"));
    }
    if (left.benchmark_suite !== right.benchmark_suite) {
        reasons.push(reason("BENCHMARK_SUITE_MISMATCH", "Benchmark suite slugs differ.", "benchmark_suite"));
    }
    if (left.benchmark_suite_version !== right.benchmark_suite_version) {
        reasons.push(reason("BENCHMARK_VERSION_MISMATCH", "Benchmark suite versions differ.", "benchmark_suite_version"));
    }
    if (left.schema_version !== right.schema_version) {
        reasons.push(reason("SCHEMA_VERSION_MISMATCH", "Result schema versions differ.", "schema_version"));
    }
    const suite = suites.find((candidate) => candidate.slug === left.benchmark_suite &&
        candidate.version === left.benchmark_suite_version &&
        candidate.domain === left.domain);
    if (suite) {
        const leftMetrics = new Set(left.metric_points.map((point) => point.metric));
        const rightMetrics = new Set(right.metric_points.map((point) => point.metric));
        const requiredMetrics = suite.metric_definitions.map((metric) => metric.name);
        for (const metric of requiredMetrics) {
            if (!leftMetrics.has(metric) || !rightMetrics.has(metric)) {
                reasons.push(reason("METRIC_MISSING", `Required metric '${metric}' is missing from one run.`, "metric_points"));
            }
        }
    }
    return { compatible: reasons.length === 0, reasons };
}
export function findComparableMetricCoordinates(left, right) {
    if (left.domain !== right.domain) {
        return [];
    }
    const rightCoordinates = new Set(right.metric_points.map(metricCoordinateKey));
    return Array.from(new Set(left.metric_points.map(metricCoordinateKey))).filter((coordinate) => rightCoordinates.has(coordinate));
}
export function compareExactReproductionConfiguration(left, right) {
    const base = compareRunCompatibility(left, right);
    const reasons = [...base.reasons];
    if (left.reproducibility_hash !== right.reproducibility_hash) {
        reasons.push(reason("HASH_MISMATCH", "Reproducibility hashes differ.", "reproducibility_hash"));
    }
    return { compatible: reasons.length === 0, reasons };
}
function metricCoordinateKey(point) {
    if ("code_distance" in point || "physical_error_rate" in point) {
        return [
            point.metric,
            `distance=${point.code_distance ?? "any"}`,
            `p=${point.physical_error_rate ?? "any"}`,
        ].join("|");
    }
    if ("qubit_count" in point) {
        return [point.metric, `qubits=${point.qubit_count ?? "any"}`].join("|");
    }
    return point.metric;
}
//# sourceMappingURL=index.js.map