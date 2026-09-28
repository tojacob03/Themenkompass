// In-browser full-text search over topics, people and works (MiniSearch).
// The index is built on first use, so pages that do not search stay fast.

import MiniSearch, { type SearchResult } from "minisearch";
import type { Dataset, Person, Work } from "./data";

interface Doc {
  id: string;
  kind: "topic" | "person" | "work";
  name: string;
  context: string;
}

export interface Results {
  topics: string[];
  people: Person[];
  works: Work[];
}

export class Search {
  private index: MiniSearch<Doc>;
  private workById = new Map<string, Work>();

  constructor(private ds: Dataset) {
    this.index = new MiniSearch<Doc>({
      fields: ["name", "context"],
      storeFields: ["kind"],
      searchOptions: { boost: { name: 3 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
    });
    this.index.addAll(documents(ds));
    for (const w of ds.works) this.workById.set(w.i, w);
  }

  search(q: string, limit = 60): Results {
    const hits = this.index.search(q);
    return this.group(hits, limit);
  }

  /** Short list for the start page while typing: topics and people only. */
  suggest(q: string): { topics: string[]; people: Person[] } {
    const hits = this.index.search(q, { filter: (r) => r.kind !== "work" });
    const { topics, people } = this.group(hits, 5);
    return { topics, people };
  }

  private group(hits: SearchResult[], limit: number): Results {
    const out: Results = { topics: [], people: [], works: [] };
    for (const hit of hits) {
      const id = String(hit.id);
      if (hit.kind === "topic" && out.topics.length < limit) out.topics.push(id.slice(2));
      if (hit.kind === "person" && out.people.length < limit) {
        const p = this.ds.personById.get(id.slice(2));
        if (p) out.people.push(p);
      }
      if (hit.kind === "work" && out.works.length < limit) {
        const w = this.workById.get(id.slice(2));
        if (w) out.works.push(w);
      }
    }
    return out;
  }
}

export function documents(ds: Dataset): Doc[] {
  const docs: Doc[] = [];
  for (const [id, [name, subfieldId]] of Object.entries(ds.topics.topics)) {
    const subfield = ds.topics.subfields[subfieldId];
    const field = subfield ? ds.topics.fields[subfield[1]] : undefined;
    docs.push({ id: `t:${id}`, kind: "topic", name, context: [subfield?.[0], field?.[0]].join(" ") });
  }
  for (const p of ds.persons) {
    const units = [...p.u, ...p.f].map((u) => {
      const unit = ds.unitById.get(u) ?? ds.facultyById.get(u);
      return unit ? `${unit.name.de} ${unit.name.en}` : "";
    });
    const topics = p.tp.map(([tid]) => ds.topics.topics[tid]?.[0] ?? "");
    docs.push({ id: `p:${p.i}`, kind: "person", name: p.n, context: [...units, ...topics, p.c ?? ""].join(" ") });
  }
  for (const w of ds.works) {
    docs.push({ id: `w:${w.i}`, kind: "work", name: w.t, context: w.v ?? "" });
  }
  return docs;
}

let instance: Promise<Search> | null = null;

export function getSearch(ds: Dataset): Promise<Search> {
  instance ??= new Promise((resolve) => {
    // Yield once so a "searching" state can paint before the index is built.
    setTimeout(() => resolve(new Search(ds)), 0);
  });
  return instance;
}
