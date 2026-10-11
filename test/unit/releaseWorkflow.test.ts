import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

type WorkflowStep = {
  id?: string;
  uses?: string;
  env?: Record<string, string>;
  name?: string;
  run?: string;
  with?: Record<string, string>;
};

type WorkflowJob = {
  strategy?: { matrix?: { os?: string[] } };
  if?: string;
  name?: string;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
};

type Workflow = {
  concurrency?: { group: string; "cancel-in-progress"?: boolean };
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
  on?: {
    merge_group?: { types: string[] };
    pull_request?: { branches?: string[]; paths?: string[] };
    push?: {
      branches?: string[];
    };
  };
};

type YamlModule = {
  load: (source: string) => unknown;
};

const loadModule = createRequire(__filename);
const { load } = loadModule("js-yaml") as YamlModule;

function readWorkflow(filePath: string): Workflow {
  const parsed = load(fs.readFileSync(filePath, "utf8"));
  assert.ok(parsed && typeof parsed === "object" && !Array.isArray(parsed));
  return parsed as Workflow;
}

function requireJob(workflow: Workflow, jobId: string): WorkflowJob {
  const job = workflow.jobs?.[jobId];
  assert.ok(job, `Expected workflow job ${jobId}.`);
  return job;
}

function requireSteps(job: WorkflowJob, jobName: string): WorkflowStep[] {
  assert.ok(Array.isArray(job.steps), `Expected steps for ${jobName}.`);
  return job.steps;
}

function requireStep(steps: WorkflowStep[], name: string): WorkflowStep {
  const step = steps.find((candidate) => candidate.name === name);
  assert.ok(step, `Expected workflow step ${name}.`);
  return step;
}

const ci = readWorkflow(".github/workflows/ci.yml");
const publish = readWorkflow(".github/workflows/publish.yml");

