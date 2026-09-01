import { z } from "zod"
import type { Contract } from "../intelligence/measurement.js"
import { ArtifactRefSchema, type ArtifactRef } from "./artifact.js"
import { ResourceLimitsSchema, type ResourceLimits } from "./capsule.js"
import { finding, studyPath, type StudyFinding } from "./findings.js"

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
  readonly runner: string
  readonly why: string
}

export const APPROVED_RUNNERS: readonly ApprovedRunner[] = Object.freeze([
  Object.freeze({
    runner: "ketqat-runner",
    why: "the Python execution runner packaged in this repository, whose argv surface is this family's own",
  }),
  Object.freeze({
    runner: "ketqat-engine",
    why: "the TypeScript engine CLI packaged in this repository",
  }),
])

/** The approved runner names, as immutable plain data. */
export const APPROVED_RUNNER_NAMES: readonly string[] = Object.freeze(
  APPROVED_RUNNERS.map((entry) => entry.runner),
)

/** The working lookup, module-private and built from the frozen tuple. */
const approvedRunners = new Set<string>(APPROVED_RUNNER_NAMES)

export function isApprovedRunner(value: string): boolean {
  return approvedRunners.has(value)
}

/**
 * An OCI image digest, in the one spelling that is a digest.
 *
 * A tag is not a digest: `ketqat/runner:1.4` is whatever was pushed under that
 * name most recently, so a recipe pinned to a tag reproduces a different
 * program every time somebody publishes. The algorithm prefix is required for
 * the reason the media type pattern requires lowercase -- one spelling per
 * value, because two spellings of one pin are two records for one run.
 */
const CONTAINER_DIGEST = /^sha256:[0-9a-f]{64}$/

/**
 * An argv element that needs no quoting in any shell.
 *
 * The set is deliberately narrow: letters, digits, and the punctuation that
 * carries no meaning to a shell. No spaces, no quotes, no backslashes, no
 * `$`, no backticks, no newlines, no control characters, no glob characters.
 *
 * Narrow is the point. A wider set would need `renderRecipeCommand` to escape,
 * and an escaper is a small parser written against a shell grammar that differs
 * between shells -- so the display string would be correct for the shell its
 * author had in mind. Refusing at the point the recipe is written moves the
 * decision to a producer who knows what the argument is, and leaves the
 * renderer with nothing to decide.
 *
 * An argument that genuinely needs a space is an argument that should be two
 * elements, which is what a vector is for.
 */
const SAFE_ARGV_ELEMENT = /^[A-Za-z0-9_@%+=:,./-]+$/

/**
 * An environment variable name, and only a name.
 *
 * The pattern refuses `=` on purpose, so `NAME=value` cannot be written into a
 * list that is documented as names: a value smuggled into this list would be a
 * secret in a file that gets published.
 */
const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]{0,127}$/

/**
 * A host an allowlisted run may reach.
 *
 * A hostname or an IP literal, with no scheme, no path and no port: those are
 * three more places for two spellings of one host to appear, and a policy read
 * two ways is not a policy.
 */
const ALLOWED_HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

/**
 * Whether the run may reach the network at all.
 *
 * `NONE` and an empty host list is the reproducible case and the one a reader
 * should expect: a run that fetches at execution time reproduces whatever the
 * network says today. `ALLOWLIST` exists because a hardware submission has to
 * reach its provider, and naming the hosts is what makes that visible rather
 * than implicit.
 */
export const NetworkPolicySchema = z.enum(["NONE", "ALLOWLIST"])
export type NetworkPolicy = z.infer<typeof NetworkPolicySchema>

export interface PlatformRequirement {
  operating_system: string
  architecture: string
  minimum_runner_version: string | null
}

export const PlatformRequirementSchema: Contract<PlatformRequirement> = z
  .object({
    /** `linux`, `darwin`, `windows`: what the image was built for, not what produced the study. */
    operating_system: z.string().min(1).max(64),
    /** `x86_64`, `aarch64`. A run on the other one is a different run, and often a different result. */
    architecture: z.string().min(1).max(64),
    /**
     * The oldest runner that understands this recipe, where the recipe uses
     * something a newer runner added. Null when any approved runner will do.
     */
    minimum_runner_version: z.string().min(1).max(64).nullable(),
  })
  .strict()

export interface ReproductionRecipe {
  runner: string
  runner_version: string
  container_digest: string
  argv: string[]
  input_refs: ArtifactRef[]
  environment_allowlist: string[]
  expected_output_refs: ArtifactRef[]
  resource_limits: ResourceLimits
  network_policy: NetworkPolicy
  allowed_hosts: string[]
  platform: PlatformRequirement
}

