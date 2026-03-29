import assert from "node:assert/strict";
import { defaultState } from "../src/lib/constants.js";
import { loadLocalState } from "../src/lib/repository.js";

function ensureArray(name, value) {
  assert.ok(Array.isArray(value), `${name} 应该是数组`);
}

globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(key, value);
  },
  removeItem(key) {
    this.store.delete(key);
  },
};

ensureArray("defaultState.thesisSnapshots", defaultState.thesisSnapshots);
ensureArray("defaultState.tradeReviewRecords", defaultState.tradeReviewRecords);
ensureArray("defaultState.behaviorProfiles", defaultState.behaviorProfiles);

localStorage.setItem(
  "portfolio-control-react-v1",
  JSON.stringify({
    positions: [],
    thesisSnapshots: [{ id: "snapshot-1", positionId: "position-1" }],
    tradeReviewRecords: [{ id: "record-1", reviewTargetType: "position" }],
    behaviorProfiles: [{ id: "profile-1", profileKey: "fomo_buying" }],
  }),
);

const merged = loadLocalState();

ensureArray("merged.thesisSnapshots", merged.thesisSnapshots);
ensureArray("merged.tradeReviewRecords", merged.tradeReviewRecords);
ensureArray("merged.behaviorProfiles", merged.behaviorProfiles);

assert.equal(merged.thesisSnapshots.length, 1, "thesisSnapshots 应保留本地数据");
assert.equal(merged.tradeReviewRecords.length, 1, "tradeReviewRecords 应保留本地数据");
assert.equal(merged.behaviorProfiles.length, 1, "behaviorProfiles 应保留本地数据");

console.log("repository skeleton check passed");
