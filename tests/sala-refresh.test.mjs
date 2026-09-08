import assert from "node:assert/strict";
import { test } from "node:test";
import { createSalaRefreshQueue, createSalaRequestScope } from "../app/(app)/sala/sala-refresh.ts";

test("a later refresh aborts and invalidates an older response", () => {
  const scope = createSalaRequestScope();
  const oldRequest = scope.begin();
  const latestRequest = scope.begin();
  assert.equal(oldRequest.controller.signal.aborted, true);
  assert.equal(oldRequest.isCurrent(), false);
  assert.equal(latestRequest.isCurrent(), true);
  assert.equal(latestRequest.controller.signal.aborted, false);
});

test("unmount or restaurant/date change prevents writes and later requests", () => {
  const oldScope = createSalaRequestScope();
  const oldRequest = oldScope.begin();
  oldScope.dispose();
  assert.equal(oldRequest.controller.signal.aborted, true);
  assert.equal(oldRequest.isCurrent(), false);
  assert.equal(oldScope.begin(), null);

  const newScope = createSalaRequestScope();
  assert.equal(newScope.begin().isCurrent(), true);
  assert.equal(oldRequest.isCurrent(), false);
});

test("an active request timeout can report failure instead of leaving loading stuck", () => {
  const scope = createSalaRequestScope();
  const request = scope.begin();
  request.controller.abort();
  assert.equal(request.isCurrent(), true);
  scope.dispose();
  assert.equal(request.isCurrent(), false);
});

test("event bursts queue only one follow-up read without starving a slow snapshot", async () => {
  const reads = [];
  const resolvers = [];
  const refresh = createSalaRefreshQueue((silent) => {
    reads.push(silent);
    return new Promise((resolve) => resolvers.push(resolve));
  }, () => false);

  const initial = refresh(false);
  const duringInitial = [refresh(true), refresh(true), refresh(true)];
  assert.deepEqual(reads, [false]);
  resolvers.shift()();
  await Promise.resolve();
  assert.deepEqual(reads, [false, true]);
  resolvers.shift()();
  await Promise.all([initial, ...duringInitial]);
  assert.equal(reads.length, 2);
});

test("a disposed view neither starts new reads nor runs its queued refresh", async () => {
  let disposed = false;
  let readCount = 0;
  let finishRead;
  const refresh = createSalaRefreshQueue(() => {
    readCount += 1;
    return new Promise((resolve) => { finishRead = resolve; });
  }, () => disposed);
  const pending = refresh();
  refresh(true);
  disposed = true;
  finishRead();
  await pending;
  await refresh();
  assert.equal(readCount, 1);
});
