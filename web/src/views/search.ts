import type { Dataset } from "../data";
import { h } from "../dom";
import { t } from "../i18n";
import type { Route } from "../router";
import { getSearch } from "../search";
import { personUnits, topicLink, workList } from "../ui";

export function searchView(ds: Dataset, route: Route): HTMLElement {
  const q = route.params.get("q") ?? "";
  const input = h("input", { id: "q", type: "search", name: "q", value: q, autocomplete: "off", "aria-describedby": "search-hint" });
  const results = h("div", { class: "results", "aria-live": "polite" });

  const run = async (query: string) => {
    if (query.trim().length < 2) return results.replaceChildren();
    results.replaceChildren(h("p", { class: "loading" }, "…"));
    const search = await getSearch(ds);
    const r = search.search(query.trim());
    const total = r.topics.length + r.people.length + r.works.length;
    if (!total) return results.replaceChildren(h("p", { class: "empty" }, t().searchNone(query)));
    const blocks = [
      h("p", { class: "note" }, t().searchCount(total)),
      r.topics.length
        ? h("section", null, h("h2", null, t().resultsTopics), h("ul", { class: "chips" }, r.topics.slice(0, 30).map((id) => h("li", null, topicLink(ds, id)))))
        : null,
      r.people.length
        ? h(
            "section",
            null,
            h("h2", null, t().resultsPeople),
            h(
              "ul",
              { class: "people" },
              r.people.map((p) =>
                h(
                  "li",
                  null,
                  h("a", { href: `#/person/${p.i}`, class: "person-name" }, p.n),
                  personUnits(ds, p),
                  h("span", { class: "context" }, p.tp.slice(0, 3).map(([tid]) => ds.topics.topics[tid]?.[0]).filter(Boolean).join("; ")),
                ),
              ),
            ),
          )
        : null,
      r.works.length ? h("section", null, h("h2", null, t().resultsWorks), workList(ds, r.works, { initial: 15 })) : null,
    ];
    results.replaceChildren(...blocks.filter((b): b is HTMLElement => b !== null));
  };
  void run(q);

  return h(
    "section",
    { class: "page search" },
    h("h1", null, t().searchTitle),
    h(
      "form",
      {
        role: "search",
        class: "search-form",
        onsubmit: (e: Event) => {
          e.preventDefault();
          location.hash = `#/suche?q=${encodeURIComponent(input.value.trim())}`;
        },
      },
      h("label", { for: "q" }, t().searchLabel),
      h("div", { class: "search-row" }, input, h("button", { type: "submit" }, t().heroSubmit)),
      h("p", { id: "search-hint", class: "note" }, t().searchHint),
    ),
    results,
  );
}
