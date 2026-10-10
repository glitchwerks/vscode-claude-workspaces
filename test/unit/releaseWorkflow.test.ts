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
  if?: string;
  name?: string;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
};

type Workflow = {
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
  on?: {
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
