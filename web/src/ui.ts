// Shared building blocks for the views.

import type { Filter } from "./analysis";
import type { Dataset, Person, Trend, Work } from "./data";
import { formatNumber, h } from "./dom";
import { lang, loc, t } from "./i18n";

export const fmt = (n: number) => formatNumber(n, lang);

export function domainClass(domainId: string | undefined): string {
  return `d${domainId ?? "0"}`;
}

export function topicLink(ds: Dataset, topicId: string, extra?: string): HTMLElement {
  const topic = ds.topics.topics[topicId];
  const path = ds.topicPath(topicId);
  return h(
    "a",
    { href: `#/thema/${topicId}`, class: `topic-link ${domainClass(path?.domain)}` },
    h("span", { class: "dot", "aria-hidden": "true" }),
    topic?.[0] ?? topicId,
    extra ? h("span", { class: "count" }, extra) : null,
  );
}

export function personLink(p: Person): HTMLElement {
  return h("a", { href: `#/person/${p.i}` }, p.n);
}

export function unitName(ds: Dataset, id: string): string {
  const unit = ds.unitById.get(id);
  if (unit) return loc(unit.name);
  const faculty = ds.facultyById.get(id);
  return faculty ? loc(faculty.name) : id;
}

export function unitLink(ds: Dataset, id: string): HTMLElement {
  return h("a", { href: `#/einheit/${id}` }, unitName(ds, id));
}

export function personUnits(ds: Dataset, p: Person): HTMLElement | null {
  const ids = p.u.length ? p.u : p.f;
  if (!ids.length) return null;
  const parts: (HTMLElement | string)[] = [];
  ids.forEach((id, i) => {
    if (i) parts.push(", ");
    parts.push(unitLink(ds, id));
  });
  return h("span", { class: "units" }, parts);
}

export function trendBadge(trend: Trend): HTMLElement {
  const arrows: Record<Trend, string> = { up: "↗", down: "↘", stable: "→", few: "" };
  return h(
    "span",
    { class: `trend trend-${trend}` },
    arrows[trend] ? h("span", { "aria-hidden": "true" }, arrows[trend]) : null,
    t().trend[trend],
  );
}

/** Tiny bar sparkline; the running year is drawn hatched. */
export function sparkline(counts: number[], years: [number, number], currentYear: number): SVGElement {
  const w = 96;
  const hgt = 24;
  const max = Math.max(1, ...counts);
  const bw = w / counts.length;
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, "svg");
  el.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  el.setAttribute("class", "spark");
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    `${t().sparkLabel(years[0], years[1])}: ${counts.map((c, i) => `${years[0] + i}: ${c}`).join(", ")}`,
  );
  counts.forEach((c, i) => {
    const barH = c === 0 ? 0 : Math.max(1.5, (c / max) * (hgt - 2));
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(i * bw + 0.5));
    rect.setAttribute("y", String(hgt - barH));
    rect.setAttribute("width", String(Math.max(1, bw - 1.5)));
    rect.setAttribute("height", String(barH));
    if (years[0] + i === currentYear) rect.setAttribute("class", "running");
    el.append(rect);
  });
  return el;
}

export function workItem(ds: Dataset, w: Work, hidePerson?: string): HTMLElement {
  const href = w.d ? `https://doi.org/${w.d}` : `https://openalex.org/${w.i}`;
  const people = w.a
    .filter((a) => a !== hidePerson)
    .map((a) => ds.personById.get(a))
    .filter((p): p is Person => !!p);
  const others = w.n - w.a.length;
  return h(
    "li",
    { class: "work" },
    h("a", { class: "work-title", href, rel: "noopener", target: "_blank" }, w.t || w.i),
    h(
      "div",
      { class: "work-meta" },
      h("span", null, String(w.y)),
      h("span", null, t().typeLabels[w.ty] ?? w.ty),
      w.v ? h("span", { class: "venue" }, w.v) : null,
      w.tr ? h("span", null, t().truncated) : null,
    ),
    people.length || others > 0
      ? h(
          "div",
          { class: "work-people" },
          people.flatMap((p, i) => (i ? [", ", personLink(p)] : [personLink(p)])),
          others > 0
            ? h(
                "span",
                { class: "muted" },
                people.length ? (lang === "de" ? ` und ${others} weitere` : ` and ${others} more`) : "",
              )
            : null,
        )
      : null,
  );
}

