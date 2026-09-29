import { activity, personMatches } from "../analysis";
import type { Dataset } from "../data";
import { h } from "../dom";
import { loc, t } from "../i18n";
import { href } from "../router";
import { fmt, notFound, topicLink, unitLink } from "../ui";

/** A faculty or unit: who is there (alphabetical) and what they work on. */
export function unitView(ds: Dataset, id: string): HTMLElement {
  const unit = ds.unitById.get(id);
  const faculty = ds.facultyById.get(id);
  if (!unit && !faculty) return notFound();
  const filter = unit ? { unit: id } : { faculty: id };
  const people = ds.persons.filter((p) => personMatches(p, filter));
  const works = ds.works.filter((w) => (unit ? (w.ua ?? w.u).includes(id) : w.f.includes(id)));
  const topicCounts = new Map<string, number>();
  for (const w of works) if (w.tp[0]) topicCounts.set(w.tp[0], (topicCounts.get(w.tp[0]) ?? 0) + 1);
  const topTopics = [...topicCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15);
  const parentFaculty = unit ? ds.facultyById.get(unit.faculty) : undefined;
  const subunits = ds.meta.units.filter((u) => (faculty ? u.faculty === id && !u.parent : u.parent === id));

  const filterInput = h("input", { type: "search", id: "people-filter", autocomplete: "off" });
  const list = h(
    "ul",
    { class: "people" },
    people.map((p) => {
      const act = activity(p, ds.meta.currentYear);
      return h(
        "li",
        { "data-name": p.n.toLowerCase() },
        h("a", { href: `#/person/${p.i}`, class: "person-name" }, p.n),
        h("span", { class: "muted" }, p.tp.slice(0, 2).map(([tid]) => ds.topics.topics[tid]?.[0]).filter(Boolean).join("; ")),
        h("span", { class: `activity activity-${act}` }, t().activity[act]),
      );
    }),
  );
  filterInput.addEventListener("input", () => {
    const q = filterInput.value.toLowerCase();
    for (const li of list.children) (li as HTMLElement).hidden = !(li as HTMLElement).dataset.name?.includes(q);
  });

  return h(
    "article",
    { class: "page unit" },
    h("p", { class: "kicker" }, unit ? t().unitKicker : t().facultyKicker, parentFaculty ? ", " : null, parentFaculty ? unitLink(ds, parentFaculty.id) : null),
    h("h1", null, loc((unit ?? faculty)!.name)),
    h(
      "p",
      { class: "lede" },
      `${t().peopleCount(fmt(people.length), people.length)}, ${t().worksCount(fmt(works.length), works.length)} (${ds.meta.years[0]}–${ds.meta.years[1]}).`,
    ),
    subunits.length
      ? h("ul", { class: "chips plain" }, subunits.map((u) => h("li", null, unitLink(ds, u.id))))
      : null,
    h(
      "section",
      { "aria-labelledby": "ut" },
      h("h2", { id: "ut" }, t().unitTopics),
      h("ul", { class: "chips" }, topTopics.map(([tid, n]) => h("li", null, topicLink(ds, tid, fmt(n))))),
    ),
    h(
      "section",
      { "aria-labelledby": "up" },
      h("h2", { id: "up" }, t().unitPeople),
      h("p", { class: "note" }, t().unitPeopleNote(ds.meta.minWorks)),
      people.length > 12 ? h("div", { class: "field inline" }, h("label", { for: "people-filter" }, t().filterPeople), filterInput) : null,
      list,
    ),
    h("p", { class: "actions" }, h("a", { href: href(["netz"], unit ? { u: id, f: unit.faculty } : { f: id }) }, t().openNetwork)),
  );
}
