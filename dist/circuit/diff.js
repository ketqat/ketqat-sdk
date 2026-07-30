export class CircuitDiffError extends Error {
}
/**
 * Canonical identity of an operation, for alignment.
 *
 * Includes the parameters: `rz(0.5) q[0]` and `rz(0.7) q[0]` are different
 * operations, and treating them as the same would hide an angle change -- the
 * quietest way for a transformation to alter a circuit's meaning.
 */
export function operationKey(operation) {
    const record = operation;
    const bits = (record.qubits ?? (record.qubit ? [record.qubit] : []))
        .map((bit) => `${bit.register}[${bit.index}]`)
        .join(",");
    const parameters = (record.parameters ?? []).map((value) => String(value)).join(",");
    switch (record.kind) {
        case "gate":
            return `gate:${record.name}(${parameters}):${bits}`;
        case "measure":
            return `measure:${bits}->${record.clbit?.register}[${record.clbit?.index}]`;
        case "reset":
            return `reset:${bits}`;
        case "barrier":
            return `barrier:${bits}`;
        case "conditional":
            return `if(${record.register}${record.bit === undefined ? "" : `[${record.bit}]`}==${record.equals}):${record.body ? operationKey(record.body) : "?"}`;
        default:
            return `${record.kind}:${bits}`;
    }
}
/** Longest common subsequence of two key sequences, as index pairs. */
function commonSubsequence(left, right) {
    const rows = left.length;
    const columns = right.length;
    // Guard on the product rather than each length: the table is rows x columns, so a
    // long circuit against a short one is fine while two long ones are not.
    if (rows * columns > 4000000) {
        throw new CircuitDiffError(`Aligning ${rows} against ${columns} operations needs a ${rows}x${columns} table, which this ` +
            "implementation refuses rather than exhausting memory. Diff smaller circuits, or a windowed " +
            "alignment would be needed.");
    }
    const table = Array.from({ length: rows + 1 }, () => new Array(columns + 1).fill(0));
    for (let row = rows - 1; row >= 0; row -= 1) {
        for (let column = columns - 1; column >= 0; column -= 1) {
            ;
            table[row][column] =
                left[row] === right[column]
                    ? table[row + 1][column + 1] + 1
                    : Math.max(table[row + 1][column], table[row][column + 1]);
        }
    }
    const pairs = [];
    let row = 0;
    let column = 0;
    while (row < rows && column < columns) {
        if (left[row] === right[column]) {
            pairs.push([row, column]);
            row += 1;
            column += 1;
        }
        else if (table[row + 1][column] >= table[row][column + 1]) {
            row += 1;
        }
        else {
            column += 1;
        }
    }
    return pairs;
}
/**
 * Diff two circuits operation by operation.
 *
 * Reports per-gate-name deltas alongside the entry list, because "43 operations
 * added" does not say whether a transformation inserted SWAPs or decomposed a
 * Toffoli, and those are different facts about the same count.
 */
