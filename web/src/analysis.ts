// Pure functions over the dataset. Everything here is unit-tested (analysis.test.ts).

import type { Person, Topics, Trend, Work } from "./data";

export interface Filter {
  faculty?: string;
  unit?: string;
  from: number;
  to: number;
}

export function filterWorks(works: Work[], filter: Filter): Work[] {
  return works.filter(
    (w) =>
      w.y >= filter.from &&
      w.y <= filter.to &&
      (!filter.faculty || w.f.includes(filter.faculty)) &&
      (!filter.unit || w.u.includes(filter.unit)),
  );
}

export function personMatches(p: Person, filter: Pick<Filter, "faculty" | "unit">): boolean {
  return (!filter.faculty || p.f.includes(filter.faculty)) && (!filter.unit || p.u.includes(filter.unit));
}

/** Same rule as export.trend() in the Python pipeline. */
export function trend(counts: number[], years: [number, number], currentYear: number): Trend {
  const at = (y: number) => (y >= years[0] && y <= years[1] ? (counts[y - years[0]] ?? 0) : 0);
  const lastComplete = Math.min(years[1], currentYear - 1);
  let recent = 0;
  let before = 0;
  for (let y = lastComplete - 2; y <= lastComplete; y++) recent += at(y);
  for (let y = lastComplete - 5; y <= lastComplete - 3; y++) before += at(y);
  if (Math.max(recent, before) < 5) return "few";
  if (before === 0) return "up";
  const change = (recent - before) / before;
  if (change >= 0.25) return "up";
  if (change <= -0.25) return "down";
  return "stable";
}

export interface Node {
  id: string;
  name: string;
  total: number;
  perYear: number[];
  children: Node[];
}

export interface TopicTree {
  domains: Node[];
  total: number;
}

/**
 * Domain > field > subfield > topic, counting each work once under its primary topic.
 * Children are sorted by size; this orders topics, never people.
 */
export function topicTree(works: Work[], topics: Topics, years: [number, number]): TopicTree {
  const n = years[1] - years[0] + 1;
  const make = (id: string, name: string): Node => ({
    id,
    name,
    total: 0,
    perYear: new Array<number>(n).fill(0),
    children: [],
  });
  const index = new Map<string, Node>();
  const root = make("root", "");
  const get = (key: string, parent: Node, name: string) => {
    let node = index.get(key);
    if (!node) {
      node = make(key.split(":")[1] ?? key, name);
      index.set(key, node);
      parent.children.push(node);
    }
    return node;
  };
  for (const w of works) {
    const tid = w.tp[0];
    const topic = tid ? topics.topics[tid] : undefined;
    const subfield = topic ? topics.subfields[topic[1]] : undefined;
    const field = subfield ? topics.fields[subfield[1]] : undefined;
    if (!tid || !topic || !subfield || !field) continue;
    const path = [
      get(`d:${field[1]}`, root, topics.domains[field[1]] ?? field[1]),
    ];
    path.push(get(`f:${subfield[1]}`, path[0]!, field[0]));
    path.push(get(`s:${topic[1]}`, path[1]!, subfield[0]));
    path.push(get(`t:${tid}`, path[2]!, topic[0]));
    for (const node of [root, ...path]) {
      node.total += 1;
      const k = w.y - years[0];
      if (k >= 0 && k < n) node.perYear[k] = (node.perYear[k] ?? 0) + 1;
    }
  }
  const sort = (node: Node) => {
    node.children.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    node.children.forEach(sort);
  };
  sort(root);
  return { domains: root.children, total: root.total };
}

/** People who published on a topic (any of a work's topics), alphabetical. */
export function peopleForTopic(
  works: Work[],
  topicId: string,
  personById: Map<string, Person>,
): { person: Person; works: number }[] {
  const counts = new Map<string, number>();
  for (const w of works) {
    if (!w.tp.includes(topicId)) continue;
    for (const a of w.a) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts]
    .flatMap(([id, n]) => {
      const person = personById.get(id);
      return person ? [{ person, works: n }] : [];
    })
    .sort((a, b) => a.person.n.localeCompare(b.person.n, "de"));
}

