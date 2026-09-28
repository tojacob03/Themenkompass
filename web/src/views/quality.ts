// "Datenqualität und Grenzen": how the data is made, where it is wrong, how to fix it.

import type { Dataset } from "../data";
import { h } from "../dom";
import { lang, loc } from "../i18n";
import { fmt } from "../ui";

interface Validation {
  checkedAt: string;
  people: number;
  reference: number;
  found: number;
  missing: number;
  wrong: number;
  notes: { de: string[]; en: string[] };
}

type Block = [heading: string, ...paragraphs: (string | HTMLElement)[]];

export function qualityView(ds: Dataset): HTMLElement {
  const q = ds.meta.quality;
  const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))} %`;
  const repo = ds.meta.repository;
  const issues = (template: string, label: string) =>
    repo ? h("a", { href: `${repo}/issues/new?template=${template}`, rel: "noopener", target: "_blank" }, label) : label;
  const inst = loc(ds.meta.institution.name);
  const date = new Date(ds.meta.retrievedAt).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB");
  const bySource = q.personsBySource;
  const validation = h("div", null);
  void fetch(`${ds.base}/validation.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Validation>) : null))
    .then((v) => validation.replaceChildren(validationBlock(v)))
    .catch(() => validation.replaceChildren(validationBlock(null)));

  const de: Block[] = [
    [
      "Woher die Daten kommen",
      `Alle Angaben stammen aus OpenAlex, einem offenen Katalog wissenschaftlicher Werke (Lizenz CC0). Abgerufen werden alle Werke der Jahre ${ds.meta.years[0]} bis ${ds.meta.years[1]}, bei denen OpenAlex mindestens eine Person der ${inst} zuordnet. Letzter Abruf: ${date}. Die Daten werden monatlich automatisch aktualisiert.`,
      "Gezeigt werden nur öffentliche bibliografische Angaben: Namen, Werke, Themen, Ko-Autorschaften, ORCID und OpenAlex-ID. Keine Kontaktdaten, keine Fotos, keine Zitationszahlen und keine Ranglisten.",
    ],
    [
      "Wie Personen einer Einrichtung zugeordnet werden",
      "OpenAlex kennt die Universität, aber keine Fakultäten, Institute oder Lehrstühle. Der Themenkompass liest deshalb den Rohtext der Zugehörigkeit, den Autorinnen und Autoren auf ihre Werke schreiben (etwa „Department of Economics, University of Oldenburg“), und gleicht ihn mit Mustern aus einer öffentlichen Konfigurationsdatei ab. Eine Person bekommt die Einrichtungen, die in ihren Werken am häufigsten genannt werden.",
      `Von ${fmt(q.authorships)} Autorschaften aus der Universität lassen ${fmt(q.authorshipsWithUnit)} (${pct(q.authorshipsWithUnit, q.authorships)}) eine Einrichtung erkennen, ${fmt(q.authorshipsWithFaculty)} (${pct(q.authorshipsWithFaculty, q.authorships)}) mindestens die Fakultät. Von ${fmt(q.persons)} aufgeführten Personen sind ${fmt(bySource.affiliation ?? 0)} über den Rohtext zugeordnet, ${fmt(bySource.mapping ?? 0)} über die gepflegte Zuordnungsdatei, ${fmt(bySource.faculty ?? 0)} nur einer Fakultät und ${fmt(bySource.none ?? 0)} gar nicht.`,
      `Aufgeführt wird, wer im Zeitraum mindestens ${ds.meta.minWorks} Werke mit Angabe der Universität hat. Wer die Universität nur auf einem Werk nennt, zählt für die Themen, bekommt aber keine eigene Seite.`,
    ],
    [
      "Bekannte Fehlerquellen",
      h(
        "ul",
        null,
        h("li", null, "Falsche Zuordnung zur Universität: OpenAlex ordnet Rohtexte automatisch Institutionen zu. Dabei landen gelegentlich Einrichtungen, die nur in Oldenburg sitzen, bei der Universität, zum Beispiel ein Gericht, ein Institut des DLR in derselben Straße oder Listen mehrerer Bibliotheken auf einem Konferenzband."),
        h("li", null, "Fehlende Werke: Nicht jedes Werk nennt eine Zugehörigkeit, und nicht jede genannte Zugehörigkeit erkennt OpenAlex. Buchkapitel, deutschsprachige Veröffentlichungen, Rechtswissenschaft sowie Geistes- und Kulturwissenschaften sind in OpenAlex schwächer erfasst als Zeitschriftenartikel aus Natur- und Lebenswissenschaften."),
        h("li", null, "Geteilte oder verschmolzene Profile: OpenAlex erkennt Personen über einen Algorithmus. Eine Person kann auf zwei Profile verteilt sein, oder zwei Personen mit ähnlichem Namen teilen sich eines. IDs aus der Zuordnungsdatei werden bei jeder Aktualisierung auf Zusammenlegungen geprüft."),
        h("li", null, `Große Autorenteams: In Listen gibt OpenAlex höchstens 100 Autor:innen pro Werk heraus (betroffen: ${fmt(q.truncatedWorks)} Werke). Werke mit mehr als ${ds.meta.networkCap} Autor:innen zählen nicht für Ko-Autorschaften und das Netzwerk.`),
        h("li", null, "Themen: Die Themen vergibt OpenAlex automatisch anhand von Titel, Abstract und Zeitschrift. Die Zuordnung ist oft plausibel, aber nicht immer. Die Themennamen sind englisch."),
        h("li", null, "Mehrdeutige Rohtexte: Kliniken, Exzellenzcluster und Forschungszentren arbeiten fakultätsübergreifend. Sie werden nur einer Einrichtung zugeordnet, wenn der Text eindeutig ist."),
      ),
    ],
    [
      "Was nicht abgebildet ist",
      h(
        "ul",
        null,
        h("li", null, "Lehrstühle und Arbeitsgruppen, außer sie stehen in der Zuordnungsdatei."),
        h("li", null, "Stellenausschreibungen, HiWi-Stellen und Abschlussarbeitsthemen. Dafür sind die Seiten der Lehrstühle und das Stellenportal der Universität zuständig."),
        h("li", null, "Lehre, Drittmittelprojekte, Gremienarbeit, Transfer und alles, was nicht als Werk veröffentlicht ist."),
        h("li", null, "Qualität oder Bedeutung von Forschung. Die Anzahl von Werken sagt darüber nichts aus, deshalb gibt es keine Ranglisten."),
      ),
    ],
    [
      "Stichprobe gegen eigene Publikationslisten",
      "Für eine Stichprobe von 20 zufällig ausgewählten Personen wurden die Werke im Themenkompass mit der Publikationsliste auf ihrer eigenen Seite verglichen.",
      validation,
    ],
    [
      "Fehler melden, Nennung entfernen lassen",
      h("p", null, "Fehler meldest du über ein ", issues("correction.yml", "Formular auf GitHub"), ". Korrekturen landen in der Zuordnungsdatei oder in der Konfiguration und gelten ab der nächsten Aktualisierung. Wir antworten innerhalb von 14 Tagen."),
      h("p", null, "Wer nicht genannt werden möchte, stellt einen ", issues("removal.yml", "Antrag auf Entfernung"), ". Die Person wird ohne Rückfragen und ohne Begründung entfernt, spätestens innerhalb von 14 Tagen: Profil, Name und Werke, auf denen sie die einzige aufgeführte Person der Universität ist. Die Entfernung gilt dauerhaft, auch für künftige Aktualisierungen."),
      "Über Fehler in OpenAlex selbst (falsche Werke im Profil, falsche Institution) kannst du auch OpenAlex informieren; dann profitieren alle Dienste, die OpenAlex nutzen.",
    ],
  ];

  const en: Block[] = [
    [
      "Where the data comes from",
      `Everything comes from OpenAlex, an open catalogue of scholarly works (licence CC0). The site uses all works from ${ds.meta.years[0]} to ${ds.meta.years[1]} where OpenAlex links at least one author to the ${inst}. Last retrieved: ${date}. The data is refreshed automatically every month.`,
      "Only public bibliographic information is shown: names, works, topics, co-authorships, ORCID and OpenAlex id. No contact details, no photos, no citation counts and no rankings.",
    ],
    [
      "How people are assigned to units",
      "OpenAlex knows the university but not its faculties, institutes or chairs. Themenkompass therefore reads the raw affiliation text authors print on their works (for example “Department of Economics, University of Oldenburg”) and matches it against patterns in a public configuration file. A person gets the units named most often in their works.",
      `Of ${fmt(q.authorships)} authorships from the university, ${fmt(q.authorshipsWithUnit)} (${pct(q.authorshipsWithUnit, q.authorships)}) name a recognisable unit and ${fmt(q.authorshipsWithFaculty)} (${pct(q.authorshipsWithFaculty, q.authorships)}) at least the faculty. Of ${fmt(q.persons)} listed people, ${fmt(bySource.affiliation ?? 0)} are assigned from the affiliation text, ${fmt(bySource.mapping ?? 0)} from the curated mapping file, ${fmt(bySource.faculty ?? 0)} to a faculty only and ${fmt(bySource.none ?? 0)} not at all.`,
      `People are listed if they have at least ${ds.meta.minWorks} works naming the university in the period. Someone who names it on a single work counts towards the topics but gets no page.`,
    ],
    [
      "Known sources of error",
      h(
        "ul",
        null,
        h("li", null, "Wrong link to the university: OpenAlex links raw affiliation text to institutions automatically. Now and then an organisation that is merely located in Oldenburg ends up at the university, for example a court, a DLR institute on the same street, or lists of several libraries on a conference volume."),
        h("li", null, "Missing works: not every work states an affiliation, and OpenAlex does not recognise every one that does. Book chapters, German-language publications, law, the humanities and cultural studies are covered less well than journal articles in the natural and life sciences."),
        h("li", null, "Split or merged profiles: OpenAlex identifies people algorithmically. One person can be spread over two profiles, or two people with similar names can share one. Ids in the mapping file are checked for merges on every update."),
        h("li", null, `Large author teams: in list responses OpenAlex returns at most 100 authors per work (${fmt(q.truncatedWorks)} works affected). Works with more than ${ds.meta.networkCap} authors do not count for co-authorships and the network.`),
        h("li", null, "Topics: OpenAlex assigns topics automatically from title, abstract and venue. They are often plausible, not always."),
        h("li", null, "Ambiguous text: clinics, clusters of excellence and research centres span faculties. They are assigned to a unit only when the text is unambiguous."),
      ),
    ],
    [
      "What is not covered",
      h(
        "ul",
        null,
        h("li", null, "Chairs and working groups, unless they are in the mapping file."),
        h("li", null, "Job openings, student assistant positions and thesis topics. The chairs' pages and the university's job portal cover those."),
        h("li", null, "Teaching, grants, committee work, transfer and anything not published as a work."),
        h("li", null, "Quality or importance of research. The number of works says nothing about it, which is why there are no rankings."),
      ),
    ],
    [
      "Sample check against people's own publication lists",
      "For a sample of 20 randomly chosen people, the works in Themenkompass were compared with the publication list on their own page.",
      validation,
    ],
    [
      "Report errors, request removal",
      h("p", null, "Report errors using the ", issues("correction.yml", "form on GitHub"), ". Corrections go into the mapping file or the configuration and apply from the next update. You get an answer within 14 days."),
      h("p", null, "If you do not want to be listed, file a ", issues("removal.yml", "removal request"), ". You will be removed without questions and without giving a reason, within 14 days at the latest: profile, name, and works where you are the only listed person from the university. The removal is permanent, including future updates."),
      "Errors in OpenAlex itself (wrong works in a profile, wrong institution) can also be reported to OpenAlex, which helps every service built on it.",
    ],
  ];

  const blocks = lang === "de" ? de : en;
  return h(
    "article",
    { class: "page prose" },
    h("h1", null, lang === "de" ? "Datenqualität und Grenzen" : "Data quality and limits"),
    blocks.map(([heading, ...body]) =>
      h("section", null, h("h2", null, heading), body.map((b) => (typeof b === "string" ? h("p", null, b) : b))),
    ),
  );
}

function validationBlock(v: Validation | null): HTMLElement {
  if (!v) {
    return h("p", { class: "note" }, lang === "de" ? "Die Stichprobe ist noch nicht ausgewertet." : "The sample has not been evaluated yet.");
  }
  const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, v.reference))} %`;
  return h(
    "div",
    null,
    h(
      "p",
      null,
      lang === "de"
        ? `Stand ${v.checkedAt}: ${v.people} Personen, ${v.reference} Werke in den eigenen Listen im Zeitraum. Davon im Themenkompass gefunden: ${v.found} (${pct(v.found)}), fehlend: ${v.missing} (${pct(v.missing)}). Werke im Themenkompass, die nicht zur Person gehören: ${v.wrong}.`
        : `As of ${v.checkedAt}: ${v.people} people, ${v.reference} works in their own lists within the period. Found in Themenkompass: ${v.found} (${pct(v.found)}), missing: ${v.missing} (${pct(v.missing)}). Works in Themenkompass that do not belong to the person: ${v.wrong}.`,
    ),
    h("ul", null, v.notes[lang].map((n) => h("li", null, n))),
  );
}
