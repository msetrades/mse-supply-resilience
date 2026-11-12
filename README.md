# SupplyMesh

SupplyMesh is MSE's supplier-dependency and disruption-planning workspace. It helps an operations team record component demand and inventory, map supplier demand shares, examine concentration, and run transparent what-if scenarios when a supplier loses capacity.

## Current workflows

- Email/password Supabase Auth with confirmation redirects to the active app origin.
- Private, multi-organization workspaces with invite codes and member-scoped reads/writes.
- Supplier and component registers with region, demand, on-hand units, and criticality.
- Component-to-supplier mappings with lead-time capture and a database-enforced 100% share ceiling.
- Saved supplier-availability scenarios and model-run results, including assumptions and model version.
- Responsive operations overview with sourcing gaps, recent runs, and impact summaries.

## Model boundary

`share-of-supply-v1` is a deterministic sensitivity model, not a probabilistic forecast or automated purchasing recommendation. It estimates available supply as the sum of each source share multiplied by that supplier's remaining availability. Existing inventory offsets the resulting weekly shortfall before unmet units are counted. The model does not yet account for lead-time variability, logistics constraints, minimum order quantities, price changes, demand seasonality, correlated supplier failures, or production yield. Substitute stock is informational and is not counted as risk protection until qualified and allocated.

Scenario outputs should be checked by the operations team against current inventory, contracts, logistics, and supplier communications. This software does not validate or certify vendor data.

## Local setup

1. Install Node.js 22 or later and run `npm ci`.
2. Copy `.env.example` to `.env.local` and enter the approved MSE Product Suite project URL and publishable key.
3. Apply `supabase/migrations/20261112180000_supplymesh_network_planning.sql` only to Supabase project `tcstghomtslvvjvtbtmj`.
4. In Supabase API settings, add `supplymesh` to Exposed schemas. The migration grants authenticated-only access, enables RLS on every application table, and leaves `anon` without table access. Do not expose `supplymesh_private`.
5. Add the local URL and deployed SupplyMesh URL to Supabase Auth's allowed redirect URLs.
6. Run `npm run dev`, `npm test`, `npm run lint`, and `npm run build`.

Never place a Supabase secret/service-role key in this app or commit `.env.local`. The frontend uses only the publishable key; tenant boundaries are enforced with Postgres RLS and narrow RPCs.

## Deployment status

The code and migration are prepared for the approved MSE Product Suite project. Supabase access/API settings and the migration must be applied and verified before this app can be represented as a live, database-connected product. No customer, supplier, or institutional records are fabricated in the repository.
