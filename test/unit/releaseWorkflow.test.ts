import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

type WorkflowStep = {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  with?: Record<string, string>;
};

type WorkflowJob = {
  name?: string;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
  on?: {
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

  it("fetches only the source branch derived by release metadata", () => {
    const publishSteps = requireSteps(
      requireJob(publish, "publish"),
      "publish"
    );
    const fetchStep = requireStep(
      publishSteps,
      "Fetch approved release source"
    );

    assert.equal(
      fetchStep.env?.SOURCE_BRANCH,
      "${{ steps.release.outputs.source_branch }}"
    );
    assert.equal(
      fetchStep.run,
      "git -C release-source fetch --no-tags origin " +
        '"+refs/heads/$SOURCE_BRANCH:refs/remotes/origin/$SOURCE_BRANCH"'
    );
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
