// Co-author network. Loaded on demand because Cytoscape is the largest dependency.

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { type Graph, type NetworkOptions, buildNetwork } from "../analysis";
import type { Dataset } from "../data";
import { h } from "../dom";
import { lang, loc, t } from "../i18n";
import { type Route, replaceParams } from "../router";
import { facultyOptions, fmt, select, unitName, unitOptions, yearOptions } from "../ui";

const MAX_NODES = 450;
const LABEL_LIMIT = 90;

interface State extends NetworkOptions {
  field?: string;
  subfield?: string;
  topic?: string;
  focus?: string;
}

function stateFromRoute(ds: Dataset, route: Route): State {
  const p = route.params;
  const [first, last] = ds.meta.years;
  const year = (key: string, fallback: number) => {
    const v = Number(p.get(key));
    return Number.isInteger(v) && v >= first && v <= last ? v : fallback;
  };
  const get = (key: string) => p.get(key) || undefined;
  const topic = get("topic");
  const subfield = get("sub");
  const field = get("field");
  return {
    faculty: get("f") && ds.facultyById.has(get("f")!) ? get("f") : undefined,
    unit: get("u") && ds.unitById.has(get("u")!) ? get("u") : undefined,
    from: year("from", Math.max(first, last - 4)),
    to: year("to", last),
    field,
    subfield,
    topic,
    topicLevel: topic ? "topic" : subfield ? "subfield" : field ? "field" : undefined,
    topicId: topic ?? subfield ?? field,
    external: p.get("ext") === "1",
    minWeight: Math.max(1, Math.min(5, Number(p.get("min")) || 1)),
    cap: ds.meta.networkCap,
    focus: get("focus"),
  };
}

function params(s: State): Record<string, string | number | undefined> {
  return {
    f: s.faculty,
    u: s.unit,
    from: s.from,
    to: s.to,
    field: s.field,
    sub: s.subfield,
    topic: s.topic,
    ext: s.external ? 1 : undefined,
    min: s.minWeight > 1 ? s.minWeight : undefined,
    focus: s.focus,
  };
}

export function networkView(ds: Dataset, route: Route): HTMLElement {
  let state = stateFromRoute(ds, route);
  const controls = h("div", { class: "filters" });
  const status = h("p", { class: "note", "aria-live": "polite" });
  const canvas = h("div", { class: "graph", role: "img", "aria-label": t().networkTitle });
  const detail = h("div", { class: "graph-detail", "aria-live": "polite" }, h("p", { class: "note" }, t().networkSelectHint));
  const table = h("div");
  let cy: Core | null = null;

  const update = (next: State) => {
    state = next;
    replaceParams(params(state));
    controls.replaceChildren(...renderControls(ds, state, update));
    draw();
  };

  const draw = () => {
    cy?.destroy();
    cy = null;
    const scoped = state.faculty || state.unit || state.topicId || state.focus;
    const graph = buildNetwork(ds.works, ds.personById, ds.topics, state);
    const people = graph.nodes.filter((n) => n.kind === "person").length;
    const inst = graph.nodes.length - people;
    table.replaceChildren();
    if (!scoped || graph.nodes.length > MAX_NODES) {
      status.replaceChildren(
        t().networkTooBig(graph.nodes.length),
        h(
          "span",
          { class: "quick" },
          ds.meta.faculties.map((f) =>
            h("button", { type: "button", class: "chip-button", onclick: () => update({ ...state, faculty: f.id, unit: undefined }) }, loc(f.name)),
          ),
        ),
      );
      canvas.hidden = true;
      return;
    }
    if (!graph.edges.length) {
      status.textContent = t().networkEmpty;
      canvas.hidden = true;
      return;
    }
    canvas.hidden = false;
    status.textContent = t().networkStats(people, inst, graph.edges.length, graph.works);
    void ds.institutions().then((institutions) => {
      cy = render(ds, canvas, graph, institutions, state.focus, (id, kind) => {
        detail.replaceChildren(nodeDetail(ds, graph, id, kind, institutions));
      });
      table.replaceChildren(edgeTable(ds, graph, institutions));
    });
  };

  controls.replaceChildren(...renderControls(ds, state, update));
  queueMicrotask(draw);

  return h(
    "section",
    { class: "page network" },
    h("h1", null, t().networkTitle),
    h("p", { class: "lede" }, t().networkIntro),
    controls,
    status,
    h("div", { class: "graph-wrap" }, canvas, detail),
    h(
      "ul",
      { class: "legend plain" },
      h("li", null, h("span", { class: "key key-person", "aria-hidden": "true" }), t().legendPerson),
      h("li", null, h("span", { class: "key key-inst", "aria-hidden": "true" }), t().legendInstitution),
    ),
    table,
  );
}

