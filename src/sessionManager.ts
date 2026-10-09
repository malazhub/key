
export interface SessionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class SynchronizedSessionManager {
  private readonly sessions = new Map<
    string,
    SessionMessage[]
  >();

  private readonly locks = new Map<string, Promise<void>>();

  private requireSessionId(sessionId: string): string {
    const id = sessionId.trim();

    if (!id) {
      throw new Error("A non-empty session ID is required.");
    }

    return id;
  }

  async append(
    sessionId: string,
    message: SessionMessage
  ): Promise<void> {
    const id = this.requireSessionId(sessionId);
    const previous = this.locks.get(id) ?? Promise.resolve();

    const operation = previous.then(() => {
      const history = this.sessions.get(id) ?? [];
      history.push({ ...message });
      this.sessions.set(id, history);
    });

    this.locks.set(id, operation);

    try {
      await operation;
    } finally {
      if (this.locks.get(id) === operation) {
        this.locks.delete(id);
      }
    }
  }

  getHistory(sessionId: string): SessionMessage[] {
    const id = this.requireSessionId(sessionId);

    return (this.sessions.get(id) ?? []).map(
      (message) => ({ ...message })
    );
  }

  clearSession(sessionId: string): void {
    const id = this.requireSessionId(sessionId);

    if (this.locks.has(id)) {
      throw new Error(
        "Cannot clear a session while an append is pending."
      );
    }

    this.sessions.delete(id);
  }
}
