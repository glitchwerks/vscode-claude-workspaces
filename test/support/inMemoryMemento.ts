/** In-memory workspace-state test double. */
export class InMemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(value: unknown = undefined) {
    if (value !== undefined) {
      this.values.set("claudeWorkspaces.config", value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  storedValue(): unknown {
    return this.values.get("claudeWorkspaces.config");
  }
}