export function diffCircuits(left, right) {
    const leftOperations = left.operations;
    const rightOperations = right.operations;
    const leftKeys = leftOperations.map(operationKey);
    const rightKeys = rightOperations.map(operationKey);
    const matched = commonSubsequence(leftKeys, rightKeys);
    const matchedLeft = new Set(matched.map(([index]) => index));
    const matchedRight = new Set(matched.map(([, index]) => index));
    // Walk both sides in order, emitting removals and additions around the matches so
    // the entry list reads as a sequence rather than three separate buckets.
    const entries = [];
    let leftCursor = 0;
    let rightCursor = 0;
    for (const [leftIndex, rightIndex] of matched) {
        while (leftCursor < leftIndex) {
            if (!matchedLeft.has(leftCursor)) {
                entries.push({
                    kind: "removed",
                    operation: leftOperations[leftCursor],
                    leftIndex: leftCursor,
                });
            }
            leftCursor += 1;
        }
        while (rightCursor < rightIndex) {
            if (!matchedRight.has(rightCursor)) {
                entries.push({
                    kind: "added",
                    operation: rightOperations[rightCursor],
                    rightIndex: rightCursor,
                });
            }
            rightCursor += 1;
        }
        entries.push({
            kind: "unchanged",
            operation: leftOperations[leftIndex],
            leftIndex,
            rightIndex,
        });
        leftCursor = leftIndex + 1;
        rightCursor = rightIndex + 1;
    }
    while (leftCursor < leftOperations.length) {
        if (!matchedLeft.has(leftCursor)) {
            entries.push({ kind: "removed", operation: leftOperations[leftCursor], leftIndex: leftCursor });
        }
        leftCursor += 1;
    }
    while (rightCursor < rightOperations.length) {
        if (!matchedRight.has(rightCursor)) {
            entries.push({ kind: "added", operation: rightOperations[rightCursor], rightIndex: rightCursor });
        }
        rightCursor += 1;
    }
    const gateName = (operation) => operation.name ??
        operation.kind;
    const names = new Set([...leftOperations, ...rightOperations].map(gateName));
    const gateDeltas = [...names]
        .map((name) => {
        const leftCount = leftOperations.filter((operation) => gateName(operation) === name).length;
        const rightCount = rightOperations.filter((operation) => gateName(operation) === name).length;
        return { name, left: leftCount, right: rightCount, delta: rightCount - leftCount };
    })
        .filter((entry) => entry.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const added = entries.filter((entry) => entry.kind === "added").length;
    const removed = entries.filter((entry) => entry.kind === "removed").length;
    const unchanged = entries.filter((entry) => entry.kind === "unchanged").length;
    const identical = added === 0 && removed === 0;
    return {
        entries,
        unchanged,
        added,
        removed,
        gateDeltas,
        leftOperationCount: leftOperations.length,
        rightOperationCount: rightOperations.length,
        identical,
        summary: identical
            ? `Identical: ${unchanged} operation(s) unchanged.`
            : `${unchanged} unchanged, ${added} added, ${removed} removed (${leftOperations.length} -> ${rightOperations.length} operations).` +
                (gateDeltas.length > 0
                    ? ` Largest change: ${gateDeltas[0]?.name} ${(gateDeltas[0]?.delta ?? 0) > 0 ? "+" : ""}${gateDeltas[0]?.delta}.`
                    : ""),
    };
}
/**
 * Verify a diff accounts for every operation in both inputs.
 *
 * This is an identity, not a tolerance: a sound diff must reconstruct both sides
 * exactly. A diff that dropped an operation would still render as a plausible list
 * while understating the change, and understating a change is the specific way a
 * diff misleads.
 */
export function verifyDiff(left, right, diff) {
    const fromLeft = diff.entries
        .filter((entry) => entry.kind !== "added")
        .map((entry) => operationKey(entry.operation));
    const fromRight = diff.entries
        .filter((entry) => entry.kind !== "removed")
        .map((entry) => operationKey(entry.operation));
    const leftKeys = left.operations.map(operationKey);
    const rightKeys = right.operations.map(operationKey);
    const reconstructsLeft = fromLeft.length === leftKeys.length && fromLeft.every((key, index) => key === leftKeys[index]);
    const reconstructsRight = fromRight.length === rightKeys.length && fromRight.every((key, index) => key === rightKeys[index]);
    const sound = reconstructsLeft && reconstructsRight;
    return {
        reconstructsLeft,
        reconstructsRight,
        sound,
        detail: sound
            ? `Sound: removed+unchanged reproduces the left circuit (${leftKeys.length} operations) and unchanged+added reproduces the right (${rightKeys.length}).`
            : `UNSOUND: ${!reconstructsLeft ? "removed+unchanged does not reproduce the left circuit" : ""}${!reconstructsLeft && !reconstructsRight ? "; " : ""}${!reconstructsRight ? "unchanged+added does not reproduce the right circuit" : ""}. The diff has ` +
                "lost or reordered an operation, so it understates or misstates the change.",
    };
}
//# sourceMappingURL=diff.js.map