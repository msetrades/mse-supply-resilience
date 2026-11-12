export type Component = {
  id: string;
  name: string;
  sku: string;
  demand_per_week: number;
  quantity_on_hand: number;
  criticality: number;
};

export type SourceLink = {
  component_id: string;
  supplier_id: string;
  share_pct: number;
  lead_time_days?: number;
};
export type Disruption = { supplier_id: string; availability_pct: number };
export type Supplier = { id: string; name: string; region: string };
export type Substitute = {
  component_id: string;
  substitute_component_id: string;
  conversion_ratio: number;
  approval_status: string;
};
export type Scenario = { duration_weeks: number };
export type Impact = {
  component_id: string;
  name: string;
  sku: string;
  criticality: number;
  weekly_demand: number;
  source_coverage_pct: number;
  weekly_shortfall: number;
  on_hand: number;
  stockout_week: number | null;
  ending_stock: number;
  unmet_units: number;
  severity: "covered" | "watch" | "exposed" | "critical";
  substitution_options: Array<{
    name: string;
    units: number;
    approval_status: string;
  }>;
};
export type SimulationResult = {
  model_version: string;
  duration_weeks: number;
  impacted_components: number;
  exposed_components: number;
  critical_components: number;
  total_unmet_units: number;
  impacts: Impact[];
  assumptions: string[];
};

export function simulateScenario(
  scenario: Scenario,
  components: Component[],
  sourceLinks: SourceLink[],
  disruptions: Disruption[],
  substitutes: Substitute[],
): SimulationResult {
  if (
    !Number.isFinite(scenario.duration_weeks) ||
    scenario.duration_weeks <= 0
  ) {
    throw new Error("Scenario duration must be positive.");
  }
  for (const component of components) {
    if (
      !Number.isFinite(component.demand_per_week) ||
      component.demand_per_week < 0 ||
      !Number.isFinite(component.quantity_on_hand) ||
      component.quantity_on_hand < 0
    ) {
      throw new Error(
        `Component ${component.sku} has invalid demand or inventory.`,
      );
    }
  }
  for (const link of sourceLinks) {
    if (
      !Number.isFinite(link.share_pct) ||
      link.share_pct < 0 ||
      link.share_pct > 100
    ) {
      throw new Error(
        "Supplier source shares must be between 0 and 100 percent.",
      );
    }
  }
  for (const disruption of disruptions) {
    if (!Number.isFinite(disruption.availability_pct))
      throw new Error("Supplier availability must be a number.");
  }
  const availability = new Map(
    disruptions.map((row) => [
      row.supplier_id,
      Math.max(0, Math.min(100, row.availability_pct)),
    ]),
  );
  const byComponent = new Map<string, SourceLink[]>();
  for (const link of sourceLinks)
    byComponent.set(link.component_id, [
      ...(byComponent.get(link.component_id) ?? []),
      link,
    ]);

  const impacts = components.map((component): Impact => {
    const links = byComponent.get(component.id) ?? [];
    const weightedSupplyPct = Math.min(
      100,
      links.reduce((sum, link) => {
        const available = availability.get(link.supplier_id) ?? 100;
        return sum + (link.share_pct * available) / 100;
      }, 0),
    );
    const weeklyShortfall =
      component.demand_per_week * (1 - weightedSupplyPct / 100);
    const stockoutWeek =
      weeklyShortfall > 0 ? component.quantity_on_hand / weeklyShortfall : null;
    const consumed = weeklyShortfall * scenario.duration_weeks;
    const endingStock = Math.max(0, component.quantity_on_hand - consumed);
    const unmetUnits = Math.max(0, consumed - component.quantity_on_hand);
    const supplyInterrupted = weeklyShortfall > 0;
    const severity: Impact["severity"] =
      weeklyShortfall === 0
        ? "covered"
        : stockoutWeek !== null &&
            stockoutWeek <= 1 &&
            component.criticality >= 4
          ? "critical"
          : unmetUnits > 0
            ? "exposed"
            : "watch";
    const substitutionOptions = substitutes
      .filter((option) => option.component_id === component.id)
      .map((option) => {
        const substitute = components.find(
          (item) => item.id === option.substitute_component_id,
        );
        return substitute
          ? {
              name: substitute.name,
              units: Math.floor(
                substitute.quantity_on_hand * option.conversion_ratio,
              ),
              approval_status: option.approval_status,
            }
          : null;
      })
      .filter((option): option is NonNullable<typeof option> =>
        Boolean(option),
      );

    return {
      component_id: component.id,
      name: component.name,
      sku: component.sku,
      criticality: component.criticality,
      weekly_demand: component.demand_per_week,
      source_coverage_pct: weightedSupplyPct,
      weekly_shortfall: weeklyShortfall,
      on_hand: component.quantity_on_hand,
      stockout_week: stockoutWeek,
      ending_stock: endingStock,
      unmet_units: unmetUnits,
      severity: supplyInterrupted ? severity : "covered",
      substitution_options: substitutionOptions,
    };
  });

  return {
    model_version: "share-of-supply-v1",
    duration_weeks: scenario.duration_weeks,
    impacted_components: impacts.filter((row) => row.weekly_shortfall > 0)
      .length,
    exposed_components: impacts.filter((row) => row.unmet_units > 0).length,
    critical_components: impacts.filter((row) => row.severity === "critical")
      .length,
    total_unmet_units: impacts.reduce((sum, row) => sum + row.unmet_units, 0),
    impacts: impacts.sort(
      (a, b) => b.criticality - a.criticality || b.unmet_units - a.unmet_units,
    ),
    assumptions: [
      "Source shares represent the proportion of each component's weekly demand covered by a supplier.",
      "Disruption availability scales source capacity linearly for the full scenario duration.",
      "On-hand inventory is consumed only by the modeled supply shortfall; normal supplier deliveries continue.",
      "Substitute inventory is displayed as an option, not deducted or counted as protection until approved and allocated.",
      "The model does not include lead-time variance, transport constraints, price changes, minimum order quantities, or probabilistic failure.",
    ],
  };
}
