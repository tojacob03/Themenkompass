import { activity, recentWorks } from "../analysis";
import type { Dataset, Person } from "../data";
import { h } from "../dom";
import { t } from "../i18n";
import { href } from "../router";
import { fmt, issueUrl, notFound, personLink, personUnits, topicLink, workList } from "../ui";
import { perYearChart } from "./topic";

export function personView(ds: Dataset, id: string): HTMLElement {
  const p = ds.personById.get(id);
  if (!p) return notFound();
  const works = (ds.worksByPerson.get(id) ?? []).slice().sort((a, b) => b.y - a.y || a.t.localeCompare(b.t));
  const recent = recentWorks(works, ds.meta.currentYear, ds.meta.recentYears);
  const act = activity(p, ds.meta.currentYear);

  const partners = h("ul", { class: "plain" });
  if (p.xi.length) {
    void ds.institutions().then((inst) => {
      partners.replaceChildren(
        ...p.xi.map(([iid, n]) =>
          h(
            "li",
            null,
            h("a", { href: `https://openalex.org/${iid}`, rel: "noopener", target: "_blank" }, inst[iid]?.[0] ?? iid),
            inst[iid]?.[1] ? h("span", { class: "muted" }, ` (${inst[iid]?.[1]})`) : null,
            h("span", { class: "muted" }, ` ${t().sharedWorks(n)}`),
          ),
        ),
      );
    });
  }

  return h(
    "article",
    { class: "page person" },
    h("h1", null, p.n),
    h("p", { class: "lede" }, personUnits(ds, p)),
    p.c ? h("p", null, `${t().chair}: ${p.c}`) : null,
    works.length
      ? h("p", { class: "facts" }, t().personFacts(works.length, works[works.length - 1]!.y, recent.length, ds.meta.recentYears))
      : null,
    h("p", { class: "note" }, sourceText(ds, p, works.length)),
    h(
      "nav",
      { class: "jump", "aria-label": t().onThisPage },
      h("span", null, `${t().onThisPage}:`),
      h("a", { href: "#topics", onclick: jump("topics") }, t().personTopics),
      h("a", { href: "#recent", onclick: jump("recent") }, t().recentWorks(ds.meta.recentYears)),
      p.ca.length ? h("a", { href: "#co", onclick: jump("co") }, t().coauthors) : null,
      p.xi.length ? h("a", { href: "#partners", onclick: jump("partners") }, t().partners) : null,
    ),
    h(
      "section",
      { "aria-labelledby": "act" },
      h("h2", { id: "act" }, h("span", { class: `activity activity-${act}` }, t().activity[act])),
      p.l ? h("p", null, t().activityLine(p.l)) : null,
      perYearChart(p.y, ds.meta.years, ds.meta.currentYear, t().perYear),
      h("p", { class: "note" }, t().activityExplain),
    ),
    h(
      "section",
      { "aria-labelledby": "topics" },
      h("h2", { id: "topics" }, t().personTopics),
      h("ul", { class: "chips" }, p.tp.map(([tid, n]) => h("li", null, topicLink(ds, tid, fmt(n))))),
      h("p", { class: "note" }, t().personTopicsNote),
    ),
    h(
      "section",
      { "aria-labelledby": "recent" },
      h("h2", { id: "recent" }, t().recentWorks(ds.meta.recentYears)),
      recent.length ? workList(ds, recent, { hidePerson: p.i }) : h("p", null, t().noRecent),
    ),
    h(
      "section",
      { "aria-labelledby": "co" },
      h("h2", { id: "co" }, t().coauthors),
      p.ca.length
        ? h(
            "ul",
            { class: "people" },
            p.ca
              .map(([cid, n]) => [ds.personById.get(cid), n] as const)
              .filter((x): x is readonly [Person, number] => !!x[0])
              .sort((a, b) => a[0].n.localeCompare(b[0].n, "de"))
              .map(([c, n]) => h("li", null, personLink(c), h("span", { class: "muted" }, ` ${t().sharedWorks(n)}`))),
          )
        : h("p", null, t().noCoauthors),
      h("p", { class: "note" }, t().coauthorsNote(ds.meta.networkCap)),
      p.ca.length ? h("p", null, h("a", { href: href(["netz"], { focus: p.i, f: p.f[0] }) }, t().openNetwork)) : null,
    ),
    p.xi.length
      ? h("section", { "aria-labelledby": "partners" }, h("h2", { id: "partners" }, t().partners), partners)
      : null,
    h(
      "section",
      { "aria-labelledby": "profiles" },
      h("h2", { id: "profiles" }, t().profiles),
      h(
        "ul",
        { class: "plain" },
        h("li", null, h("a", { href: `https://openalex.org/${p.i}`, rel: "noopener", target: "_blank" }, `OpenAlex ${p.i}`)),
        p.o ? h("li", null, h("a", { href: `https://orcid.org/${p.o}`, rel: "noopener", target: "_blank" }, `ORCID ${p.o}`)) : null,
      ),
      h("p", { class: "note" }, t().noContact),
    ),
    correctionBox(ds, p),
  );
}

/** In-page links must not change the hash, which is the router's. */
function jump(id: string): (e: Event) => void {
  return (e) => {
    e.preventDefault();
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target?.setAttribute("tabindex", "-1");
    target?.focus({ preventScroll: true });
  };
}

function sourceText(ds: Dataset, p: Person, total: number): string {
  const s = t().unitSource;
  if (p.s === "affiliation") {
    const evidence = (ds.worksByPerson.get(p.i) ?? []).filter((w) => p.u.some((u) => w.u.includes(u))).length;
    return s.affiliation(Math.min(evidence, total), total);
  }
  return s[p.s]();
}

function correctionBox(ds: Dataset, p: Person): HTMLElement | null {
  const fix = issueUrl(ds, "correction", p);
  const remove = issueUrl(ds, "removal", p);
  if (!fix || !remove) return null;
  return h(
    "aside",
    { class: "callout", "aria-labelledby": "wrong" },
    h("h2", { id: "wrong" }, t().wrongTitle),
    h("p", null, t().wrongText, " ", h("a", { href: fix, rel: "noopener", target: "_blank" }, t().reportError)),
    h("p", null, t().removeText, " ", h("a", { href: remove, rel: "noopener", target: "_blank" }, t().removeLink)),
  );
}