export const ReproductionRecipeSchema: Contract<ReproductionRecipe> = z
  .object({
    /**
     * Which program runs. Checked against `APPROVED_RUNNERS` by
     * `recipeFindings` rather than by a `z.enum` here, because a recipe naming
     * an unapproved runner is a well-formed record of a manual reproduction --
     * it is only an automatically executable contract that this build refuses.
     */
    runner: z.string().min(1).max(128),
    runner_version: z.string().min(1).max(64),
    container_digest: z.string().regex(CONTAINER_DIGEST, {
      message:
        "A container pin is an image digest, `sha256:` and 64 lowercase hex characters. A tag is not a pin: it " +
        "resolves to whatever was pushed under that name most recently.",
    }),
    /**
     * The argument vector, without the runner, which is named above.
     *
     * At least one element: a recipe with an empty vector says a program runs
     * and does not say what it is asked to do.
     */
    argv: z
      .array(
        z.string().min(1).max(1024).regex(SAFE_ARGV_ELEMENT, {
          message:
            "An argv element carries only characters no shell treats specially. An argument that needs a space " +
            "is two arguments, and an argument that needs a quote is an argument a display string would have to " +
            "escape -- which is the escaping this vector exists to avoid.",
        }),
      )
      .min(1)
      .max(256),
    /** The files the run reads, by typed reference rather than by path. */
    input_refs: z.array(ArtifactRefSchema).max(256),
    /**
     * Variable names the run may read. Names only -- never `NAME=value`.
     *
     * The pattern refuses `=`, so a value cannot be written here by accident,
     * and a published package cannot come to carry a credential because
     * somebody was in a hurry.
     */
    environment_allowlist: z
      .array(
        z.string().regex(ENVIRONMENT_NAME, {
          message:
            "An environment allowlist carries variable names, never values: uppercase, digits and underscores, " +
            "starting with a letter. A `NAME=value` entry would put a secret in a file that gets published.",
        }),
      )
      .max(64),
    /** What the run is expected to produce, so a reproduction has something to compare against. */
    expected_output_refs: z.array(ArtifactRefSchema).max(256),
    resource_limits: ResourceLimitsSchema,
    network_policy: NetworkPolicySchema,
    allowed_hosts: z.array(z.string().regex(ALLOWED_HOST).max(253)).max(64),
    platform: PlatformRequirementSchema,
  })
  .strict()
  .superRefine((recipe, context) => {
    // A policy that says no network and then names hosts is two statements
    // about one decision, and a runner reading either of them alone behaves
    // correctly and differently. Refused where it is written rather than
    // resolved in favour of one of them.
    if (recipe.network_policy === "NONE" && recipe.allowed_hosts.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The recipe declares that the run takes no network and then names hosts it may reach. Two readings of " +
          "one policy is not a policy: a runner honouring the first blocks a run the second permits.",
        path: ["allowed_hosts"],
      })
    }
    if (recipe.network_policy === "ALLOWLIST" && recipe.allowed_hosts.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "An allowlist policy with an empty list permits nothing, which is what NONE says, and says it in a way " +
          "a reader will take for an oversight rather than a decision.",
        path: ["allowed_hosts"],
      })
    }
  }) as unknown as Contract<ReproductionRecipe>

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
export function renderRecipeCommand(recipe: ReproductionRecipe): string {
  return [recipe.runner, ...recipe.argv].join(" ")
}

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
export function recipeFindings(
  recipe: ReproductionRecipe,
  carriedArtifactHashes: ReadonlySet<string>,
  section = "recipe",
): StudyFinding[] {
  const findings: StudyFinding[] = []

  if (!isApprovedRunner(recipe.runner)) {
    findings.push(
      finding(
        "RECIPE_RUNNER_NOT_APPROVED",
        studyPath(section, "runner"),
        `This build does not approve ${JSON.stringify(recipe.runner)} for automatic execution. Approved runners: ` +
          `${APPROVED_RUNNER_NAMES.join(", ")}. The recipe is still a readable record of a manual reproduction; ` +
          "it is not an instruction anything here will follow.",
      ),
    )
  }

  const seenNames = new Set<string>()
  const sections: readonly (readonly [string, readonly ArtifactRef[]])[] = [
    ["input_refs", recipe.input_refs],
    ["expected_output_refs", recipe.expected_output_refs],
  ]
  for (const [key, refs] of sections) {
    refs.forEach((ref, index) => {
      const scoped = `${key}:${ref.name}`
      if (seenNames.has(scoped)) {
        findings.push(
          finding(
            "RECIPE_ARTIFACT_UNRESOLVED",
            studyPath(section, key, index, "name"),
            `The recipe names ${JSON.stringify(ref.name)} twice in ${key}. Two entries under one name are two ` +
              "readings of one slot, and a runner indexing by name uses whichever it saw last.",
          ),
        )
      }
      seenNames.add(scoped)
      // Only artifacts the package itself carries can be checked from the file.
      // A `PROVIDER_HELD` or `NOT_RETAINED` reference is a statement about bytes
      // this reader cannot fetch, and refusing it would refuse the honest record
      // of a hardware run.
      if (ref.resolution.kind !== "INLINE_IN_BUNDLE") return
      if (carriedArtifactHashes.has(ref.content_hash)) return
      findings.push(
        finding(
          "RECIPE_ARTIFACT_UNRESOLVED",
          studyPath(section, key, index, "content_hash"),
          `The recipe says ${JSON.stringify(ref.name)} travels inside this package, and no artifact in it has ` +
            `hash ${ref.content_hash}. A reproduction that cannot open its own inputs is not one a recipient can ` +
            "run.",
        ),
      )
    })
  }

  return findings
}
