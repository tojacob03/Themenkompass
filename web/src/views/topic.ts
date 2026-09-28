import * as Plot from "@observablehq/plot";
import { activity, peopleForTopic, recentWorks, trend } from "../analysis";
import type { Dataset } from "../data";
import { h } from "../dom";
import { lang, t } from "../i18n";
import { href } from "../router";
import { domainClass, fmt, notFound, personUnits, trendBadge, workList } from "../ui";

export function perYearChart(counts: number[], years: [number, number], currentYear: number, label: string): HTMLElement {
  const data = counts.map((n, i) => ({
    year: years[0] + i,
    n,
    running: years[0] + i === currentYear,
  }));
  const chart = Plot.plot({
    height: 180,
    marginLeft: 36,
    x: { label: null, tickFormat: (d: number) => String(d), type: "band" },
    y: { label: null, grid: true, tickFormat: "d" },
    marks: [
      Plot.barY(data, {
        x: "year",
        y: "n",
        fill: "currentColor",
        fillOpacity: (d: { running: boolean }) => (d.running ? 0.35 : 0.9),
        title: (d: { year: number; n: number; running: boolean }) =>
          `${d.year}: ${d.n}${d.running ? ` (${t().runningYear})` : ""}`,
      }),
      Plot.ruleY([0]),
    ],
  });
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", `${label}: ${data.map((d) => `${d.year}: ${d.n}`).join(", ")}`);
  return h("figure", { class: "chart" }, chart, h("figcaption", null, `${label}. ${t().runningYear}: ${currentYear}.`));
}

export function topicView(ds: Dataset, topicId: string): HTMLElement {
  const topic = ds.topics.topics[topicId];
  const path = ds.topicPath(topicId);
  if (!topic || !path) return notFound();
  const [first, last] = ds.meta.years;
  const works = (ds.worksByTopic.get(topicId) ?? []).slice();
  const counts = new Array<number>(last - first + 1).fill(0);
  for (const w of works) counts[w.y - first]! += 1;
  const people = peopleForTopic(works, topicId, ds.personById);
  const recent = recentWorks(works, ds.meta.currentYear, ds.meta.recentYears);

  const filterInput = h("input", { type: "search", id: "people-filter", autocomplete: "off" });
  const list = h(
    "ul",
    { class: "people" },
    people.map(({ person, works: n }) =>
      h(
        "li",
        { "data-name": person.n.toLowerCase() },
        h("a", { href: `#/person/${person.i}`, class: "person-name" }, person.n),
        personUnits(ds, person),
        h("span", { class: "muted" }, t().worksCount(fmt(n), n)),
        h("span", { class: `activity activity-${activity(person, ds.meta.currentYear)}` }, t().activity[activity(person, ds.meta.currentYear)]),
      ),
    ),
  );
  filterInput.addEventListener("input", () => {
    const q = filterInput.value.toLowerCase();
    for (const li of list.children) (li as HTMLElement).hidden = !(li as HTMLElement).dataset.name?.includes(q);
  });

  return h(
    "article",
    { class: `page topic ${domainClass(path.domain)}` },
    h(
      "nav",
      { class: "crumbs", "aria-label": lang === "de" ? "Einordnung" : "Classification" },
      h("span", { class: "swatch", "aria-hidden": "true" }),
      [ds.topics.domains[path.domain], ds.topics.fields[path.field]?.[0], ds.topics.subfields[path.subfield]?.[0]]
        .filter(Boolean)
        .join(" › "),
    ),
    h("h1", null, topic[0]),
    h(
      "p",
      { class: "lede" },
      t().worksCount(fmt(works.length), works.length),
      ` (${first}–${last}). `,
      trendBadge(trend(counts, [first, last], ds.meta.currentYear)),
    ),
    h("p", { class: "note" }, t().topicNameNote),
    perYearChart(counts, [first, last], ds.meta.currentYear, t().perYear),
    h(
      "section",
      { "aria-labelledby": "who" },
      h("h2", { id: "who" }, t().whoResearches),
      h("p", { class: "note" }, t().whoResearchesNote),
      people.length > 12 ? h("div", { class: "field inline" }, h("label", { for: "people-filter" }, t().filterPeople), filterInput) : null,
      list,
    ),
    h(
      "section",
      { "aria-labelledby": "recent" },
      h("h2", { id: "recent" }, t().recentWorks(ds.meta.recentYears)),
      recent.length ? workList(ds, recent) : h("p", null, t().noRecent),
    ),
    h(
      "p",
      { class: "actions" },
      h("a", { href: href(["netz"], { level: "topic", topic: topicId }) }, t().openNetwork),
      h("a", { href: `https://openalex.org/${topicId}`, rel: "noopener", target: "_blank" }, t().onOpenAlex),
    ),
  );
}