export type Activity = "active" | "quiet" | "inactive";

/** Plain-language activity: latest listed work within 2 years, within 5 years, or older. */
export function activity(person: Person, currentYear: number): Activity {
  if (person.l === null) return "inactive";
  if (person.l >= currentYear - 2) return "active";
  if (person.l >= currentYear - 5) return "quiet";
  return "inactive";
}

export interface NetworkOptions {
  from: number;
  to: number;
  faculty?: string;
  unit?: string;
  topicLevel?: "field" | "subfield" | "topic";
  topicId?: string;
  external: boolean;
  cap: number;
  minWeight: number;
}

export interface Graph {
  nodes: { id: string; kind: "person" | "institution"; weight: number }[];
  edges: { source: string; target: string; weight: number; kind: "internal" | "external" }[];
  works: number;
}

export function workInTopic(w: Work, topics: Topics, level: NetworkOptions["topicLevel"], id?: string): boolean {
  if (!level || !id) return true;
  return w.tp.some((t) => {
    if (level === "topic") return t === id;
    const topic = topics.topics[t];
    if (!topic) return false;
    if (level === "subfield") return topic[1] === id;
    return topics.subfields[topic[1]]?.[1] === id;
  });
}

/**
 * Co-authorship network. Nodes are listed people who match the unit/faculty filter;
 * edges connect two of them when they share works in the selection. Works with more
 * authors than `cap` are left out (large consortia would connect everyone). People
 * without any connection in the selection are not drawn.
 */
export function buildNetwork(
  works: Work[],
  personById: Map<string, Person>,
  topics: Topics,
  opt: NetworkOptions,
): Graph {
  const inScope = (id: string) => {
    const p = personById.get(id);
    return !!p && personMatches(p, opt);
  };
  const pair = new Map<string, number>();
  const ext = new Map<string, number>();
  const weight = new Map<string, number>();
  let used = 0;
  for (const w of works) {
    if (w.y < opt.from || w.y > opt.to || w.n > opt.cap) continue;
    if (!workInTopic(w, topics, opt.topicLevel, opt.topicId)) continue;
    const people = w.a.filter(inScope);
    if (people.length === 0) continue;
    used += 1;
    for (const a of people) weight.set(a, (weight.get(a) ?? 0) + 1);
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const [s, t] = [people[i]!, people[j]!].sort();
        const key = `${s}|${t}`;
        pair.set(key, (pair.get(key) ?? 0) + 1);
      }
      if (opt.external) {
        for (const inst of w.x ?? []) {
          const key = `${people[i]}|${inst}`;
          ext.set(key, (ext.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const edges: Graph["edges"] = [];
  const connected = new Set<string>();
  for (const [key, n] of pair) {
    if (n < opt.minWeight) continue;
    const [source, target] = key.split("|") as [string, string];
    edges.push({ source, target, weight: n, kind: "internal" });
    connected.add(source).add(target);
  }
  const instWeight = new Map<string, number>();
  for (const [key, n] of ext) {
    if (n < opt.minWeight) continue;
    const [source, target] = key.split("|") as [string, string];
    edges.push({ source, target, weight: n, kind: "external" });
    connected.add(source);
    instWeight.set(target, (instWeight.get(target) ?? 0) + n);
  }
  const nodes: Graph["nodes"] = [];
  for (const [id, n] of weight) {
    if (connected.has(id)) nodes.push({ id, kind: "person", weight: n });
  }
  for (const [id, n] of instWeight) nodes.push({ id, kind: "institution", weight: n });
  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target));
  return { nodes, edges, works: used };
}

export function recentWorks(works: Work[], currentYear: number, years: number): Work[] {
  return works.filter((w) => w.y > currentYear - years).sort((a, b) => b.y - a.y || a.t.localeCompare(b.t));
}
