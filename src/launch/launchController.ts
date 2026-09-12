import type { WorkspaceSetupService, ClaudeWorkspacesCommandId } from "../activation";
import type { WorkspaceSetupRoot } from "../config/setupController";
import type { WorkspaceConfigV1 } from "../config/workspaceConfig";
import type { ExtensionCommandsApi, ExtensionNotificationsApi } from "../extension";
import type { OutputLogger } from "../logging/outputLogger";
import type { SessionManager } from "../sessions/sessionManager";
import type { SessionNotification } from "../sessions/sessionTypes";
import type { WorkspaceModel } from "../workspace/workspaceModel";
import { type LaunchRequest, type LaunchSpec, type RootAvailability, planLaunch } from "./launchPlanner";
import type { ClaudeCapabilityProbe } from "./claudeCapabilities";
import { planNewClaudeSession, planResumedClaudeSession } from "./sessionLaunch";
import type { ResumableSessionStore, ResumableSessionSnapshot } from "../sessions/resumableSessionStore";

interface LaunchControllerDependencies {
  readonly store: ResumableSessionStore;
  readonly claudeCapabilities: Pick<ClaudeCapabilityProbe, "get">;
  readonly createClaudeSessionId: () => string;
  readonly now: () => number;
  readonly manager: SessionManager;
  readonly logger: OutputLogger;
  readonly setup: WorkspaceSetupService;
  readonly currentWorkspace: () => WorkspaceModel;
  readonly availability: RootAvailability;
  readonly executable: () => string | undefined;
  readonly selectRoot: (roots: readonly WorkspaceSetupRoot[]) => Promise<string | undefined>;
  readonly notifications: ExtensionNotificationsApi;
  readonly commands: ExtensionCommandsApi;
}

/** Resolves current workspace configuration into owned Claude session launches. */
export class LaunchController {
  readonly commandHandlers: Partial<Record<ClaudeWorkspacesCommandId, () => unknown | PromiseLike<unknown>>>;
  private readonly requestsBySpec = new WeakMap<object, LaunchRequest>();
  private readonly resumesBySpec = new WeakMap<object, string>();
  private readonly pendingResumes = new Set<string>();
  private readonly pendingForgets = new Set<string>();

  constructor(private readonly dependencies: LaunchControllerDependencies) {
    this.commandHandlers = {
      "claudeWorkspaces.newSession": () => this.launch({ rootMode: "default" }),
      "claudeWorkspaces.newInFolder": () => this.newInFolder(),
      "claudeWorkspaces.closeSession": () => this.closeActive(),
      "claudeWorkspaces.restartFresh": () => this.restartActive(),
      "claudeWorkspaces.previousSession": () => this.dependencies.manager.activatePrevious(),
      "claudeWorkspaces.nextSession": () => this.dependencies.manager.activateNext(),
      "claudeWorkspaces.configureWorkspace": () => this.configureWorkspace()
    };
  }

  async launch(request: LaunchRequest): Promise<void> {
    const plan = await this.plan(request);
    if (plan === undefined) {
      return;
    }
    await this.launchNewPlan(plan, request);
  }

  /** Assigns fresh identity and persists only a successfully running launch. */
  private async launchNewPlan(plan: LaunchSpec, request: LaunchRequest, replaceId?: string): Promise<void> {
    const claudeSessionId = await this.supportsPersistence(plan.executable)
      ? this.dependencies.createClaudeSessionId()
      : undefined;
    const spec = claudeSessionId === undefined ? plan : planNewClaudeSession(plan, claudeSessionId);
    this.requestsBySpec.set(spec, request);
    if (replaceId !== undefined) {
      await this.dependencies.manager.close(replaceId);
    }
    const session = await this.dependencies.manager.launch(spec, { claudeSessionId });
    if (session?.state === "running" && claudeSessionId !== undefined) {
      const timestamp = new Date(this.dependencies.now()).toISOString();
      await this.dependencies.store.upsert({
        claudeSessionId,
        displayName: session.displayName,
        rootId: spec.root.id,
        rootLabel: spec.root.label,
        rootPath: spec.cwd,
        createdAt: timestamp,
        lastLaunchedAt: timestamp
      }).then(
        () => this.dependencies.logger.persistenceWrite("create", "success", claudeSessionId),
        () => this.dependencies.logger.persistenceWrite("create", "failed", claudeSessionId)
      );
    }
  }

