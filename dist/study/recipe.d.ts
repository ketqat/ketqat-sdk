import { z } from "zod";
import type { Contract } from "../intelligence/measurement.js";
import { type ArtifactRef } from "./artifact.js";
import { type ResourceLimits } from "./capsule.js";
import { type StudyFinding } from "./findings.js";
/**
 * How to run this study again, as a structure rather than a sentence (goal §14.4).
 *
 * The field this replaces was `reproduction_command: string`, and it was a
 * contract in the worst sense: a free-form shell command, published inside a
 * file, that a reader is invited to paste into a shell and an orchestrator is
 * tempted to execute. Everything an attacker needs is already there --
 * substitution, redirection, a second command after a semicolon -- and none of
 * it is visible as anything other than the command it is pretending to be. A
 * string is not a thing you can check; it is a thing you can only run.
 *
 * So the recipe is the parts, and the command a reader sees is *generated* from
 * them. Which runner, at which version, from which container image, with which
 * argument vector, over which inputs, with which environment variables allowed
 * through by name, producing which outputs, inside which resource ceiling,
 * under which network policy, on which platform. Each of those is a question a
 * reviewer can answer about a recipe and cannot answer about a command line.
 *
 * Two consequences worth stating.
 *
 * **The argument vector is a vector.** There is no shell between the recipe and
 * the process, so there is no quoting, no word splitting and no interpolation.
 * `renderRecipeCommand` builds a display string by joining elements that have
 * already been refused if they contain anything a shell would treat specially,
 * which means the rendering is a concatenation rather than an escaping -- and
 * an escaping is where this class of bug lives.
 *
 * **The environment is an allowlist of names, never of values.** A recipe that
 * carried values would be a credential store with a hash on it. What it carries
 * is the list of variables the run is permitted to read, so a reader can see
 * that a reproduction depends on `KETQAT_API_TOKEN` without the token being in
 * the file, and an orchestrator can refuse to pass anything else.
 */
/**
 * The runners this build is willing to see in an executable recipe.
 *
 * A closed list, for `ArtifactRole`'s reason and one more: this field is the
 * one an automatic runner branches on. An open string would mean a recipe could
 * name any executable on the machine and the refusal would have to come from
 * somewhere downstream, which is a refusal that arrives after the decision.
 *
 * A recipe naming something else is not refused as a *record* -- studies are
 * reproduced by hand and by tools this repository has never heard of -- but it
 * is refused as an automatically executable one, which is the claim
 * `RECIPE_RUNNER_NOT_APPROVED` is about.
 */
export interface ApprovedRunner {
    readonly runner: string;
    readonly why: string;
}
export declare const APPROVED_RUNNERS: readonly ApprovedRunner[];
/** The approved runner names, as immutable plain data. */
export declare const APPROVED_RUNNER_NAMES: readonly string[];
export declare function isApprovedRunner(value: string): boolean;
/**
 * Whether the run may reach the network at all.
 *
 * `NONE` and an empty host list is the reproducible case and the one a reader
 * should expect: a run that fetches at execution time reproduces whatever the
 * network says today. `ALLOWLIST` exists because a hardware submission has to
 * reach its provider, and naming the hosts is what makes that visible rather
 * than implicit.
 */
export declare const NetworkPolicySchema: z.ZodEnum<["NONE", "ALLOWLIST"]>;
export type NetworkPolicy = z.infer<typeof NetworkPolicySchema>;
export interface PlatformRequirement {
    operating_system: string;
    architecture: string;
    minimum_runner_version: string | null;
}
export declare const PlatformRequirementSchema: Contract<PlatformRequirement>;
export interface ReproductionRecipe {
    runner: string;
    runner_version: string;
    container_digest: string;
    argv: string[];
    input_refs: ArtifactRef[];
    environment_allowlist: string[];
    expected_output_refs: ArtifactRef[];
    resource_limits: ResourceLimits;
    network_policy: NetworkPolicy;
    allowed_hosts: string[];
    platform: PlatformRequirement;
}
export declare const ReproductionRecipeSchema: Contract<ReproductionRecipe>;
/**
 * The command a reader is shown, built by concatenation.
 *
 * There is no escaping here and there is nothing to escape: every element has
 * already been refused if it carries a character a shell would act on, so
 * joining with a single space is exact. That is the whole reason
 * `SAFE_ARGV_ELEMENT` is as narrow as it is -- a renderer that had to quote
 * would be a shell-grammar parser embedded in a display function, correct for
 * whichever shell its author was thinking of.
 *
 * What this does **not** produce is a command that runs the container, sets the
 * limits or applies the network policy. Those are the runner's to enforce from
 * the structured fields, and rendering them into a copyable line would invite a
 * reader to paste a command that looks complete and enforces nothing.
 */
export declare function renderRecipeCommand(recipe: ReproductionRecipe): string;
/**
 * Whether this recipe is one this build would run without a person deciding.
 *
 * Reported as findings rather than thrown, because a recipe naming an
 * unapproved runner is a perfectly good record of how a study was reproduced by
 * hand. What it is not is an instruction this build will follow, and the
 * difference is exactly what a caller needs to be told.
 *
 * The artifact checks take the hashes the package carries, because "this recipe
 * names a file" and "this package contains that file" are different claims and
 * only the second is checkable from the file alone.
 */
export declare function recipeFindings(recipe: ReproductionRecipe, carriedArtifactHashes: ReadonlySet<string>, section?: string): StudyFinding[];
//# sourceMappingURL=recipe.d.ts.map