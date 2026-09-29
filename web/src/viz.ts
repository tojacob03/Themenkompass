// Visualisations built from plain HTML (so text stays sharp, selectable and accessible).
// Colour is reserved for the four OpenAlex domains; everything else is ink and paper.

import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { TopicTree } from "./analysis";
import type { Dataset, Person } from "./data";
import { h } from "./dom";
import { lang, t } from "./i18n";
import { domainClass, fmt } from "./ui";

/** Fixed domain order for legends, so a colour always means the same domain. */
export const DOMAIN_ORDER = ["3", "2", "4", "1"];

export function domainLegend(ds: Dataset): HTMLElement {
  return h(
    "ul",
    { class: "legend-domains", "aria-label": lang === "de" ? "Farben der Wissenschaftsbereiche" : "Domain colours" },
    DOMAIN_ORDER.filter((id) => ds.topics.domains[id]).map((id) =>
      h("li", { class: domainClass(id) }, h("span", { class: "swatch", "aria-hidden": "true" }), ds.topics.domains[id]!),
    ),
  );
}

// ---------------------------------------------------------------------------- treemap

interface Leaf {
  id: string;
  name: string;
  domain: string;
  domainName: string;
  value: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/**
 * Treemap of fields, grouped by domain: area = works (primary topic), colour = domain.
 * Each tile is a button that opens the field in the list below it.
 */
export function topicTreemap(tree: TopicTree, onSelect: (fieldId: string) => void): HTMLElement {
  const leaves: Leaf[] = tree.domains.flatMap((d) =>
    d.children.map((f) => ({ id: f.id, name: f.name, domain: d.id, domainName: d.name, value: f.total })),
  );
  const container = h("div", { class: "treemap", role: "group", "aria-label": t().treemapLabel });
  let lastWidth = 0;

  const layout = () => {
    const width = container.clientWidth;
    if (!width || width === lastWidth) return;
    lastWidth = width;
    const height = width < 600 ? Math.round(width * 1.15) : Math.min(420, Math.round(width * 0.42));
    container.style.height = `${height}px`;
    type Node = { children?: Node[]; leaf?: Leaf };
    const root = hierarchy<Node>({
      children: tree.domains.map((d) => ({ children: leaves.filter((l) => l.domain === d.id).map((leaf) => ({ leaf })) })),
    })
      .sum((n) => n.leaf?.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    treemap<Node>().tile(treemapSquarify.ratio(1.3)).size([width, height]).paddingInner(2).round(true)(root);

    const nameFont = `700 ${width < 600 ? 13 : 14}px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`;
    const tiles = root.leaves().map((node) => {
      const r = node as typeof node & { x0: number; x1: number; y0: number; y1: number };
      const leaf = node.data.leaf!;
      const w = r.x1 - r.x0;
      const hgt = r.y1 - r.y0;
      const share = Math.round((100 * leaf.value) / Math.max(1, tree.total));
      const label = `${leaf.name}: ${t().worksCount(fmt(leaf.value), leaf.value)} (${share} %), ${leaf.domainName}`;
      // Only print text that fits with padding; the aria-label and tooltip carry the rest.
      const oneLine = w >= textWidth(leaf.name, nameFont) + 20 && hgt >= 44;
      // Tall, narrower tiles may wrap the name, as long as its longest word fits.
      const longestWord = Math.max(...leaf.name.split(/\s+/).map((word) => textWidth(word, nameFont)));
      const wrapped = !oneLine && w >= longestWord + 20 && hgt >= 72;
      const showName = oneLine || wrapped;
      const showCount = showName && hgt >= (wrapped ? 96 : 60);
      return h(
        "button",
        {
          type: "button",
          class: `tile ${domainClass(leaf.domain)}${showName ? "" : " tile-bare"}${wrapped ? " tile-wrap" : ""}`,
          style: `left:${r.x0}px;top:${r.y0}px;width:${w}px;height:${hgt}px`,
          title: label,
          "aria-label": label,
          onclick: () => onSelect(leaf.id),
        },
        showName ? h("span", { class: "tile-name" }, leaf.name) : null,
        showCount ? h("span", { class: "tile-count" }, fmt(leaf.value)) : null,
      );
    });
    container.replaceChildren(...tiles);
  };

  // Lay out whenever the container gets or changes its width (also on first attach).
  const observer = new ResizeObserver(() => layout());
  observer.observe(container);
  // Also lay out once right after insertion: pages opened in a background tab get no
  // resize notifications until they become visible.
  setTimeout(layout, 0);
  return container;
}

// ---------------------------------------------------------------------------- fingerprint

/**
 * A person's topics over time: rows are topics, columns years, dot size = works.
 * Rendered as a real table, so it is also the accessible table view.
 */
export function topicFingerprint(ds: Dataset, person: Person): HTMLElement | null {
  const [first, last] = ds.meta.years;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const topics = person.tp.map(([tid]) => tid);
  if (!topics.length) return null;
  const counts = new Map<string, number[]>(topics.map((tid) => [tid, years.map(() => 0)]));
  for (const w of ds.worksByPerson.get(person.i) ?? []) {
    for (const tid of w.tp) {
      const row = counts.get(tid);
      if (row && w.y >= first && w.y <= last) row[w.y - first]! += 1;
    }
  }
  const max = Math.max(1, ...[...counts.values()].flat());
  const dot = (n: number) => {
    const size = 7 + 13 * Math.sqrt(n / max);
    return h("span", { class: "fp-dot", style: `width:${size}px;height:${size}px`, "aria-hidden": "true" });
  };
  return h(
    "div",
    { class: "fp-wrap" },
    h(
      "table",
      { class: "fingerprint" },
      h("caption", { class: "visually-hidden" }, t().fingerprintCaption),
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", { scope: "col", class: "fp-topic-head" }, h("span", { class: "visually-hidden" }, t().personTopics)),
          years.map((y) =>
            h("th", { scope: "col", class: y === ds.meta.currentYear ? "running" : null }, h("abbr", { title: String(y) }, `’${String(y).slice(2)}`)),
          ),
          h("th", { scope: "col", class: "fp-total" }, "Σ"),
        ),
      ),
      h(
        "tbody",
        null,
        topics.map((tid) => {
          const row = counts.get(tid)!;
          const path = ds.topicPath(tid);
          const name = ds.topics.topics[tid]?.[0] ?? tid;
          return h(
            "tr",
            { class: domainClass(path?.domain) },
            h(
              "th",
              { scope: "row" },
              h("a", { href: `#/thema/${tid}`, class: `topic-link ${domainClass(path?.domain)}` }, h("span", { class: "dot", "aria-hidden": "true" }), name),
            ),
            row.map((n, i) =>
              h(
                "td",
                { title: n ? `${years[i]}: ${t().worksCount(String(n), n)}` : undefined, class: years[i] === ds.meta.currentYear ? "running" : null },
                n ? [dot(n), h("span", { class: "visually-hidden" }, String(n))] : null,
              ),
            ),
            h("td", { class: "fp-total" }, String(row.reduce((a, b) => a + b, 0))),
          );
        }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------- domain mix

/** Stacked bar of domain shares, with 2px gaps between segments. */
export function domainMix(ds: Dataset, counts: Map<string, number>): HTMLElement {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const parts = DOMAIN_ORDER.filter((id) => (counts.get(id) ?? 0) > 0);
  const summary = parts
    .map((id) => `${ds.topics.domains[id]}: ${Math.round((100 * counts.get(id)!) / total)} %`)
    .join(", ");
  return h(
    "div",
    { class: "mix", role: "img", "aria-label": summary, title: summary },
    parts.map((id) =>
      h("span", { class: `mix-part ${domainClass(id)}`, style: `flex-grow:${counts.get(id)}` }),
    ),
  );
}