describe("release workflow contracts", () => {
  it("runs prospective merge-group CI and the trusted guard without guard cancellation", () => {
    const guard = readWorkflow(".github/workflows/release-guard.yml");
    for (const workflow of [ci, guard]) {
      assert.deepEqual(workflow.on?.merge_group?.types, ["checks_requested"]);
      assert.ok(workflow.concurrency?.group.includes("github.event_name"));
      assert.ok(workflow.concurrency?.group.includes("github.event.merge_group.head_sha"));
    }
    assert.notEqual(guard.concurrency?.["cancel-in-progress"], true);
    assert.deepEqual(Object.keys(ci.jobs ?? {}).sort(), ["extension-host-integration", "quality", "release-policy"]);
    assert.equal(requireJob(ci, "release-policy").name, "Release Policy");
    assert.equal(requireJob(ci, "quality").name, "Quality (${{ matrix.os }})");
    assert.deepEqual(requireJob(ci, "quality").strategy?.matrix?.os, ["ubuntu-latest", "windows-latest", "macos-latest"]);
    assert.equal(requireJob(ci, "extension-host-integration").name, "Extension Host Integration (Windows)");
    for (const job of Object.values(ci.jobs ?? {})) {
      const checkout = job.steps?.find(step => step.uses?.startsWith("actions/checkout@"));
      assert.ok(checkout);
      assert.equal(checkout.with?.ref, undefined, "CI must use the runner's prospective revision");
    }
    const invocation = requireStep(requireSteps(requireJob(guard, "release-guard"), "release-guard"), "Enforce release routing and scope");
    assert.equal(invocation.env?.POLICY_EVENT_NAME, "${{ github.event_name }}");
    assert.equal(invocation.env?.POLICY_EVENT_SHA, "${{ github.sha }}");
    assert.equal(invocation.env?.POLICY_EVENT_REF, "${{ github.ref }}");
  });
  it("keeps PR and successive queue builds in separate concurrency groups", () => {
    function render(template: string, context: Record<string, unknown>) {
      return template.replace(/\$\{\{([^}]+)\}\}/g, (_all: string, expr: string) => {
        const result = expr.split("||").map(term => term.trim().split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], context)).find(Boolean);
        return String(result ?? "");
      });
    }
    const contexts = [{ github: { workflow: "CI", event_name: "pull_request", event: { pull_request: { number: 200 } }, ref: "refs/pull/200/merge" } },
      ...["a", "b"].map(s => ({ github: { workflow: "CI", event_name: "merge_group", event: { merge_group: { head_sha: s.repeat(40) } }, ref: `refs/heads/gh-readonly-queue/main/pr-200-${s}` } }))];
    for (const workflow of [ci, readWorkflow(".github/workflows/release-guard.yml")]) {
      assert.ok(workflow.concurrency);
      assert.equal(new Set(contexts.map(context => render(workflow.concurrency!.group, context))).size, 3);
    }
  });
  it("runs the ruleset guard from main-owned automation with read-only access and no candidate install", () => {
    assert.ok(fs.existsSync(".github/workflows/release-guard.yml"), "trusted required workflow is missing");
    const workflow = readWorkflow(".github/workflows/release-guard.yml");
    assert.deepEqual(workflow.permissions, {});
    assert.ok(workflow.on?.pull_request);
    assert.equal(workflow.on.pull_request.paths, undefined);
    const job = requireJob(workflow, "release-guard");
    assert.equal(job.if, undefined);
    const steps = requireSteps(job, "release-guard");
    const checkout = steps.find(step => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout?.with?.ref, "${{ github.workflow_sha }}");
    assert.equal(checkout?.with?.path, "automation");
    const invocation = requireStep(steps, "Enforce release routing and scope");
    assert.equal(invocation.run, "node automation/scripts/check-release-pr.js");
    assert.equal(invocation.env?.POLICY_WORKFLOW_SHA, "${{ github.workflow_sha }}");
    assert.ok(!steps.some(step => /npm (ci|install)|release-source|secrets\./.test(JSON.stringify(step))));
  });
  it("grants only the API permissions required by guard evidence and existing publication writes", () => {
    const guard = requireJob(readWorkflow(".github/workflows/release-guard.yml"), "release-guard");
    // Issue validation is exclusive to policy admission; publication consumes
    // published sources, merged PRs and maintenance evidence, then uploads a release.
    assert.equal(guard.permissions?.issues, "read", "policy approval/disposition issue evidence needs Issues read");
    assert.deepEqual(guard.permissions, {
      contents: "read", // Git refs/tags, release and commit comparison evidence.
      "pull-requests": "read", // Candidate/forward-port and commit-associated PRs.
      actions: "read", // Exact successful Publish runs and validated-source jobs.
      issues: "read" // Ordinary issues referenced by new policy records.
    });
    assert.deepEqual(requireJob(publish, "publish").permissions, {
      contents: "write", // Existing release creation/upload also permits content reads.
      actions: "read",
      "pull-requests": "read"
    });
  });
  it("runs push CI on main and versioned prerelease branches", () => {
    const branches = ci.on?.push?.branches;
    assert.ok(Array.isArray(branches));
    assert.ok(branches.includes("main"));
    assert.ok(branches.includes("prerelease/**"));
  });

  it("exposes exactly one focused Release Policy check", () => {
    const policyJobs = Object.values(ci.jobs ?? {}).filter(
      (job) => job.name === "Release Policy"
    );
    assert.equal(policyJobs.length, 1);

    const policyJob = policyJobs[0];
    assert.ok(policyJob);
    assert.equal(policyJob.permissions?.contents, "read");

    const focusedSteps = requireSteps(policyJob, "Release Policy").filter(
      (step) => step.run === "npm run test:release-policy"
    );
    assert.equal(focusedSteps.length, 1);
  });

  it("defers source ancestry fetching to trusted preflight so retired historical branches do not fail before proof", () => {
    const steps = requireSteps(requireJob(publish, "publish"), "publish");
    const validation = steps.findIndex(step => step.name === "Validate release source");
    assert.ok(validation >= 0);
    const beforeValidation = steps.slice(0, validation);
    assert.equal(beforeValidation.some(step => step.run?.includes("refs/heads/$SOURCE_BRANCH")), false);
    assert.equal(beforeValidation.some(step => step.name === "Install dependencies"), false);
  });

  it("loads trusted automation while packaging the tagged release source", () => {
    const publishSteps = requireSteps(
      requireJob(publish, "publish"),
      "publish"
    );
    const automationCheckout = requireStep(
      publishSteps,
      "Check out release tooling"
    );
    const sourceCheckout = requireStep(
      publishSteps,
      "Check out release source"
    );

    assert.equal(
      automationCheckout.with?.ref,
      "${{ github.event.repository.default_branch }}"
    );
    assert.equal(
      sourceCheckout.with?.ref,
      "${{ github.event_name == 'workflow_dispatch' && " +
        "format('refs/tags/{0}', inputs.tag) || github.ref }}"
    );
  });

  it("validates the tagged source before installation and publication writes", () => {
    const publishSteps = requireSteps(
      requireJob(publish, "publish"),
      "publish"
    );
    const validation = publishSteps.findIndex(
      (step) => step.name === "Validate release source"
    );
    assert.ok(validation >= 0);
    assert.equal(publishSteps[validation]?.env?.GH_TOKEN, "${{ github.token }}");
    assert.equal(requireJob(publish, "publish").permissions?.actions, "read");
    assert.equal(publishSteps[validation]?.id, "source");
    const receipt = publishSteps.findIndex(step => step.name === "Validated source ${{ steps.release.outputs.tag }} at ${{ steps.source.outputs.source_commit }}");
    assert.ok(receipt > validation);
    assert.ok(receipt < publishSteps.findIndex(step => step.name === "Install dependencies"));
    assert.equal(
      publishSteps[validation]?.run,
      "node automation/scripts/validate-release-source.js " +
        '"$TAG" release-source/package.json release-source/CHANGELOG.md ' +
        "release-source"
    );

    for (const laterStep of [
      "Install dependencies",
      "Publish to VS Code Marketplace",
      "Create or update GitHub Release"
    ]) {
      const laterIndex = publishSteps.findIndex(
        (step) => step.name === laterStep
      );
      assert.ok(laterIndex >= 0, `Expected workflow step ${laterStep}.`);
      assert.ok(validation < laterIndex, `${laterStep} must follow validation.`);
    }
  });
});
