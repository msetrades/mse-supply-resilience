import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../src/lib/simulation.ts";

const part = {
  id: "p1",
  name: "Drive belt",
  sku: "BELT-1",
  demand_per_week: 100,
  quantity_on_hand: 150,
  criticality: 5,
};

test("single-source interruption uses stock cover before unmet demand", () => {
  const result = simulateScenario(
    { duration_weeks: 2 },
    [part],
    [{ component_id: "p1", supplier_id: "s1", share_pct: 100 }],
    [{ supplier_id: "s1", availability_pct: 0 }],
    [],
  );
  assert.equal(result.impacts[0].stockout_week, 1.5);
  assert.equal(result.impacts[0].unmet_units, 50);
  assert.equal(result.critical_components, 0);
});

test("partial disruption scales only the affected supplier share", () => {
  const result = simulateScenario(
    { duration_weeks: 1 },
    [part],
    [
      { component_id: "p1", supplier_id: "s1", share_pct: 50 },
      { component_id: "p1", supplier_id: "s2", share_pct: 50 },
    ],
    [{ supplier_id: "s1", availability_pct: 0 }],
    [],
  );
  assert.equal(result.impacts[0].source_coverage_pct, 50);
  assert.equal(result.impacts[0].weekly_shortfall, 50);
  assert.equal(result.impacts[0].unmet_units, 0);
});

test("available substitutes are surfaced but never subtracted from shortages", () => {
  const substitute = {
    id: "p2",
    name: "Alternate belt",
    sku: "BELT-2",
    demand_per_week: 20,
    quantity_on_hand: 80,
    criticality: 2,
  };
  const result = simulateScenario(
    { duration_weeks: 2 },
    [part, substitute],
    [{ component_id: "p1", supplier_id: "s1", share_pct: 100 }],
    [{ supplier_id: "s1", availability_pct: 0 }],
    [
      {
        component_id: "p1",
        substitute_component_id: "p2",
        conversion_ratio: 0.5,
        approval_status: "pending",
      },
    ],
  );
  assert.equal(result.impacts[0].substitution_options[0].units, 40);
  assert.equal(result.impacts[0].unmet_units, 50);
});

test("coverage shares above 100 percent are capped", () => {
  const result = simulateScenario(
    { duration_weeks: 3 },
    [part],
    [
      { component_id: "p1", supplier_id: "s1", share_pct: 70 },
      { component_id: "p1", supplier_id: "s2", share_pct: 60 },
    ],
    [],
    [],
  );
  assert.equal(result.impacts[0].source_coverage_pct, 100);
  assert.equal(result.impacts[0].severity, "covered");
});

test("negative inventory and invalid source shares fail fast", () => {
  assert.throws(
    () =>
      simulateScenario(
        { duration_weeks: 2 },
        [{ ...part, quantity_on_hand: -1 }],
        [],
        [],
        [],
      ),
    /invalid demand or inventory/,
  );
  assert.throws(
    () =>
      simulateScenario(
        { duration_weeks: 2 },
        [part],
        [{ component_id: "p1", supplier_id: "s1", share_pct: 101 }],
        [],
        [],
      ),
    /between 0 and 100/,
  );
});

test("disruption availability is clamped to a physical percentage", () => {
  const result = simulateScenario(
    { duration_weeks: 1 },
    [part],
    [{ component_id: "p1", supplier_id: "s1", share_pct: 100 }],
    [{ supplier_id: "s1", availability_pct: -30 }],
    [],
  );
  assert.equal(result.impacts[0].source_coverage_pct, 0);
  assert.equal(result.impacts[0].weekly_shortfall, 100);
});

test("multiple supplier shocks compound by each supplier's assigned share", () => {
  const result = simulateScenario(
    { duration_weeks: 1 },
    [part],
    [
      { component_id: "p1", supplier_id: "s1", share_pct: 60 },
      { component_id: "p1", supplier_id: "s2", share_pct: 40 },
    ],
    [
      { supplier_id: "s1", availability_pct: 0 },
      { supplier_id: "s2", availability_pct: 50 },
    ],
    [],
  );
  assert.equal(result.impacts[0].source_coverage_pct, 20);
  assert.equal(result.impacts[0].weekly_shortfall, 80);
});
