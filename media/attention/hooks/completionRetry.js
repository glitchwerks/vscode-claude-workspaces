// Retain confirmations only. Time never establishes that an agent has finished.
export function createCompletionRetry(publish, {
  now = Date.now, makeNonce = () => crypto.randomUUID(), maxStarts = Number.MAX_SAFE_INTEGER
} = {}) {
  const records = new Map();
  let nonce;
  try { nonce = makeNonce(); } catch { /* Original delivery remains available. */ }
  let identity, epoch = 0, counter = 0, timer, inFlight = false, latestApi, timerUnavailable = false;

  function cancelTimer() {
    const previous = timer;
    timer = undefined;
    try { previous?.handle?.cancel(); } catch {
      // Its callback may still exist. Never accumulate more timers in this worker.
      timerUnavailable = true;
      releasePending();
    }
  }
  function end() {
    epoch++;
    identity = undefined;
    records.clear();
    cancelTimer();
    latestApi = undefined;
  }
  function current(record) {
    return identity === record.identity && epoch === record.epoch && records.get(record.id) === record;
  }
  function pendingRecord() {
    let first;
    for (const record of records.values()) {
      if (record.fields !== undefined && (first === undefined || record.due < first.due)) first = record;
    }
    return first;
  }
  function releasePending() {
    for (const [id, record] of records) if (record.fields !== undefined) records.delete(id);
  }
  function schedule(driver) {
    if (inFlight) return;
    cancelTimer();
    if (timerUnavailable) { releasePending(); return; }
    const record = pendingRecord();
    if (record === undefined) return;
    const ticket = {};
    timer = ticket;
    try {
      ticket.handle = driver.clock.after(Math.max(0, record.due - now()), () => run(driver, ticket));
      if (typeof ticket.handle?.cancel !== "function") throw new Error("Timer unavailable");
    } catch {
      timerUnavailable = true;
      cancelTimer();
      releasePending();
    }
  }
  async function run(driver, ticket) {
    if (timer !== ticket || inFlight) return;
    timer = undefined;
    inFlight = true;
    try {
      const record = pendingRecord();
      if (record === undefined || record.due > now() || !current(record)) return;
      let successful = false;
      try {
        const sessionId = await driver.session.id();
        if (!current(record)) return;
        if (sessionId !== identity) { end(); return; }
        successful = await publish(driver, record.fields, sessionId) === true;
      } catch { /* A retry cannot reject the timer callback or another hook. */ }
      if (!current(record)) return;
      record.attempts++;
      if (successful || record.attempts === 3) records.delete(record.id);
      else record.due = now() + (record.attempts === 1 ? 15000 : 30000);
    } finally {
      inFlight = false;
      schedule(latestApi);
    }
  }
  return {
    activate(sessionId) {
      if (identity === sessionId) return;
      end();
      if (typeof sessionId === "string" && sessionId.length > 0) identity = sessionId;
    },
    started(driver, id) {
      records.delete(id);
      latestApi = driver;
      let generation;
      try {
        if (!timerUnavailable && identity !== undefined && typeof id === "string" && id.length > 0 && records.size < 256 &&
            typeof driver.clock?.after === "function" && typeof nonce === "string" && nonce.length > 0 &&
            counter < Math.min(maxStarts, Number.MAX_SAFE_INTEGER)) {
          generation = nonce + "." + (++counter).toString(36);
          if (generation.length > 128 || /[^A-Za-z0-9.-]/u.test(generation)) generation = undefined;
        }
      } catch { /* Use the original unversioned path if recovery is unavailable. */ }
      if (generation !== undefined) records.set(id, { id, generation, identity, epoch });
      schedule(driver);
      return generation;
    },
    generation(id) { return records.get(id)?.generation; },
    completed(driver, id, generation, fields) {
      const record = records.get(id);
      if (record === undefined || generation === undefined || record.generation !== generation ||
          !current(record) || record.fields !== undefined ||
          !["answer", "aborted", "error", "refusal"].includes(fields.completion_reason) ||
          typeof fields.is_aborted !== "boolean") return;
      // A fresh allowlist also prevents retained private fields from consuming storage.
      record.fields = { hook_event_name: "TurnComplete", agent_id: id, agent_generation: generation,
        completion_reason: fields.completion_reason, is_aborted: fields.is_aborted };
      record.attempts = 0;
      record.due = now() + 5000;
      latestApi = driver;
      schedule(driver);
    },
    end
  };
}
