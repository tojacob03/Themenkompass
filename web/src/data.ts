// Shapes of the JSON files written by src/themenkompass/export.py.

export type Lang = "de" | "en";
export type Localized = Record<Lang, string>;
export type Trend = "up" | "down" | "stable" | "few";
export type UnitSource = "affiliation" | "mapping" | "faculty" | "none";

export interface Meta {
  schema: number;
  version: string;
  institution: { slug: string; ror: string; openalex: string; name: Localized };
  repository: string | null;
  legal?: { operator?: string; address?: string; email?: string };
  years: [number, number];
  currentYear: number;
  retrievedAt: string;
  generatedAt: string;
  recentYears: number;
  networkCap: number;
  minWorks: number;
  faculties: { id: string; name: Localized }[];
  units: { id: string; faculty: string; parent: string | null; name: Localized }[];
  quality: {
    works: number;
    persons: number;
    internalAuthors: number;
    authorships: number;
    authorshipsWithUnit: number;
    authorshipsWithFaculty: number;
    authorshipsWithoutText: number;
    shareWithUnit: number;
    personsBySource: Partial<Record<UnitSource, number>>;
    truncatedWorks: number;
    worksWithoutTopic: number;
  };
}

export interface Work {
  i: string; // OpenAlex work id
  t: string; // title
  y: number; // publication year
  ty: string; // type
  n: number; // number of authors
  tp: string[]; // topic ids, primary first
  a: string[]; // listed people of the institution
  u: string[]; // units
  f: string[]; // faculties
  d?: string; // DOI
  v?: string; // venue
  x?: string[]; // external institutions
  tr?: 1; // author list truncated by OpenAlex
}

export interface Person {
  i: string;
  n: string;
  u: string[];
  f: string[];
  s: UnitSource;
  w: number;
  l: number | null;
  y: number[];
  tp: [string, number][];
  ca: [string, number][];
  xi: [string, number][];
  o?: string;
  c?: string;
}

export interface Topics {
  domains: Record<string, string>;
  fields: Record<string, [name: string, domain: string]>;
  subfields: Record<string, [name: string, field: string]>;
  topics: Record<string, [name: string, subfield: string, trend: Trend]>;
}

export type Institutions = Record<string, [name: string, country: string | null, type: string | null]>;

export interface Index {
  default: string;
  institutions: { slug: string; name: Localized }[];
}

export class Dataset {
  readonly personById = new Map<string, Person>();
  readonly worksByPerson = new Map<string, Work[]>();
  readonly worksByTopic = new Map<string, Work[]>();
  readonly unitById = new Map<string, Meta["units"][number]>();
  readonly facultyById = new Map<string, Meta["faculties"][number]>();
  private institutionsPromise: Promise<Institutions> | null = null;

  constructor(
    readonly base: string,
    readonly meta: Meta,
    readonly works: Work[],
    readonly persons: Person[],
    readonly topics: Topics,
  ) {
    for (const p of persons) this.personById.set(p.i, p);
    for (const u of meta.units) this.unitById.set(u.id, u);
    for (const f of meta.faculties) this.facultyById.set(f.id, f);
    for (const w of works) {
      for (const a of w.a) push(this.worksByPerson, a, w);
      for (const t of w.tp) push(this.worksByTopic, t, w);
    }
  }

  institutions(): Promise<Institutions> {
    this.institutionsPromise ??= fetchJson<Institutions>(`${this.base}/institutions.json`);
    return this.institutionsPromise;
  }

  topicPath(topicId: string): { domain: string; field: string; subfield: string } | null {
    const topic = this.topics.topics[topicId];
    if (!topic) return null;
    const subfield = this.topics.subfields[topic[1]];
    if (!subfield) return null;
    const field = this.topics.fields[subfield[1]];
    if (!field) return null;
    return { subfield: topic[1], field: subfield[1], domain: field[1] };
  }

  domainOfField(fieldId: string): string | undefined {
    return this.topics.fields[fieldId]?.[1];
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadDataset(root = "./data"): Promise<Dataset> {
  const index = await fetchJson<Index>(`${root}/index.json`);
  const slug = index.default;
  const base = `${root}/${slug}`;
  const [meta, works, persons, topics] = await Promise.all([
    fetchJson<Meta>(`${base}/meta.json`),
    fetchJson<Work[]>(`${base}/works.json`),
    fetchJson<Person[]>(`${base}/persons.json`),
    fetchJson<Topics>(`${base}/topics.json`),
  ]);
  if (meta.schema !== 1) throw new Error(`unsupported data schema ${meta.schema}`);
  return new Dataset(base, meta, works, persons, topics);
}