  /** Persists the manager's accepted display name for an identified live session. */
  async renameSession(id: string, displayName: string): Promise<void> {
    this.dependencies.manager.rename(id, displayName);
    const session = this.dependencies.manager.sessions.find((candidate) => candidate.id === id);
    if (session !== undefined && session.claudeSessionId !== null) {
      try {
        await this.dependencies.store.rename(session.claudeSessionId, session.displayName);
        this.dependencies.logger.persistenceWrite("rename", "success", session.claudeSessionId);
      } catch (error) {
        this.dependencies.logger.persistenceWrite("rename", "failed", session.claudeSessionId);
        throw error;
      }
    }
  }

  /** Removes only known inactive metadata after its workspace-state write succeeds. */
  async forgetSession(claudeSessionId: string): Promise<void> {
    if (
      !this.dependencies.store.sessions.some((session) => session.claudeSessionId === claudeSessionId) ||
      this.pendingResumes.has(claudeSessionId) ||
      this.pendingForgets.has(claudeSessionId) ||
      this.isLive(claudeSessionId)
    ) {
      return;
    }
    this.pendingForgets.add(claudeSessionId);
    try {
      await this.dependencies.store.forget(claudeSessionId);
      this.dependencies.logger.persistenceWrite("forget", "success", claudeSessionId);
    } catch {
      this.dependencies.logger.persistenceWrite("forget", "failed", claudeSessionId);
      const action = await this.dependencies.notifications.showErrorMessage(
        "Claude session could not be forgotten.",
        "Open Logs"
      );
      if (action === "Open Logs") {
        this.dependencies.logger.show();
      }
    } finally {
      this.pendingForgets.delete(claudeSessionId);
    }
  }

  /** Resumes only store-owned identities whose exact root is still in this workspace. */
  async resumeSession(claudeSessionId: string): Promise<void> {
    const stored = this.dependencies.store.sessions.find((session) => session.claudeSessionId === claudeSessionId);
    this.dependencies.logger.resumeRequested(stored?.claudeSessionId);
    if (stored === undefined) {
      this.dependencies.logger.resumeRejected("unknown-session");
      return;
    }
    if (this.pendingResumes.has(claudeSessionId) || this.pendingForgets.has(claudeSessionId) ||
        this.isLive(claudeSessionId)) {
      this.dependencies.logger.resumeRejected("already-live", stored.claudeSessionId);
      await this.dependencies.notifications.showWarningMessage("This Claude session is already live.");
      return;
    }
    // Reserve before any asynchronous boundary so rapid requests cannot launch duplicate PTYs.
    this.pendingResumes.add(claudeSessionId);
    try {
      if (!this.hasCurrentRoot(stored)) {
        this.reportResumeFailure(claudeSessionId, true);
        return;
      }
      const executable = this.dependencies.executable()?.trim() || "claude";
      if (!await this.supportsPersistence(executable)) {
        this.reportResumeFailure(claudeSessionId, false, "This Claude executable does not support session resumption.", "unsupported");
        return;
      }
      const plan = await this.plan({ rootMode: "explicit", explicitRoot: stored.rootId }, stored);
      if (plan === undefined) {
        return;
      }
      if (plan.executable !== executable && !await this.supportsPersistence(plan.executable)) {
        this.reportResumeFailure(claudeSessionId, false, "This Claude executable does not support session resumption.", "unsupported");
        return;
      }
      // Recheck after planning/probing: configuration UI and filesystem checks may yield to root changes.
      if (!this.hasCurrentRoot(stored) || plan.root.id !== stored.rootId || plan.cwd !== stored.rootPath) {
        this.reportResumeFailure(claudeSessionId, true);
        return;
      }
      if (!this.dependencies.store.sessions.some((session) => session.claudeSessionId === claudeSessionId) ||
          this.isLive(claudeSessionId)) {
        return;
      }
      const spec = planResumedClaudeSession(plan, claudeSessionId);
      this.resumesBySpec.set(spec, claudeSessionId);
      const session = await this.dependencies.manager.launch(spec, {
        claudeSessionId, displayName: stored.displayName, notifyOnUnexpectedExit: true
      });
      if (session?.state === "running") {
        // This records a launch, not CLI acceptance; a later process failure does not roll it back.
        await this.dependencies.store.updateExisting({
          ...stored, displayName: session.displayName, rootLabel: spec.root.label,
          lastLaunchedAt: new Date(this.dependencies.now()).toISOString()
        }).then(
          () => this.dependencies.logger.persistenceWrite("resume", "success", claudeSessionId),
          () => this.dependencies.logger.persistenceWrite("resume", "failed", claudeSessionId)
        );
      }
    } finally {
      this.pendingResumes.delete(claudeSessionId);
    }
  }

