import { describe, expect, it } from "vitest";
import { dataset } from "./fixtures";
import { Search } from "./search";

describe("Search", () => {
  const search = new Search(dataset());

  it("finds topics, people and works", () => {
    const r = search.search("plankton");
    expect(r.topics).toEqual(["T3"]);
    expect(search.search("Beispiel").people.map((p) => p.i)).toEqual(["A1"]);
    expect(search.search("invented W3").works.map((w) => w.i)).toContain("W3");
  });

  it("tolerates typos and prefixes", () => {
    expect(search.search("Testman").people.map((p) => p.i)).toEqual(["A2"]);
    expect(search.search("labo").topics).toContain("T1");
  });

  it("finds people through their unit name", () => {
    expect(search.search("Biologie").people.map((p) => p.i)).toEqual(["A3"]);
  });

  it("suggest leaves out works", () => {
    const s = search.suggest("invented");
    expect(s).toEqual({ topics: [], people: [] });
  });
});