function renderControls(ds: Dataset, s: State, update: (s: State) => void): HTMLElement[] {
  const fields = Object.entries(ds.topics.fields)
    .map(([id, [name, domain]]) => ({ value: id, label: name, group: ds.topics.domains[domain] ?? "" }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const subfields = s.field
    ? Object.entries(ds.topics.subfields)
        .filter(([, [, field]]) => field === s.field)
        .map(([id, [name]]) => ({ value: id, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];
  const all = { value: "", label: t().filterAll };
  const out: HTMLElement[] = [
    select(t().filterFaculty, "faculty", facultyOptions(ds), s.faculty ?? "", (v) =>
      update({ ...s, faculty: v || undefined, unit: undefined }),
    ),
    select(t().filterUnit, "unit", unitOptions(ds, s.faculty), s.unit ?? "", (v) =>
      update({ ...s, unit: v || undefined, faculty: ds.unitById.get(v)?.faculty ?? s.faculty }),
    ),
    select(t().networkField, "field", [all, ...fields], s.field ?? "", (v) =>
      update({ ...s, field: v || undefined, subfield: undefined, topic: undefined, topicLevel: v ? "field" : undefined, topicId: v || undefined }),
    ),
  ];
  if (subfields.length) {
    out.push(
      select(t().networkSubfield, "sub", [all, ...subfields], s.subfield ?? "", (v) =>
        update({ ...s, subfield: v || undefined, topic: undefined, topicLevel: v ? "subfield" : "field", topicId: v || s.field }),
      ),
    );
  }
  out.push(
    select(t().filterFrom, "from", yearOptions(ds), String(s.from), (v) => update({ ...s, from: Number(v), to: Math.max(Number(v), s.to) })),
    select(t().filterTo, "to", yearOptions(ds), String(s.to), (v) => update({ ...s, to: Number(v), from: Math.min(Number(v), s.from) })),
    select(
      t().networkMin,
      "min",
      [1, 2, 3, 5].map((n) => ({ value: String(n), label: String(n) })),
      String(s.minWeight),
      (v) => update({ ...s, minWeight: Number(v) }),
    ),
  );
  const ext = h("input", { type: "checkbox", id: "ext", onchange: (e: Event) => update({ ...s, external: (e.target as HTMLInputElement).checked }) });
  ext.checked = s.external;
  out.push(h("div", { class: "field check" }, ext, h("label", { for: "ext" }, t().networkExternal)));
  if (s.topic) {
    out.push(
      h(
        "div",
        { class: "field" },
        h("span", { class: "label" }, t().topicKicker),
        h("button", { type: "button", class: "chip-button", onclick: () => update({ ...s, topic: undefined, topicLevel: undefined, topicId: undefined }) }, `${ds.topics.topics[s.topic]?.[0] ?? s.topic} ×`),
      ),
    );
  }
  return out;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function render(
  ds: Dataset,
  container: HTMLElement,
  graph: Graph,
  institutions: Record<string, [string, string | null, string | null]>,
  focus: string | undefined,
  onSelect: (id: string, kind: "person" | "institution") => void,
): Core {
  const elements: ElementDefinition[] = [
    ...graph.nodes.map((n) => ({
      data: {
        id: n.id,
        kind: n.kind,
        label: n.kind === "person" ? (ds.personById.get(n.id)?.n ?? n.id) : (institutions[n.id]?.[0] ?? n.id),
        size: 10 + 5 * Math.sqrt(n.weight),
      },
      classes: n.id === focus ? `${n.kind} focus` : n.kind,
    })),
    ...graph.edges.map((e) => ({
      data: { id: `${e.source}-${e.target}`, source: e.source, target: e.target, weight: e.weight },
      classes: e.kind,
    })),
  ];
  const showLabels = graph.nodes.length <= LABEL_LIMIT;
  const ink = cssVar("--ink");
  const muted = cssVar("--muted");
  const accent = cssVar("--accent");
  const line = cssVar("--line-strong");
  const paper = cssVar("--paper");
  const cy = cytoscape({
    container,
    elements,
    wheelSensitivity: 0.3,
    minZoom: 0.2,
    maxZoom: 3,
    style: [
      {
        selector: "node",
        style: {
          width: "data(size)",
          height: "data(size)",
          "background-color": ink,
          label: showLabels ? "data(label)" : "",
          "font-size": 10,
          "font-family": "Atkinson Hyperlegible Next Variable, system-ui, sans-serif",
          color: ink,
          "text-valign": "bottom",
          "text-margin-y": 3,
          "text-outline-color": paper,
          "text-outline-width": 2,
          "min-zoomed-font-size": 7,
        },
      },
      { selector: "node.institution", style: { shape: "round-rectangle", "background-color": muted } },
      { selector: "node.focus, node:selected", style: { "background-color": accent, label: "data(label)", "border-width": 3, "border-color": paper } },
      { selector: "edge", style: { width: "mapData(weight, 1, 10, 1, 6)", "line-color": line, opacity: 0.8, "curve-style": "haystack" } },
      { selector: "edge.external", style: { "line-style": "dashed", opacity: 0.6 } },
      { selector: "node.hover", style: { label: "data(label)", "z-index": 10 } },
      { selector: ".faded", style: { opacity: 0.12 } },
    ],
    layout: {
      name: "cose",
      animate: false,
      randomize: true,
      numIter: 2500,
      nodeRepulsion: () => 12000,
      idealEdgeLength: () => 55,
      edgeElasticity: () => 80,
      gravity: 0.6,
      componentSpacing: 60,
      nestingFactor: 1.2,
      padding: 24,
    } as cytoscape.LayoutOptions,
  });
  const highlight = (id: string) => {
    const node = cy.getElementById(id);
    cy.elements().addClass("faded");
    node.closedNeighborhood().removeClass("faded");
  };
  cy.on("tap", "node", (e) => {
    const id = e.target.id() as string;
    highlight(id);
    onSelect(id, e.target.data("kind"));
  });
  cy.on("mouseover", "node", (e) => e.target.addClass("hover"));
  cy.on("mouseout", "node", (e) => e.target.removeClass("hover"));
  cy.on("tap", (e) => {
    if (e.target === cy) cy.elements().removeClass("faded");
  });
  if (focus && cy.getElementById(focus).nonempty()) {
    cy.one("layoutstop", () => {
      highlight(focus);
      onSelect(focus, "person");
    });
  }
  return cy;
}

function nodeDetail(
  ds: Dataset,
  graph: Graph,
  id: string,
  kind: "person" | "institution",
  institutions: Record<string, [string, string | null, string | null]>,
): HTMLElement {
  const links = graph.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => ({ other: e.source === id ? e.target : e.source, n: e.weight }));
  const name = (other: string) => ds.personById.get(other)?.n ?? institutions[other]?.[0] ?? other;
  links.sort((a, b) => name(a.other).localeCompare(name(b.other), "de"));
  const person = kind === "person" ? ds.personById.get(id) : undefined;
  return h(
    "div",
    null,
    h("h2", null, name(id)),
    person ? h("p", null, person.u.map((u) => unitName(ds, u)).join(", ")) : null,
    person ? h("p", null, h("a", { href: `#/person/${id}` }, t().personLink)) : null,
    h(
      "ul",
      { class: "plain small" },
      links.map((l) =>
        h(
          "li",
          null,
          ds.personById.has(l.other) ? h("a", { href: `#/person/${l.other}` }, name(l.other)) : name(l.other),
          h("span", { class: "muted" }, ` ${t().sharedWorks(l.n)}`),
        ),
      ),
    ),
  );
}

function edgeTable(
  ds: Dataset,
  graph: Graph,
  institutions: Record<string, [string, string | null, string | null]>,
): HTMLElement {
  const name = (id: string) => ds.personById.get(id)?.n ?? institutions[id]?.[0] ?? id;
  const rows = graph.edges
    .map((e) => [name(e.source), name(e.target), e.weight] as const)
    .sort((a, b) => a[0].localeCompare(b[0], lang) || a[1].localeCompare(b[1], lang));
  return h(
    "details",
    { class: "edge-table" },
    h("summary", null, `${t().networkTable} (${fmt(rows.length)})`),
    h(
      "table",
      null,
      h("thead", null, h("tr", null, h("th", { scope: "col" }, t().colPerson), h("th", { scope: "col" }, t().colPartner), h("th", { scope: "col" }, t().colWorks))),
      h("tbody", null, rows.map(([a, b, n]) => h("tr", null, h("td", null, a), h("td", null, b), h("td", null, String(n))))),
    ),
  );
}