  /** Checks owned live sessions, including provisional and closing records. */
  private isLive(claudeSessionId: string): boolean {
    return this.dependencies.manager.sessions.some((session) => session.claudeSessionId === claudeSessionId);
  }

  /** Requires both workspace identity and exact filesystem path; no fallback or path normalization. */
  private hasCurrentRoot(stored: ResumableSessionSnapshot): boolean {
    const workspace = this.dependencies.currentWorkspace();
    return workspace.isEligible && workspace.roots.some((root) =>
      root.id === stored.rootId && root.uri.fsPath === stored.rootPath
    );
  }

  /** Keeps normal launches available even when the configured CLI cannot advertise persistence. */
  private async supportsPersistence(executable: string): Promise<boolean> {
    this.dependencies.logger.capabilityStarted();
    try {
      if ((await this.dependencies.claudeCapabilities.get(executable)).sessionPersistence) {
        this.dependencies.logger.capabilityResult("supported");
        return true;
      }
      this.dependencies.logger.capabilityResult("unsupported");
    } catch {
      this.dependencies.logger.capabilityResult("failed");
    }
    this.dependencies.logger.startupError(new Error(
      "Session persistence skipped: unsupported flags or failed capability probe."
    ));
    return false;
  }

  /** Offers recovery without deleting stale metadata on dismissal. */
  private reportResumeFailure(
    claudeSessionId: string,
    rootFailure: boolean,
    message?: string,
    reason: "unsupported" | "process-failed" = "process-failed"
  ): void {
    this.dependencies.logger.resumeRejected(rootFailure ? "root-unavailable" : reason, claudeSessionId);
    void this.handleResumeAction(this.dependencies.notifications.showErrorMessage(
      message ?? (rootFailure ? "The saved session's workspace root is unavailable or has changed." : "Claude session could not be resumed."),
      "Start New", "Forget Session", rootFailure ? "Configure Workspace…" : "Open Logs"
    ), claudeSessionId).catch((error: unknown) => this.dependencies.logger.startupError(error));
  }

  /** Handles one resume recovery choice through the current host-owned services. */
  private async handleResumeAction(response: PromiseLike<string | undefined>, claudeSessionId: string): Promise<void> {
    const action = await response;
    if (action === "Start New") {
      await this.launch({ rootMode: "default" });
    } else if (action === "Forget Session") {
      await this.dependencies.store.forget(claudeSessionId).then(
        () => this.dependencies.logger.persistenceWrite("forget", "success", claudeSessionId),
        () => this.dependencies.logger.persistenceWrite("forget", "failed", claudeSessionId)
      );
    } else if (action === "Configure Workspace…") {
      await this.configureWorkspace();
    } else if (action === "Open Logs") {
      this.dependencies.logger.show();
    }
  }

  async newInFolder(): Promise<void> {
    const workspace = this.dependencies.currentWorkspace();
    if (!workspace.isEligible) {
      return;
    }
    const selectedRootId = await this.dependencies.selectRoot(workspace.roots);
    if (selectedRootId !== undefined) {
      await this.launch({ rootMode: "explicit", explicitRoot: selectedRootId });
    }
  }

  async closeActive(): Promise<void> {
    const id = this.dependencies.manager.activeSessionId;
    if (id !== undefined) {
      await this.dependencies.manager.close(id);
    }
  }

  async restartActive(): Promise<void> {
    const id = this.dependencies.manager.activeSessionId;
    if (id !== undefined) {
      await this.restartFresh(id);
    }
  }

