import type { Uri, WorkspaceFolder } from "vscode";

export type RootId = string;

export interface WorkspaceRoot {
  readonly id: RootId;
  readonly label: string;
  readonly uri: Uri;
}

export class WorkspaceModel {
  readonly isEligible: boolean;
  readonly rootIds: readonly RootId[];
  readonly roots: readonly WorkspaceRoot[];

  private constructor(
    workspaceFile: Uri | undefined,
    workspaceFolders: readonly WorkspaceFolder[]
  ) {
    this.isEligible = workspaceFile?.scheme === "file";
    this.roots = workspaceFolders.map((folder) => ({
      id: folder.uri.toString(true),
      label: folder.name,
      uri: folder.uri
    }));
    this.rootIds = this.roots.map(({ id }) => id);
  }

  static from(
    workspaceFile: Uri | undefined,
    workspaceFolders: readonly WorkspaceFolder[] | undefined
  ): WorkspaceModel {
    return new WorkspaceModel(workspaceFile, workspaceFolders ?? []);
  }
}
