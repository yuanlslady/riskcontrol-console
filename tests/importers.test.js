import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeImportedPositions,
  parseBrokerScreenshotResponse,
  recalculateImportedDraftWeights,
  updateImportedDraft,
} from "../src/lib/importers.js";

test("parseBrokerScreenshotResponse extracts JSON object payload", () => {
  const raw =
    'Result:\n{"totalPortfolioAmount":"221349.68","positions":[{"ticker":"AAPL","name":"Apple","lastPrice":"210.5","portfolioWeight":"12.3%"}]}';
  const parsed = parseBrokerScreenshotResponse(raw);

  assert.equal(parsed.positions.length, 1);
  assert.equal(parsed.positions[0].ticker, "AAPL");
  assert.equal(parsed.totalPortfolioAmount, "221349.68");
});

test("normalizeImportedPositions converts strings into app position drafts", () => {
  const drafts = normalizeImportedPositions(
    [
      {
        ticker: " 0700 ",
        name: "Tencent",
        shareCount: "1,000",
        marketValue: "26,360.00",
        lastPrice: "26.360",
        avgCost: "12.916",
        portfolioWeight: "15.6%",
        market: "HK",
      },
    ],
    { totalPortfolioAmount: "221,349.68" },
  );

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].ticker, "0700");
  assert.equal(drafts[0].lastPrice, 26.36);
  assert.equal(drafts[0].avgCost, 12.916);
  assert.equal(drafts[0].shareCount, 1000);
  assert.equal(drafts[0].marketValue, 26360);
  assert.equal(drafts[0].portfolioWeight, 0.156);
  assert.equal(drafts[0].market, "HK");
});

test("normalizeImportedPositions skips rows without ticker", () => {
  const drafts = normalizeImportedPositions([{ name: "No ticker" }]);
  assert.equal(drafts.length, 0);
});

test("normalizeImportedPositions computes portfolio weight from total amount when weight is missing", () => {
  const drafts = normalizeImportedPositions(
    [
      {
        ticker: "07226",
        marketValue: "13,377.60",
        shareCount: "3600",
        lastPrice: "3.716",
        avgCost: "6.029",
      },
    ],
    { totalPortfolioAmount: "221,349.68" },
  );

  assert.equal(drafts[0].marketValue, 13377.6);
  assert.equal(drafts[0].shareCount, 3600);
  assert.ok(Math.abs(drafts[0].portfolioWeight - 0.0604) < 0.0001);
});

test("updateImportedDraft updates one row and recalculates weights", () => {
  const drafts = [
    { ticker: "0700", marketValue: 26360, portfolioWeight: 0.1 },
    { ticker: "07226", marketValue: 13377.6, portfolioWeight: 0.05 },
  ];

  const next = updateImportedDraft(drafts, 1, { marketValue: 20000 }, { totalPortfolioAmount: "221349.68" });

  assert.equal(next[1].marketValue, 20000);
  assert.ok(Math.abs(next[1].portfolioWeight - (20000 / 221349.68)) < 0.0001);
  assert.equal(next[0].portfolioWeight, 26360 / 221349.68);
});

test("recalculateImportedDraftWeights uses total amount for every row", () => {
  const next = recalculateImportedDraftWeights(
    [
      { ticker: "0700", marketValue: 26360, portfolioWeight: 0 },
      { ticker: "07226", marketValue: 13377.6, portfolioWeight: 0 },
    ],
    "221,349.68",
  );

  assert.ok(Math.abs(next[0].portfolioWeight - (26360 / 221349.68)) < 0.0001);
  assert.ok(Math.abs(next[1].portfolioWeight - (13377.6 / 221349.68)) < 0.0001);
});