/** A work list that shows `initial` items and reveals the rest on request. */
export function workList(ds: Dataset, works: Work[], opts: { initial?: number; hidePerson?: string } = {}): HTMLElement {
  const initial = opts.initial ?? 10;
  const list = h("ol", { class: "works" }, works.slice(0, initial).map((w) => workItem(ds, w, opts.hidePerson)));
  if (works.length <= initial) return list;
  const more = h(
    "button",
    {
      type: "button",
      class: "more",
      onclick: () => {
        list.append(...works.slice(initial).map((w) => workItem(ds, w, opts.hidePerson)));
        more.remove();
        (list.children[initial]?.querySelector("a") as HTMLElement | null)?.focus();
      },
    },
    t().moreWorks(works.length - initial),
  );
  return h("div", null, list, more);
}

export function issueUrl(ds: Dataset, template: "correction" | "removal", person?: Person): string | null {
  if (!ds.meta.repository) return null;
  const params = new URLSearchParams({ template: `${template}.yml` });
  if (person) {
    params.set("title", `${template === "removal" ? "Removal" : "Correction"}: ${person.i}`);
    params.set("author_id", person.i);
  }
  return `${ds.meta.repository}/issues/new?${params}`;
}

export function select(
  label: string,
  name: string,
  options: { value: string; label: string; group?: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const id = `sel-${name}`;
  const el = h("select", { id, name, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) });
  let group: HTMLOptGroupElement | null = null;
  for (const o of options) {
    const opt = h("option", { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    if (o.group) {
      if (!group || group.label !== o.group) {
        group = h("optgroup", { label: o.group });
        el.append(group);
      }
      group.append(opt);
    } else {
      group = null;
      el.append(opt);
    }
  }
  return h("div", { class: "field" }, h("label", { for: id }, label), el);
}

export function unitOptions(ds: Dataset, faculty: string | undefined): { value: string; label: string }[] {
  return [
    { value: "", label: t().filterAll },
    ...ds.meta.units
      .filter((u) => !faculty || u.faculty === faculty)
      .map((u) => ({ value: u.id, label: loc(u.name) }))
      .sort((a, b) => a.label.localeCompare(b.label, lang)),
  ];
}

export function facultyOptions(ds: Dataset): { value: string; label: string }[] {
  return [{ value: "", label: t().filterAll }, ...ds.meta.faculties.map((f) => ({ value: f.id, label: loc(f.name) }))];
}

export function yearOptions(ds: Dataset): { value: string; label: string }[] {
  const out = [];
  for (let y = ds.meta.years[0]; y <= ds.meta.years[1]; y++) out.push({ value: String(y), label: String(y) });
  return out;
}

/** Faculty, unit and period controls shared by the start page and the network. */
export function filterBar(ds: Dataset, filter: Filter, onChange: (f: Filter) => void): HTMLElement {
  return h(
    "div",
    { class: "filters" },
    select(t().filterFaculty, "faculty", facultyOptions(ds), filter.faculty ?? "", (v) =>
      onChange({ ...filter, faculty: v || undefined, unit: undefined }),
    ),
    select(t().filterUnit, "unit", unitOptions(ds, filter.faculty), filter.unit ?? "", (v) => {
      const unit = ds.unitById.get(v);
      onChange({ ...filter, unit: v || undefined, faculty: unit ? unit.faculty : filter.faculty });
    }),
    select(t().filterFrom, "from", yearOptions(ds), String(filter.from), (v) =>
      onChange({ ...filter, from: Number(v), to: Math.max(Number(v), filter.to) }),
    ),
    select(t().filterTo, "to", yearOptions(ds), String(filter.to), (v) =>
      onChange({ ...filter, to: Number(v), from: Math.min(Number(v), filter.from) }),
    ),
  );
}

export function notFound(): HTMLElement {
  return h("section", { class: "page" }, h("h1", null, "404"), h("p", null, t().notFound), h("a", { href: "#/" }, t().backHome));
}
