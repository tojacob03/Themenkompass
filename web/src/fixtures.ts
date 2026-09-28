// Invented data for the unit tests. No real people.
import { Dataset, type Meta, type Person, type Topics, type Work } from "./data";

export const topics: Topics = {
  domains: { "2": "Social Sciences", "1": "Life Sciences" },
  fields: { "20": ["Economics, Econometrics and Finance", "2"], "11": ["Agricultural and Biological Sciences", "1"] },
  subfields: { "2002": ["Economics and Econometrics", "20"], "1105": ["Ecology", "11"] },
  topics: {
    T1: ["Labour Market Dynamics", "2002", "up"],
    T2: ["Data Markets and Platforms", "2002", "few"],
    T3: ["Coastal Plankton Ecology", "1105", "stable"],
  },
};

const person = (i: string, n: string, u: string[], f: string[], l: number): Person => ({
  i, n, u, f, s: "affiliation", w: 3, l, y: [1, 1, 1, 0, 0], tp: [], ca: [], xi: [],
});

export const persons: Person[] = [
  person("A1", "Alma Beispiel", ["econ"], ["f1"], 2026),
  person("A2", "Bruno Testmann", ["data"], ["f1"], 2023),
  person("A3", "Clara Fiktiv", ["bio"], ["f2"], 2019),
];

const work = (i: string, y: number, tp: string[], a: string[], u: string[], f: string[], n = a.length, x: string[] = []): Work => ({
  i, t: `Invented work ${i}`, y, ty: "article", n, tp, a, u, f, x,
});

export const works: Work[] = [
  work("W1", 2022, ["T1"], ["A1", "A2"], ["econ", "data"], ["f1"], 2, ["I9"]),
  work("W2", 2023, ["T2", "T1"], ["A1", "A2"], ["econ", "data"], ["f1"]),
  work("W3", 2024, ["T1"], ["A1"], ["econ"], ["f1"], 1, ["I9", "I8"]),
  work("W4", 2025, ["T3"], ["A3", "A1"], ["bio", "econ"], ["f1", "f2"]),
  work("W5", 2026, ["T3"], ["A3"], ["bio"], ["f2"]),
  work("W6", 2024, ["T1"], ["A1", "A2", "A3"], ["econ"], ["f1"], 40),
];

export const meta: Meta = {
  schema: 1,
  version: "test",
  institution: { slug: "musteruni", ror: "0zzzzzz00", openalex: "I1", name: { de: "Musteruniversität", en: "Example University" } },
  repository: "https://github.com/example/musteruni-kompass",
  years: [2022, 2026],
  currentYear: 2026,
  retrievedAt: "2026-09-01T00:00:00+00:00",
  generatedAt: "2026-09-01T00:00:00+00:00",
  recentYears: 3,
  networkCap: 25,
  minWorks: 2,
  faculties: [
    { id: "f1", name: { de: "Fakultät Eins", en: "Faculty One" } },
    { id: "f2", name: { de: "Fakultät Zwei", en: "Faculty Two" } },
  ],
  units: [
    { id: "econ", faculty: "f1", parent: null, name: { de: "Volkswirtschaft", en: "Economics" } },
    { id: "data", faculty: "f1", parent: "econ", name: { de: "Datenökonomie", en: "Data Economics" } },
    { id: "bio", faculty: "f2", parent: null, name: { de: "Biologie", en: "Biology" } },
  ],
  quality: {
    works: 6, persons: 3, internalAuthors: 3, authorships: 10, authorshipsWithUnit: 9, authorshipsWithFaculty: 10,
    authorshipsWithoutText: 0, shareWithUnit: 0.9, personsBySource: { affiliation: 3 }, truncatedWorks: 0, worksWithoutTopic: 0,
  },
};

export function dataset(): Dataset {
  return new Dataset("./data/musteruni", meta, works, persons, topics);
}
