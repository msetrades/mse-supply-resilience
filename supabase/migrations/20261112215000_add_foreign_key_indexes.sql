-- Index product foreign keys for joins and parent-row updates/deletes.
create index if not exists "mse_fk_components_1" on "supplymesh"."components" ("created_by");
create index if not exists "mse_fk_organizations_1" on "supplymesh"."organizations" ("created_by");
create index if not exists "mse_fk_scenario_disruptions_1" on "supplymesh"."scenario_disruptions" ("created_by");
create index if not exists "mse_fk_scenario_disruptions_2" on "supplymesh"."scenario_disruptions" ("organization_id");
create index if not exists "mse_fk_scenario_disruptions_3" on "supplymesh"."scenario_disruptions" ("scenario_id", "organization_id");
create index if not exists "mse_fk_scenario_disruptions_4" on "supplymesh"."scenario_disruptions" ("supplier_id", "organization_id");
create index if not exists "mse_fk_scenario_runs_1" on "supplymesh"."scenario_runs" ("created_by");
create index if not exists "mse_fk_scenario_runs_2" on "supplymesh"."scenario_runs" ("scenario_id", "organization_id");
create index if not exists "mse_fk_scenarios_1" on "supplymesh"."scenarios" ("created_by");
create index if not exists "mse_fk_scenarios_2" on "supplymesh"."scenarios" ("organization_id");
create index if not exists "mse_fk_source_links_1" on "supplymesh"."source_links" ("component_id", "organization_id");
create index if not exists "mse_fk_source_links_2" on "supplymesh"."source_links" ("supplier_id", "organization_id");
create index if not exists "mse_fk_substitution_options_1" on "supplymesh"."substitution_options" ("component_id", "organization_id");
create index if not exists "mse_fk_substitution_options_2" on "supplymesh"."substitution_options" ("created_by");
create index if not exists "mse_fk_substitution_options_3" on "supplymesh"."substitution_options" ("substitute_component_id", "organization_id");
create index if not exists "mse_fk_suppliers_1" on "supplymesh"."suppliers" ("created_by");

