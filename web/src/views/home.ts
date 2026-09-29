import { type Filter, type Node, filterWorks, topicTree, trend } from "../analysis";
import type { Dataset, Person } from "../data";
import { h } from "../dom";
import { lang, loc, t } from "../i18n";
import { replaceParams, type Route } from "../router";
import { getSearch } from "../search";
import { domainClass, filterBar, fmt, sparkline, trendBadge } from "../ui";
import { domainLegend, domainMix, topicTreemap } from "../viz";

export function filterFromRoute(ds: Dataset, route: Route): Filter {
  const [first, last] = ds.meta.years;
  const num = (key: string, fallback: number) => {
    const v = Number(route.params.get(key));
    return Number.isInteger(v) && v >= first && v <= last ? v : fallback;
  };
  const faculty = route.params.get("f") ?? undefined;
  const unit = route.params.get("u") ?? undefined;
  return {
    faculty: faculty && ds.facultyById.has(faculty) ? faculty : undefined,
    unit: unit && ds.unitById.has(unit) ? unit : undefined,
    from: num("from", first),
    to: num("to", last),
  };
}

export function filterParams(ds: Dataset, f: Filter): Record<string, string | number | undefined> {
  return {
    f: f.faculty,
    u: f.unit,
    from: f.from === ds.meta.years[0] ? undefined : f.from,
    to: f.to === ds.meta.years[1] ? undefined : f.to,
  };
}

export function homeView(ds: Dataset, route: Route): HTMLElement {
  const filter = filterFromRoute(ds, route);
  const mapHost = h("div", { class: "map", "aria-live": "polite" });
  const filters = h("div", null);

  const update = (f: Filter) => {
    replaceParams(filterParams(ds, f));
    filters.replaceChildren(filterBar(ds, f, update));
    mapHost.replaceChildren(topicMap(ds, f));
  };
  update(filter);

  return h(
    "div",
    { class: "home" },
    hero(ds),
    browse(ds),
    h(
      "section",
      { class: "page map-section", "aria-labelledby": "map-title" },
      h("h2", { id: "map-title" }, t().mapTitle),
      h("p", { class: "lede" }, t().mapIntro),
      filters,
      mapHost,
      h("p", { class: "note" }, t().trendExplain),
    ),
  );
}

function hero(ds: Dataset): HTMLElement {
  const input = h("input", {
    id: "hero-q",
    type: "search",
    name: "q",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: t().heroPlaceholder,
    "aria-describedby": "hero-facts",
    "aria-controls": "hero-suggest",
  });
  const suggest = h("div", { id: "hero-suggest", class: "suggest", "aria-live": "polite" });
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) return suggest.replaceChildren();
      const search = await getSearch(ds);
      suggest.replaceChildren(suggestions(ds, q, search.suggest(q)));
    }, 120);
  });
  keyboardNavigation(input, suggest);
  const form = h(
    "form",
    {
      role: "search",
      class: "hero-form",
      onsubmit: (e: Event) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) location.hash = `#/suche?q=${encodeURIComponent(q)}`;
      },
    },
    h(
      "label",
      { for: "hero-q", class: "hero-sentence" },
      `${t().heroLead} ${loc(ds.meta.institution.name)} ${t().heroTo}`,
    ),
    h("div", { class: "hero-input" }, input, h("span", { class: "qmark", "aria-hidden": "true" }, "?"), h("button", { type: "submit" }, t().heroSubmit)),
  );
  const q = ds.meta.quality;
  return h(
    "section",
    { class: "hero" },
    h("h1", { class: "visually-hidden" }, `Themenkompass: ${loc(ds.meta.institution.name)}`),
    form,
    suggest,
    h(
      "p",
      { id: "hero-facts", class: "hero-facts" },
      t().heroFacts(fmt(q.works), fmt(q.persons), ds.meta.years[0], ds.meta.years[1]),
      " ",
      h("a", { href: "#/daten" }, t().heroLimits),
    ),
  );
}

/** Faculties with their institutes: an entry point for people without a keyword yet. */
function browse(ds: Dataset): HTMLElement {
  return h(
    "section",
    { class: "page browse", "aria-labelledby": "browse-title" },
    h("h2", { id: "browse-title" }, t().browseTitle),
    h("p", { class: "lede" }, t().browseIntro),
    domainLegend(ds),
    h(
      "ul",
      { class: "faculties" },
      ds.meta.faculties.map((f) => {
        const people = ds.persons.filter((p) => p.f.includes(f.id)).length;
        const facultyWorks = ds.works.filter((w) => w.f.includes(f.id));
        const works = facultyWorks.length;
        const [first, last] = ds.meta.years;
        const perYear = new Array<number>(last - first + 1).fill(0);
        const byDomain = new Map<string, number>();
        for (const w of facultyWorks) {
          perYear[w.y - first] = (perYear[w.y - first] ?? 0) + 1;
          const domain = w.tp[0] ? ds.topicPath(w.tp[0])?.domain : undefined;
          if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
        }
        const units = ds.meta.units
          .filter((u) => u.faculty === f.id && !u.parent)
          .sort((a, b) => loc(a.name).localeCompare(loc(b.name), lang));
        return h(
          "li",
          { class: "faculty" },
          h("a", { href: `#/einheit/${f.id}`, class: "faculty-name" }, loc(f.name)),
          h("span", { class: "faculty-facts" }, t().facultyFacts(fmt(people), fmt(works))),
          h("div", { class: "faculty-viz" }, domainMix(ds, byDomain), sparkline(perYear, ds.meta.years, ds.meta.currentYear)),
          h(
            "ul",
            null,
            units.map((u) => h("li", null, h("a", { href: `#/einheit/${u.id}` }, loc(u.name)))),
          ),
        );
      }),
    ),
  );
}

