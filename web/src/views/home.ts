import { type Filter, type Node, filterWorks, topicTree, trend } from "../analysis";
import type { Dataset, Person } from "../data";
import { h } from "../dom";
import { lang, loc, t } from "../i18n";
import { replaceParams, type Route } from "../router";
import { getSearch } from "../search";
import { domainClass, filterBar, fmt, sparkline, trendBadge } from "../ui";

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
            { class: "field-group" },
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
