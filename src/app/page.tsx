"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  simulateScenario,
  type Component,
  type Disruption,
  type Scenario,
  type SourceLink,
  type Substitute,
} from "@/lib/simulation";

type Organization = {
  id: string;
  name: string;
  region: string;
  team_code: string;
};
type Supplier = { id: string; name: string; region: string; status: string };
type ScenarioRow = {
  id: string;
  name: string;
  duration_weeks: number;
  created_at: string;
};
type SubstitutionRow = {
  id: string;
  component_id: string;
  substitute_component_id: string;
  conversion_ratio: number;
  approval_status: "pending" | "qualified" | "rejected";
  note: string;
};
type Tab = "overview" | "network" | "scenarios" | "suppliers" | "components";

const db = createClient();

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m6 10 10-6 10 6v12l-10 6-10-6V10Z" />
      <path d="m6.5 10 9.5 6 9.5-6M16 16v11" />
      <circle cx="6" cy="10" r="2.5" />
      <circle cx="26" cy="10" r="2.5" />
      <circle className="mark-core" cx="16" cy="16" r="2.5" />
      <circle cx="6" cy="22" r="2.5" />
      <circle cx="26" cy="22" r="2.5" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function Home() {
  const [session, setSession] = useState<{ id: string; email?: string } | null>(
    null,
  );
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [sources, setSources] = useState<SourceLink[]>([]);
  const [substitutions, setSubstitutions] = useState<SubstitutionRow[]>([]);
  const [scenarioShocks, setScenarioShocks] = useState<
    { supplier_id: string; availability_pct: string }[]
  >([{ supplier_id: "", availability_pct: "0" }]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [result, setResult] = useState<ReturnType<
    typeof simulateScenario
  > | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    orgName: "",
    region: "",
    teamCode: "",
    supplierName: "",
    supplierRegion: "",
    sku: "",
    componentName: "",
    demand: "100",
    stock: "100",
    criticality: "3",
    sourceComponent: "",
    sourceSupplier: "",
    sourceShare: "100",
    sourceLead: "7",
    substitutePart: "",
    replacementPart: "",
    conversionRatio: "1",
    substitutionNote: "",
    scenarioName: "Port disruption",
    duration: "4",
  });

  const refreshOrganizations = useCallback(async (userId?: string) => {
    if (!db || !userId) return;
    const { data: memberships, error } = await db
      .schema("supplymesh")
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId);
    if (error) throw error;
    const ids = (memberships ?? []).map((row) => row.organization_id);
    if (!ids.length) {
      setOrganizations([]);
      setOrganization(null);
      return;
    }
    const { data, error: orgError } = await db
      .schema("supplymesh")
      .from("organizations")
      .select("id,name,region,team_code")
      .in("id", ids)
      .order("created_at");
    if (orgError) throw orgError;
    const rows = (data ?? []) as Organization[];
    setOrganizations(rows);
    setOrganization(
      (current) =>
        rows.find((row) => row.id === current?.id) ?? rows[0] ?? null,
    );
  }, []);

  const refreshData = useCallback(
    async (org = organization) => {
      if (!db || !org) return;
      const [
        supplierResult,
        componentResult,
        sourceResult,
        scenarioResult,
        substitutionResult,
      ] = await Promise.all([
        db
          .schema("supplymesh")
          .from("suppliers")
          .select("id,name,region,status")
          .eq("organization_id", org.id)
          .order("name"),
        db
          .schema("supplymesh")
          .from("components")
          .select("id,name,sku,demand_per_week,quantity_on_hand,criticality")
          .eq("organization_id", org.id)
          .order("name"),
        db
          .schema("supplymesh")
          .from("source_links")
          .select("component_id,supplier_id,share_pct,lead_time_days")
          .eq("organization_id", org.id),
        db
          .schema("supplymesh")
          .from("scenarios")
          .select("id,name,duration_weeks,created_at")
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false }),
        db
          .schema("supplymesh")
          .from("substitution_options")
          .select(
            "id,component_id,substitute_component_id,conversion_ratio,approval_status,note",
          )
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false }),
      ]);
      for (const response of [
        supplierResult,
        componentResult,
        sourceResult,
        scenarioResult,
        substitutionResult,
      ])
        if (response.error) throw response.error;
      const comp = (componentResult.data ?? []) as Component[];
      const supplierRows = (supplierResult.data ?? []) as Supplier[];
      setSuppliers(supplierRows);
      setComponents(
        comp.map((row) => ({
          ...row,
          demand_per_week: Number(row.demand_per_week),
          quantity_on_hand: Number(row.quantity_on_hand),
          criticality: Number(row.criticality),
        })),
      );
      setSources(
        (sourceResult.data ?? []).map((row) => ({
          component_id: row.component_id,
          supplier_id: row.supplier_id,
          share_pct: Number(row.share_pct),
          lead_time_days: Number(row.lead_time_days),
        })) as SourceLink[],
      );
      setScenarios(
        (scenarioResult.data ?? []).map((row) => ({
          ...row,
          duration_weeks: Number(row.duration_weeks),
        })) as ScenarioRow[],
      );
      setSubstitutions(
        (substitutionResult.data ?? []).map((row) => ({
          ...row,
          conversion_ratio: Number(row.conversion_ratio),
        })) as SubstitutionRow[],
      );
      setForm((current) => ({
        ...current,
        sourceComponent: current.sourceComponent || comp[0]?.id || "",
        sourceSupplier:
          current.sourceSupplier || (supplierResult.data ?? [])[0]?.id || "",
        substitutePart: current.substitutePart || comp[0]?.id || "",
        replacementPart: current.replacementPart || comp[1]?.id || "",
      }));
      setScenarioShocks((current) =>
        current.map((shock, index) => ({
          ...shock,
          supplier_id:
            shock.supplier_id ||
            supplierRows[index % Math.max(supplierRows.length, 1)]?.id ||
            "",
        })),
      );
    },
    [organization],
  );

  useEffect(() => {
    if (!db) return;
    db.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setSession({ id: data.user.id, email: data.user.email });
      try {
        await refreshOrganizations(data.user.id);
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Could not load workspaces.",
        );
      }
    });
    const { data: listener } = db.auth.onAuthStateChange(
      (_event, authSession) => {
        const user = authSession?.user;
        setSession(user ? { id: user.id, email: user.email } : null);
        if (user)
          window.setTimeout(
            () =>
              refreshOrganizations(user.id).catch((error) =>
                setNotice(String(error)),
              ),
            0,
          );
        else {
          setOrganizations([]);
          setOrganization(null);
        }
      },
    );
    return () => listener.subscription.unsubscribe();
  }, [refreshOrganizations]);

  useEffect(() => {
    if (!organization) return;
    // Fetching workspace-owned rows is the external synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshData(organization).catch((error) =>
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not load workspace data.",
      ),
    );
  }, [organization, refreshData]);

  const sourceTotals = useMemo(() => {
    const totals = new Map<string, number>();
    sources.forEach((row) =>
      totals.set(
        row.component_id,
        (totals.get(row.component_id) ?? 0) + row.share_pct,
      ),
    );
    return totals;
  }, [sources]);
  const exposureCount = useMemo(() => {
    const exposed = new Set<string>();
    sources.forEach((row) => {
      if (row.share_pct >= 50) exposed.add(row.component_id);
    });
    return exposed.size;
  }, [sources]);

  async function perform<T>(action: () => Promise<T>, success?: string) {
    setBusy(true);
    setNotice("");
    try {
      const output = await action();
      if (success) setNotice(success);
      return output;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    await perform(async () => {
      const auth =
        authMode === "signin"
          ? await db.auth.signInWithPassword({
              email: form.email,
              password: form.password,
            })
          : await db.auth.signUp({
              email: form.email,
              password: form.password,
              options: { emailRedirectTo: `${window.location.origin}/` },
            });
      if (auth.error) throw auth.error;
      if (authMode === "signup" && !auth.data.session)
        setNotice("Check your email to confirm your account, then sign in.");
      else if (auth.data.user)
        setSession({ id: auth.data.user.id, email: auth.data.user.email });
    });
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    await perform(async () => {
      const { data, error } = await db
        .schema("supplymesh")
        .rpc("create_organization", {
          p_name: form.orgName,
          p_region: form.region,
        });
      if (error) throw error;
      await refreshOrganizations(session?.id);
      const created = data as string;
      const { data: row, error: queryError } = await db
        .schema("supplymesh")
        .from("organizations")
        .select("id,name,region,team_code")
        .eq("id", created)
        .single();
      if (queryError) throw queryError;
      setOrganization(row as Organization);
    }, "Workspace created.");
  }

  async function joinOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    await perform(async () => {
      const { data, error } = await db
        .schema("supplymesh")
        .rpc("join_organization", { p_team_code: form.teamCode });
      if (error) throw error;
      await refreshOrganizations(session?.id);
      const { data: row, error: queryError } = await db
        .schema("supplymesh")
        .from("organizations")
        .select("id,name,region,team_code")
        .eq("id", data as string)
        .single();
      if (queryError) throw queryError;
      setOrganization(row as Organization);
    }, "Joined workspace.");
  }

  async function addSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !organization) return;
    await perform(async () => {
      const { error } = await db.schema("supplymesh").from("suppliers").insert({
        organization_id: organization.id,
        name: form.supplierName,
        region: form.supplierRegion,
      });
      if (error) throw error;
      await refreshData();
      setForm((current) => ({
        ...current,
        supplierName: "",
        supplierRegion: "",
      }));
    }, "Supplier added.");
  }

  async function addComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !organization) return;
    await perform(async () => {
      const { error } = await db
        .schema("supplymesh")
        .from("components")
        .insert({
          organization_id: organization.id,
          sku: form.sku,
          name: form.componentName,
          demand_per_week: Number(form.demand),
          quantity_on_hand: Number(form.stock),
          criticality: Number(form.criticality),
        });
      if (error) throw error;
      await refreshData();
      setForm((current) => ({ ...current, sku: "", componentName: "" }));
    }, "Component added.");
  }

  async function mapSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !organization) return;
    await perform(async () => {
      const { error } = await db.schema("supplymesh").rpc("set_source_share", {
        p_organization_id: organization.id,
        p_component_id: form.sourceComponent,
        p_supplier_id: form.sourceSupplier,
        p_share_pct: Number(form.sourceShare),
        p_lead_time_days: Number(form.sourceLead),
      });
      if (error) throw error;
      await refreshData();
    }, "Supply source saved.");
  }

  async function addSubstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !organization) return;
    await perform(async () => {
      const { error } = await db
        .schema("supplymesh")
        .from("substitution_options")
        .insert({
          organization_id: organization.id,
          component_id: form.substitutePart,
          substitute_component_id: form.replacementPart,
          conversion_ratio: Number(form.conversionRatio),
          note: form.substitutionNote,
        });
      if (error) throw error;
      await refreshData();
      setForm((current) => ({ ...current, substitutionNote: "" }));
    }, "Substitute option added as pending qualification.");
  }

  async function updateSubstitution(
    id: string,
    approval_status: SubstitutionRow["approval_status"],
  ) {
    if (!db || !organization) return;
    await perform(async () => {
      const { error } = await db
        .schema("supplymesh")
        .from("substitution_options")
        .update({ approval_status })
        .eq("organization_id", organization.id)
        .eq("id", id);
      if (error) throw error;
      await refreshData();
    }, `Substitution marked ${approval_status}.`);
  }

  async function runScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !organization) return;
    const sourceIds = scenarioShocks.map((row) => row.supplier_id);
    if (!scenarioShocks.length || sourceIds.some((id) => !id)) {
      setNotice("Choose an affected supplier for every disruption row.");
      return;
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      setNotice("Each supplier can appear only once in a scenario.");
      return;
    }
    await perform(async () => {
      const { data: created, error: createError } = await db
        .schema("supplymesh")
        .from("scenarios")
        .insert({
          organization_id: organization.id,
          name: form.scenarioName,
          duration_weeks: Number(form.duration),
        })
        .select("id,name,duration_weeks,created_at")
        .single();
      if (createError) throw createError;
      const scenario = created as ScenarioRow;
      const { error: shockError } = await db
        .schema("supplymesh")
        .from("scenario_disruptions")
        .insert(
          scenarioShocks.map((shock) => ({
            organization_id: organization.id,
            scenario_id: scenario.id,
            supplier_id: shock.supplier_id,
            availability_pct: Number(shock.availability_pct),
            note: "Scenario assumption",
          })),
        );
      if (shockError) {
        await db
          .schema("supplymesh")
          .from("scenarios")
          .delete()
          .eq("organization_id", organization.id)
          .eq("id", scenario.id);
        throw shockError;
      }
      const { data: options, error: substituteError } = await db
        .schema("supplymesh")
        .from("substitution_options")
        .select(
          "component_id,substitute_component_id,conversion_ratio,approval_status",
        )
        .eq("organization_id", organization.id);
      if (substituteError) throw substituteError;
      const { data: shocks, error: disruptionError } = await db
        .schema("supplymesh")
        .from("scenario_disruptions")
        .select("supplier_id,availability_pct")
        .eq("scenario_id", scenario.id);
      if (disruptionError) throw disruptionError;
      const output = simulateScenario(
        { duration_weeks: scenario.duration_weeks } satisfies Scenario,
        components,
        sources,
        shocks.map((row) => ({
          ...row,
          availability_pct: Number(row.availability_pct),
        })) as Disruption[],
        (options ?? []).map((row) => ({
          ...row,
          conversion_ratio: Number(row.conversion_ratio),
        })) as Substitute[],
      );
      const { error: saveError } = await db
        .schema("supplymesh")
        .from("scenario_runs")
        .insert({
          organization_id: organization.id,
          scenario_id: scenario.id,
          model_version: output.model_version,
          result: output,
          assumptions: output.assumptions,
        });
      if (saveError) throw saveError;
      setResult(output);
      setSelectedScenario(scenario.id);
      await refreshData();
      setTab("scenarios");
    }, "Scenario calculated and saved.");
  }

  async function openScenario(id: string) {
    if (!db || !organization) return;
    const { data, error } = await db
      .schema("supplymesh")
      .from("scenario_runs")
      .select("result")
      .eq("organization_id", organization.id)
      .eq("scenario_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      setNotice(error.message);
      return;
    }
    setSelectedScenario(id);
    setResult(data?.result as ReturnType<typeof simulateScenario> | null);
  }

  if (!db)
    return (
      <main className="setup-screen">
        <span className="eyebrow">MSE / OPERATIONS INTELLIGENCE</span>
        <h1>SupplyMesh</h1>
        <p>
          Connect the approved MSE Product Suite Supabase project to activate
          secure workspaces and saved supplier-risk scenarios.
        </p>
        <code>
          NEXT_PUBLIC_SUPABASE_URL
          <br />
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        </code>
        <p className="muted">
          The project-specific migration is in <code>supabase/migrations</code>.
          It must be applied to the Free-tier project before live data workflows
          can be used.
        </p>
      </main>
    );

  if (!session)
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <span className="eyebrow">MSE / SUPPLY CHAIN RESILIENCE</span>
          <div className="brand">
            <span className="brand-mark">
              <BrandMark />
            </span>
            <span>SupplyMesh</span>
          </div>
          <h1>
            See the weak links
            <br />
            before they break.
          </h1>
          <p>
            Map component dependencies, model supplier disruptions, and
            coordinate recovery with your team.
          </p>
          <div className="network-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <b />
            <b />
            <b />
            <b />
          </div>
          <small>
            Deterministic scenario planning · Transparent assumptions ·
            Team-owned data
          </small>
        </section>
        <section className="auth-panel">
          <span className="eyebrow">YOUR OPERATIONS WORKSPACE</span>
          <h2>
            {authMode === "signin" ? "Welcome back" : "Create your account"}
          </h2>
          <p>
            Sign in to map your supply network and run disruption scenarios.
          </p>
          <form onSubmit={handleAuth}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                minLength={8}
                autoComplete={
                  authMode === "signin" ? "current-password" : "new-password"
                }
                required
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
              />
            </Field>
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : authMode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() =>
              setAuthMode(authMode === "signin" ? "signup" : "signin")
            }
          >
            {authMode === "signin"
              ? "New to SupplyMesh? Create an account"
              : "Already have an account? Sign in"}
          </button>
          {notice && <p className="notice">{notice}</p>}
          <small>
            Accounts and workspace data are isolated by organization policies.
          </small>
        </section>
      </main>
    );

  const nav: [Tab, string, string][] = [
    ["overview", "01", "Overview"],
    ["network", "02", "Supply network"],
    ["scenarios", "03", "Scenarios"],
    ["suppliers", "04", "Suppliers"],
    ["components", "05", "Components"],
  ];

  if (!organizations.length || !organization)
    return (
      <main className="setup-screen">
        <span className="eyebrow">SUPPLYMESH / WORKSPACE SETUP</span>
        <h1>Start with your network.</h1>
        <p>
          Create a private workspace or join an existing team with its invite
          code.
        </p>
        <div className="workspace-forms">
          <form className="panel" onSubmit={createOrganization}>
            <h2>Create a workspace</h2>
            <Field label="Organization name">
              <input
                required
                minLength={2}
                maxLength={100}
                value={form.orgName}
                onChange={(event) =>
                  setForm({ ...form, orgName: event.target.value })
                }
              />
            </Field>
            <Field label="Region (optional)">
              <input
                maxLength={120}
                value={form.region}
                onChange={(event) =>
                  setForm({ ...form, region: event.target.value })
                }
              />
            </Field>
            <button className="button primary" disabled={busy}>
              Create workspace
            </button>
          </form>
          <form className="panel" onSubmit={joinOrganization}>
            <h2>Join a team</h2>
            <Field label="Invite code">
              <input
                required
                value={form.teamCode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    teamCode: event.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <button className="button secondary" disabled={busy}>
              Join workspace
            </button>
          </form>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </main>
    );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span>
            SupplyMesh<small>NETWORK INTELLIGENCE</small>
          </span>
        </a>
        <div className="org-switch">
          <small>WORKSPACE</small>
          <strong>{organization.name}</strong>
          <span>{organization.region || "Region not set"}</span>
          {organizations.length > 1 && (
            <select
              value={organization.id}
              onChange={(event) =>
                setOrganization(
                  organizations.find((row) => row.id === event.target.value) ??
                    organization,
                )
              }
            >
              {organizations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <nav>
          {nav.map(([key, number, label]) => (
            <button
              key={key}
              className={tab === key ? "nav-item active" : "nav-item"}
              onClick={() => setTab(key)}
            >
              <span>{number}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-code">
            <small>TEAM INVITE CODE</small>
            <strong>{organization.team_code}</strong>
            <span>Share this code with teammates.</span>
          </div>
          <button className="text-button" onClick={() => db.auth.signOut()}>
            Sign out · {session.email}
          </button>
        </div>
      </aside>
      <section className="main-column">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              {organization.region || "OPERATIONS"} / SUPPLY RESILIENCE
            </span>
            <h1>{nav.find(([key]) => key === tab)?.[2]}</h1>
          </div>
          <div className="top-actions">
            <span className="live-dot">PRIVATE WORKSPACE</span>
            <button className="button secondary" onClick={() => refreshData()}>
              ↻ Refresh
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice-bar" role="status">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {tab === "overview" && (
          <>
            <section className="welcome-band">
              <div>
                <span className="eyebrow">NETWORK CONTROL ROOM</span>
                <h2>
                  Make disruption risk
                  <br />
                  <em>visible and actionable.</em>
                </h2>
                <p>
                  Map where critical parts come from, test what happens when a
                  source is constrained, and keep every assumption attached to
                  the result.
                </p>
                <button
                  className="button primary"
                  onClick={() =>
                    setTab(
                      components.length && suppliers.length
                        ? "scenarios"
                        : "network",
                    )
                  }
                >
                  {components.length && suppliers.length
                    ? "Model a disruption"
                    : "Build your supply map"}
                  <b>↗</b>
                </button>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="orbit orbit-a" />
                <div className="orbit orbit-b" />
                <span className="node node-main">SM</span>
                <span className="node node-one">S1</span>
                <span className="node node-two">P2</span>
                <span className="node node-three">S3</span>
                <span className="node node-four">P4</span>
                <svg viewBox="0 0 400 280">
                  <path d="M200 140 90 70M200 140 310 55M200 140 100 230M200 140 320 220" />
                  <path d="M90 70 310 55M100 230 320 220" />
                </svg>
                <div className="visual-label">
                  SUPPLIER → COMPONENT
                  <br />
                  DEPENDENCY MAP
                </div>
              </div>
            </section>
            <section className="metric-grid">
              <article className="metric-card">
                <span>SUPPLIERS MAPPED</span>
                <strong>{suppliers.length.toString().padStart(2, "0")}</strong>
                <small>Active sources in this workspace</small>
              </article>
              <article className="metric-card">
                <span>COMPONENTS TRACKED</span>
                <strong>{components.length.toString().padStart(2, "0")}</strong>
                <small>Demand and on-hand coverage</small>
              </article>
              <article className="metric-card">
                <span>SCENARIOS RUN</span>
                <strong>{scenarios.length.toString().padStart(2, "0")}</strong>
                <small>Saved disruption analyses</small>
              </article>
              <article className="metric-card risk">
                <span>SINGLE-SOURCE EXPOSURE</span>
                <strong>{exposureCount.toString().padStart(2, "0")}</strong>
                <small>Components with a supplier at ≥50% share</small>
              </article>
            </section>
            <section className="overview-grid">
              <article className="panel">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">PRIORITY REVIEW</span>
                    <h2>Source coverage gaps</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("network")}
                  >
                    Open network ↗
                  </button>
                </div>
                {components.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Demand / wk</th>
                          <th>Mapped</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.slice(0, 5).map((item) => {
                          const total = sourceTotals.get(item.id) ?? 0;
                          return (
                            <tr key={item.id}>
                              <td>
                                <strong>{item.name}</strong>
                                <small>{item.sku}</small>
                              </td>
                              <td>{item.demand_per_week}</td>
                              <td>
                                <span
                                  className={
                                    total >= 99 ? "status good" : "status warn"
                                  }
                                >
                                  {Math.min(100, total)}%
                                </span>
                              </td>
                              <td>
                                {total < 50
                                  ? "High"
                                  : total < 100
                                    ? "Review"
                                    : "Mapped"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <span>01 / START HERE</span>
                    <h3>Your supplier graph begins with one part.</h3>
                    <p>
                      Add your suppliers and critical components. Source shares
                      help the scenario model estimate the supply gap when a
                      supplier is disrupted.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => setTab("network")}
                    >
                      Open supply network
                    </button>
                  </div>
                )}
              </article>
              <article className="panel method-card">
                <span className="eyebrow">HOW THE MODEL WORKS</span>
                <h2>
                  Deterministic.
                  <br />
                  Auditable. No black box.
                </h2>
                <div className="formula">
                  available supply = Σ (source share × supplier availability)
                </div>
                <p>
                  Inventory covers the modeled weekly shortfall first. After
                  stockout, unmet units are estimated over the scenario horizon.
                </p>
                <div className="model-version">
                  <span>MODEL VERSION</span>
                  <strong>share-of-supply-v1</strong>
                </div>
                <small>
                  Substitute stock is shown as an option only. It is never
                  counted as coverage until qualified and allocated.
                </small>
              </article>
            </section>
            <section className="panel recent-runs">
              <div className="section-head">
                <div>
                  <span className="eyebrow">AUDIT TRAIL</span>
                  <h2>Recent scenarios</h2>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setTab("scenarios")}
                >
                  New scenario +
                </button>
              </div>
              {scenarios.length ? (
                scenarios.slice(0, 4).map((row) => (
                  <button
                    className="scenario-row"
                    key={row.id}
                    onClick={() => {
                      setTab("scenarios");
                      openScenario(row.id);
                    }}
                  >
                    <span className="scenario-symbol">↗</span>
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {new Date(row.created_at).toLocaleString()} ·{" "}
                        {row.duration_weeks} week horizon
                      </small>
                    </span>
                    <b>→</b>
                  </button>
                ))
              ) : (
                <p className="muted">
                  No scenario runs saved yet. Once your network is mapped,
                  create a disruption scenario to get a baseline.
                </p>
              )}
            </section>
          </>
        )}

        {tab === "network" && (
          <section className="page-grid">
            <article className="panel">
              <div className="section-head">
                <div>
                  <span className="eyebrow">DEPENDENCY MODEL</span>
                  <h2>Map component sourcing</h2>
                  <p>
                    Allocate each part’s demand across its supplying sources.
                    Combined shares should total 100%.
                  </p>
                </div>
              </div>
              {components.length ? (
                <div className="dependency-list">
                  {components.map((part) => (
                    <div className="dependency" key={part.id}>
                      <div className="dependency-title">
                        <strong>{part.name}</strong>
                        <small>
                          {part.sku} · demand {part.demand_per_week}/wk · stock{" "}
                          {part.quantity_on_hand}
                        </small>
                        <span
                          className={
                            sourceTotals.get(part.id) === 100
                              ? "status good"
                              : "status warn"
                          }
                        >
                          {Math.min(100, sourceTotals.get(part.id) ?? 0)}%
                          mapped
                        </span>
                      </div>
                      {sources
                        .filter((source) => source.component_id === part.id)
                        .map((source) => (
                          <div className="source-line" key={source.supplier_id}>
                            <span>
                              {suppliers.find(
                                (row) => row.id === source.supplier_id,
                              )?.name ?? "Supplier"}{" "}
                              · {source.lead_time_days ?? 0}d
                            </span>
                            <div className="share-track">
                              <i
                                style={{
                                  width: `${Math.min(100, source.share_pct)}%`,
                                }}
                              />
                            </div>
                            <strong>{source.share_pct}%</strong>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>NO DEPENDENCIES YET</span>
                  <h3>Add a component and its supply sources.</h3>
                  <p>
                    Start by recording one critical item, then add the suppliers
                    that fulfil its weekly demand.
                  </p>
                </div>
              )}
              {substitutions.length > 0 && (
                <div className="substitution-section">
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">CONTINGENCY OPTIONS</span>
                      <h2>Substitution register</h2>
                    </div>
                  </div>
                  {substitutions.map((option) => (
                    <div className="substitution-row" key={option.id}>
                      <div>
                        <strong>
                          {
                            components.find(
                              (row) => row.id === option.component_id,
                            )?.name
                          }{" "}
                          <span>→</span>{" "}
                          {
                            components.find(
                              (row) =>
                                row.id === option.substitute_component_id,
                            )?.name
                          }
                        </strong>
                        <small>
                          {option.conversion_ratio} replacement units per
                          original unit · {option.note || "No review note"}
                        </small>
                      </div>
                      <span
                        className={`status ${option.approval_status === "qualified" ? "good" : option.approval_status === "rejected" ? "warn" : ""}`}
                      >
                        {option.approval_status}
                      </span>
                      <div className="substitution-actions">
                        {option.approval_status !== "qualified" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              updateSubstitution(option.id, "qualified")
                            }
                          >
                            Qualify
                          </button>
                        )}
                        {option.approval_status !== "rejected" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              updateSubstitution(option.id, "rejected")
                            }
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <div className="stack">
              <form className="panel form-panel" onSubmit={addComponent}>
                <span className="eyebrow">01 / INVENTORY</span>
                <h2>Add component</h2>
                <Field label="Component name">
                  <input
                    required
                    value={form.componentName}
                    onChange={(event) =>
                      setForm({ ...form, componentName: event.target.value })
                    }
                    placeholder="e.g. Industrial drive belt"
                  />
                </Field>
                <div className="two-fields">
                  <Field label="SKU / identifier">
                    <input
                      required
                      value={form.sku}
                      onChange={(event) =>
                        setForm({ ...form, sku: event.target.value })
                      }
                      placeholder="BELT-240"
                    />
                  </Field>
                  <Field label="Criticality · 1–5">
                    <select
                      value={form.criticality}
                      onChange={(event) =>
                        setForm({ ...form, criticality: event.target.value })
                      }
                    >
                      {[1, 2, 3, 4, 5].map((num) => (
                        <option key={num}>{num}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="two-fields">
                  <Field label="Demand / week">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={form.demand}
                      onChange={(event) =>
                        setForm({ ...form, demand: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="On-hand inventory">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={form.stock}
                      onChange={(event) =>
                        setForm({ ...form, stock: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <button className="button primary" disabled={busy}>
                  Save component
                </button>
              </form>
              <form className="panel form-panel" onSubmit={mapSource}>
                <span className="eyebrow">02 / SUPPLY ALLOCATION</span>
                <h2>Link a supplier</h2>
                {!suppliers.length || !components.length ? (
                  <p className="muted">
                    Add at least one component and one supplier to map a source.
                  </p>
                ) : (
                  <>
                    <Field label="Component">
                      <select
                        required
                        value={form.sourceComponent}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            sourceComponent: event.target.value,
                          })
                        }
                      >
                        {components.map((row) => (
                          <option value={row.id} key={row.id}>
                            {row.name} ·{" "}
                            {Math.min(100, sourceTotals.get(row.id) ?? 0)}%
                            already mapped
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Supplier">
                      <select
                        required
                        value={form.sourceSupplier}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            sourceSupplier: event.target.value,
                          })
                        }
                      >
                        {suppliers.map((row) => (
                          <option value={row.id} key={row.id}>
                            {row.name} · {row.region || "region not set"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="two-fields">
                      <Field label="Demand share (%)">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          required
                          value={form.sourceShare}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              sourceShare: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Lead time (days)">
                        <input
                          type="number"
                          min="0"
                          required
                          value={form.sourceLead}
                          onChange={(event) =>
                            setForm({ ...form, sourceLead: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <button className="button secondary" disabled={busy}>
                      Save source allocation
                    </button>
                  </>
                )}
              </form>
              <form className="panel form-panel" onSubmit={addSubstitution}>
                <span className="eyebrow">03 / CONTINGENCY PLANNING</span>
                <h2>Register a substitute</h2>
                {components.length < 2 ? (
                  <p className="muted">
                    Add two or more components to record a possible replacement.
                  </p>
                ) : (
                  <>
                    <Field label="Component at risk">
                      <select
                        required
                        value={form.substitutePart}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            substitutePart: event.target.value,
                            replacementPart:
                              form.replacementPart === event.target.value
                                ? (components.find(
                                    (row) => row.id !== event.target.value,
                                  )?.id ?? "")
                                : form.replacementPart,
                          })
                        }
                      >
                        {components.map((row) => (
                          <option value={row.id} key={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Potential replacement component">
                      <select
                        required
                        value={form.replacementPart}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            replacementPart: event.target.value,
                          })
                        }
                      >
                        {components
                          .filter((row) => row.id !== form.substitutePart)
                          .map((row) => (
                            <option value={row.id} key={row.id}>
                              {row.name} · {row.quantity_on_hand} on hand
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Replacement units per original unit">
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        required
                        value={form.conversionRatio}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            conversionRatio: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Qualification note">
                      <input
                        maxLength={500}
                        value={form.substitutionNote}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            substitutionNote: event.target.value,
                          })
                        }
                        placeholder="Compatibility review, owner, or evidence"
                      />
                    </Field>
                    <p className="form-hint">
                      New options remain pending. Qualified stock is still not
                      counted in scenario coverage until explicitly allocated.
                    </p>
                    <button className="button secondary" disabled={busy}>
                      Add pending substitute
                    </button>
                  </>
                )}
              </form>
            </div>
          </section>
        )}

        {tab === "suppliers" && (
          <section className="page-grid">
            <article className="panel">
              <div className="section-head">
                <div>
                  <span className="eyebrow">SUPPLIER DIRECTORY</span>
                  <h2>Known supply sources</h2>
                </div>
                <span className="count-chip">{suppliers.length} mapped</span>
              </div>
              {suppliers.length ? (
                <div className="supplier-grid">
                  {suppliers.map((row) => (
                    <div className="supplier-card" key={row.id}>
                      <span className="supplier-mark">S</span>
                      <div>
                        <strong>{row.name}</strong>
                        <small>{row.region || "Region not specified"}</small>
                      </div>
                      <span className="status good">{row.status}</span>
                      <small className="supply-count">
                        {
                          sources.filter(
                            (source) => source.supplier_id === row.id,
                          ).length
                        }{" "}
                        component links
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span>SUPPLIER DIRECTORY / EMPTY</span>
                  <h3>Record where your materials come from.</h3>
                  <p>
                    Supplier names and regions stay inside this private team
                    workspace.
                  </p>
                </div>
              )}
            </article>
            <form className="panel form-panel" onSubmit={addSupplier}>
              <span className="eyebrow">ADD A SOURCE</span>
              <h2>Register supplier</h2>
              <Field label="Supplier / facility name">
                <input
                  required
                  value={form.supplierName}
                  onChange={(event) =>
                    setForm({ ...form, supplierName: event.target.value })
                  }
                  placeholder="e.g. North Coast Components"
                />
              </Field>
              <Field label="Region or country">
                <input
                  maxLength={120}
                  value={form.supplierRegion}
                  onChange={(event) =>
                    setForm({ ...form, supplierRegion: event.target.value })
                  }
                  placeholder="e.g. Akwa Ibom, Nigeria"
                />
              </Field>
              <p className="form-hint">
                Use internal labels if vendor identities are commercially
                sensitive.
              </p>
              <button className="button primary" disabled={busy}>
                Add supplier
              </button>
            </form>
          </section>
        )}

        {tab === "components" && (
          <section className="panel">
            <div className="section-head">
              <div>
                <span className="eyebrow">BOM / CRITICAL ITEMS</span>
                <h2>Component register</h2>
                <p>
                  Demand, inventory, criticality, and source coverage drive the
                  scenario model.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setTab("network")}
              >
                Add component +
              </button>
            </div>
            {components.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Component / SKU</th>
                      <th>Demand / wk</th>
                      <th>On hand</th>
                      <th>Criticality</th>
                      <th>Source coverage</th>
                      <th>Source links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <small>{item.sku}</small>
                        </td>
                        <td>{item.demand_per_week}</td>
                        <td>{item.quantity_on_hand}</td>
                        <td>
                          <span className="criticality">
                            {"●".repeat(item.criticality)}
                            <i>{"●".repeat(5 - item.criticality)}</i>
                          </span>
                        </td>
                        <td>
                          {Math.min(100, sourceTotals.get(item.id) ?? 0)}%
                        </td>
                        <td>
                          {
                            sources.filter(
                              (source) => source.component_id === item.id,
                            ).length
                          }{" "}
                          source links
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <h3>No components have been added.</h3>
                <button
                  className="button secondary"
                  onClick={() => setTab("network")}
                >
                  Add the first component
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "scenarios" && (
          <section className="scenario-layout">
            <div className="stack">
              <form
                className="panel form-panel scenario-form"
                onSubmit={runScenario}
              >
                <span className="eyebrow">
                  DISRUPTION LAB / DETERMINISTIC MODEL
                </span>
                <h2>Define a scenario</h2>
                <p>
                  Apply one or more supplier availability shocks. The model
                  propagates each affected source share into component inventory
                  runways.
                </p>
                <Field label="Scenario name">
                  <input
                    required
                    value={form.scenarioName}
                    onChange={(event) =>
                      setForm({ ...form, scenarioName: event.target.value })
                    }
                  />
                </Field>
                <div className="shock-list">
                  {scenarioShocks.map((shock, index) => (
                    <div className="shock-row" key={index}>
                      <Field label={`Affected supplier ${index + 1}`}>
                        <select
                          required
                          value={shock.supplier_id}
                          onChange={(event) =>
                            setScenarioShocks((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, supplier_id: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        >
                          {suppliers
                            .filter(
                              (row) =>
                                row.id === shock.supplier_id ||
                                !scenarioShocks.some(
                                  (other, otherIndex) =>
                                    otherIndex !== index &&
                                    other.supplier_id === row.id,
                                ),
                            )
                            .map((row) => (
                              <option value={row.id} key={row.id}>
                                {row.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Availability left (%)">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          required
                          value={shock.availability_pct}
                          onChange={(event) =>
                            setScenarioShocks((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? {
                                      ...row,
                                      availability_pct: event.target.value,
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </Field>
                      {scenarioShocks.length > 1 && (
                        <button
                          type="button"
                          className="text-button remove-shock"
                          aria-label={`Remove supplier shock ${index + 1}`}
                          onClick={() =>
                            setScenarioShocks((current) =>
                              current.filter(
                                (_, rowIndex) => rowIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button add-shock"
                    disabled={scenarioShocks.length >= suppliers.length}
                    onClick={() => {
                      const nextSupplier = suppliers.find(
                        (supplier) =>
                          !scenarioShocks.some(
                            (row) => row.supplier_id === supplier.id,
                          ),
                      );
                      if (nextSupplier)
                        setScenarioShocks((current) => [
                          ...current,
                          {
                            supplier_id: nextSupplier.id,
                            availability_pct: "0",
                          },
                        ]);
                    }}
                  >
                    + Add another supplier shock
                  </button>
                </div>
                <Field label="Scenario horizon (weeks)">
                  <input
                    type="number"
                    min="1"
                    max="104"
                    required
                    value={form.duration}
                    onChange={(event) =>
                      setForm({ ...form, duration: event.target.value })
                    }
                  />
                </Field>
                <div className="scenario-warning">
                  <strong>Model boundary</strong>
                  <span>
                    This is a deterministic sensitivity calculation, not a
                    forecast. It assumes disruption availability stays constant
                    for the full horizon and that normal deliveries from
                    unaffected sources continue.
                  </span>
                </div>
                <button
                  className="button primary full"
                  disabled={busy || !components.length || !suppliers.length}
                >
                  {busy ? "Calculating…" : "Run & save scenario ↗"}
                </button>
              </form>
              <article className="panel assumptions">
                <span className="eyebrow">TRANSPARENCY BY DESIGN</span>
                <h3>What this model accounts for</h3>
                <ul>
                  <li>Supplier demand share and remaining capacity.</li>
                  <li>
                    On-hand inventory buffer against the uncovered weekly
                    demand.
                  </li>
                  <li>
                    First stockout timing and unmet volume over the chosen
                    duration.
                  </li>
                  <li>
                    Component criticality and possible substitutes as review
                    prompts.
                  </li>
                </ul>
                <h3>What it does not assume</h3>
                <ul>
                  <li>No probabilistic failure rates or AI predictions.</li>
                  <li>
                    No lead-time variability, logistics bottlenecks, or market
                    price changes.
                  </li>
                  <li>
                    Substitute stock is not counted as protection until your
                    team qualifies and allocates it.
                  </li>
                </ul>
              </article>
            </div>
            <div className="stack">
              <article className="panel">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">SAVED ANALYSES</span>
                    <h2>Scenario history</h2>
                  </div>
                  <span className="count-chip">{scenarios.length} runs</span>
                </div>
                {scenarios.length ? (
                  scenarios.map((row) => (
                    <button
                      className={
                        selectedScenario === row.id
                          ? "scenario-row selected"
                          : "scenario-row"
                      }
                      key={row.id}
                      onClick={() => openScenario(row.id)}
                    >
                      <span className="scenario-symbol">↗</span>
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {new Date(row.created_at).toLocaleString()} ·{" "}
                          {row.duration_weeks} weeks
                        </small>
                      </span>
                      <b>→</b>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">
                    <h3>No scenarios yet.</h3>
                    <p>
                      Run a disruption scenario to create the first audit
                      record.
                    </p>
                  </div>
                )}
              </article>
              {result && (
                <article className="panel result-panel">
                  <span className="eyebrow">
                    RUN RESULT / {result.model_version}
                  </span>
                  <h2>
                    {scenarios.find((row) => row.id === selectedScenario)
                      ?.name ?? "Scenario result"}
                  </h2>
                  <div className="result-metrics">
                    <div>
                      <span>COMPONENTS AFFECTED</span>
                      <strong>{result.impacted_components}</strong>
                    </div>
                    <div>
                      <span>UNMET UNITS</span>
                      <strong>
                        {result.total_unmet_units.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}
                      </strong>
                    </div>
                    <div>
                      <span>CRITICAL EXPOSURES</span>
                      <strong>{result.critical_components}</strong>
                    </div>
                  </div>
                  <div className="impact-list">
                    {result.impacts
                      .filter((row) => row.weekly_shortfall > 0)
                      .map((impact) => (
                        <div className="impact-row" key={impact.component_id}>
                          <div>
                            <strong>{impact.name}</strong>
                            <small>
                              {impact.sku} ·{" "}
                              {impact.source_coverage_pct.toFixed(1)}% supply
                              coverage
                            </small>
                          </div>
                          <span className={`severity ${impact.severity}`}>
                            {impact.severity}
                          </span>
                          <div className="impact-number">
                            <strong>
                              {impact.unmet_units.toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })}
                            </strong>
                            <small>unmet units</small>
                          </div>
                        </div>
                      ))}
                    {result.impacts.every(
                      (row) => row.weekly_shortfall === 0,
                    ) && (
                      <p className="muted">
                        No modeled supply shortfall for this disruption and
                        current source map.
                      </p>
                    )}
                  </div>
                  <details>
                    <summary>Read model assumptions</summary>
                    <ul>
                      {result.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              )}
            </div>
          </section>
        )}
        <footer className="app-footer">
          <span>MSE / SUPPLYMESH</span>
          <span>
            Decision support, not an automated procurement instruction.
          </span>
          <span>MODEL · share-of-supply-v1</span>
        </footer>
      </section>
    </main>
  );
}