/** Arrow keys move between the search field and the suggestions; Escape closes them. */
function keyboardNavigation(input: HTMLInputElement, suggest: HTMLElement): void {
  const links = () => [...suggest.querySelectorAll<HTMLAnchorElement>("a")];
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && links().length) {
      e.preventDefault();
      links()[0]!.focus();
    } else if (e.key === "Escape") {
      suggest.replaceChildren();
    }
  });
  suggest.addEventListener("keydown", (e) => {
    const all = links();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      all[Math.min(i + 1, all.length - 1)]!.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === 0) input.focus();
      else all[i - 1]!.focus();
    } else if (e.key === "Escape") {
      suggest.replaceChildren();
      input.focus();
    }
  });
}

function suggestions(
  ds: Dataset,
  q: string,
  s: { topics: string[]; people: Person[] },
): HTMLElement {
  const block = (title: string, items: HTMLElement[]) =>
    items.length ? h("div", null, h("h3", null, title), h("ul", null, items.map((i) => h("li", null, i)))) : null;
  return h(
    "div",
    { class: "suggest-inner" },
    block(
      t().suggestTopics,
      s.topics.map((id) => {
        const path = ds.topicPath(id);
        return h(
          "a",
          { href: `#/thema/${id}`, class: `topic-link ${domainClass(path?.domain)}` },
          h("span", { class: "dot", "aria-hidden": "true" }),
          ds.topics.topics[id]?.[0] ?? id,
        );
      }),
    ),
    block(
      t().suggestPeople,
      s.people.map((p) => h("a", { href: `#/person/${p.i}` }, p.n)),
    ),
    h("a", { class: "suggest-all", href: `#/suche?q=${encodeURIComponent(q)}` }, t().suggestAll(q)),
  );
}

function topicMap(ds: Dataset, filter: Filter): HTMLElement {
  const works = filterWorks(ds.works, filter);
  const years: [number, number] = [filter.from, filter.to];
  const tree = topicTree(works, ds.topics, years);
  if (!tree.total) return h("p", { class: "empty" }, t().mapEmpty);
  const openField = (fieldId: string) => {
    const details = document.getElementById(`field-${fieldId}`) as HTMLDetailsElement | null;
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    details.querySelector("summary")?.focus({ preventScroll: true });
  };
  const maxField = Math.max(...tree.domains.flatMap((d) => d.children.map((f) => f.total)));

  const row = (node: Node, level: "field" | "subfield" | "topic", max: number, domain: string) => {
    const tr = trend(node.perYear, years, ds.meta.currentYear);
    const label =
      level === "topic"
        ? h("a", { href: `#/thema/${node.id}`, class: "row-name" }, node.name)
        : h("span", { class: "row-name" }, node.name);
    return h(
      "div",
      { class: `row row-${level}` },
      label,
      h(
        "span",
        { class: "row-bar", "aria-hidden": "true" },
        h("span", { class: `bar ${domainClass(domain)}`, style: `width:${Math.max(1, (100 * node.total) / max)}%` }),
      ),
      h("span", { class: "row-count" }, fmt(node.total)),
      sparkline(node.perYear, years, ds.meta.currentYear),
      trendBadge(tr),
    );
  };

  return h(
    "div",
    { class: "domains" },
    h("div", { class: "landscape" }, domainLegend(ds), topicTreemap(tree, openField), h("p", { class: "note" }, t().treemapHint)),
    tree.domains.map((d) =>
      h(
        "section",
        { class: `domain ${domainClass(d.id)}`, "aria-label": d.name },
        h(
          "h3",
          { class: "domain-title" },
          h("span", { class: "swatch", "aria-hidden": "true" }),
          d.name,
          h("span", { class: "domain-count" }, t().worksCount(fmt(d.total), d.total)),
        ),
        d.children.map((field) =>
          h(
            "details",
            { class: "field-group", id: `field-${field.id}` },
            h("summary", null, row(field, "field", maxField, d.id)),
            field.children.map((sub) =>
              h(
                "details",
                { class: "sub-group" },
                h("summary", null, row(sub, "subfield", field.total, d.id)),
                h(
                  "div",
                  { class: "topic-rows" },
                  sub.children.map((topic) => row(topic, "topic", sub.total, d.id)),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    h("p", { class: "visually-hidden" }, lang === "de" ? "Ende der Themenkarte" : "End of topic map"),
  );
}