  async restartFresh(id: string): Promise<void> {
    const session = this.dependencies.manager.sessions.find((candidate) => candidate.id === id);
    if (session === undefined) {
      return;
    }
    const request: LaunchRequest = { rootMode: "explicit", explicitRoot: session.rootId };
    const spec = await this.plan(request);
    if (spec === undefined) {
      return;
    }
    await this.launchNewPlan(spec, request, id);
  }

  async configureWorkspace(): Promise<void> {
    const workspace = this.dependencies.currentWorkspace();
    if (workspace.isEligible) {
      await this.dependencies.setup.configure(workspace.roots);
    }
  }

  notify(notification: SessionNotification): void {
    const claudeSessionId = this.resumesBySpec.get(notification.spec);
    if (claudeSessionId !== undefined &&
        !(notification.kind === "startup-failed" && isExecutableMissing(notification.error))) {
      this.reportResumeFailure(claudeSessionId, false);
      return;
    }
    const request = this.requestsBySpec.get(notification.spec);
    if (notification.kind === "startup-failed" && isExecutableMissing(notification.error)) {
      void this.handleAction(
        this.dependencies.notifications.showErrorMessage(
          "Claude executable was not found.",
          "Configure Executable",
          "Open Logs"
        ),
        undefined
      );
      return;
    }
    void this.handleAction(
      this.dependencies.notifications.showErrorMessage(
        notification.kind === "startup-failed"
          ? "Claude session failed to start."
          : notification.kind === "immediate-nonzero-exit"
            ? "Claude session exited immediately."
            : "Claude session exited unexpectedly.",
        "Retry",
        "Open Logs"
      ),
      request
    );
  }

  private async plan(request: LaunchRequest, resume?: ResumableSessionSnapshot) {
    this.dependencies.logger.launchRequest(request.rootMode, resume !== undefined);
    const workspace = this.dependencies.currentWorkspace();
    if (!workspace.isEligible) {
      if (resume !== undefined) {
        this.reportResumeFailure(resume.claudeSessionId, true);
      }
      return undefined;
    }
    const config = await this.dependencies.setup.ensureConfigured(workspace.roots) as WorkspaceConfigV1;
    const executable = this.dependencies.executable()?.trim() || undefined;
    const result = await planLaunch(
      request,
      workspace.roots,
      config,
      executable,
      process.env,
      this.dependencies.availability
    );
    if (result.kind === "error") {
      if (resume === undefined) {
        this.reportPlanError(result.error.kind, request.rootMode === "explicit");
      } else {
        this.reportResumeFailure(resume.claudeSessionId, true);
      }
      return undefined;
    }
    result.warnings.forEach((warning) => {
      const message = warning.kind === "default-root-unavailable"
        ? "The configured default root is unavailable; using the first available root."
        : `${warning.skippedRootIds.length} configured import root(s) are unavailable.`;
      void this.dependencies.notifications.showWarningMessage(message);
    });
    this.dependencies.logger.launchPlan(result.spec);
    if (result.spec.skippedImportIds.length > 0) {
      this.dependencies.logger.skippedImports(result.spec.root.id, result.spec.skippedImportIds);
    }
    return result.spec;
  }

  private reportPlanError(kind: string, explicit: boolean): void {
    if (explicit && kind === "root-unavailable") {
      void this.handleAction(
        this.dependencies.notifications.showErrorMessage(
          "The selected workspace root is unavailable.",
          "Configure Workspace"
        ),
        undefined
      );
      return;
    }
    void this.dependencies.notifications.showErrorMessage("No workspace root is available for a Claude session.");
  }

  private async handleAction(
    response: PromiseLike<string | undefined>,
    retryRequest: LaunchRequest | undefined
  ): Promise<void> {
    const action = await response;
    if (action === "Retry" && retryRequest !== undefined) {
      await this.launch(retryRequest);
    } else if (action === "Configure Executable") {
      await this.dependencies.commands.executeCommand(
        "workbench.action.openSettings",
        "claudeWorkspaces.claudeExecutable"
      );
    } else if (action === "Configure Workspace") {
      await this.configureWorkspace();
    } else if (action === "Open Logs") {
      this.dependencies.logger.show();
    }
  }
}

function isExecutableMissing(error: unknown): boolean {
  return (typeof error === "object" && error !== null && "code" in error &&
      (error as { code?: unknown }).code === "ENOENT") ||
    (error instanceof Error && /^File not found: .+/.test(error.message));
}
