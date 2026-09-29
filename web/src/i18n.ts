import type { Lang, Localized } from "./data";

const STORAGE_KEY = "tk-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "de";
}

export let lang: Lang = initialLang();

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
}

export function loc(value: Localized): string {
  return value[lang];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const de = {
  skip: "Zum Inhalt springen",
  navTopics: "Themen",
  navNetwork: "Netzwerk",
  navQuality: "Datenqualität und Grenzen",
  navSearch: "Suche",
  langSwitch: "English",
  langSwitchLabel: "Switch to English",
  themeAuto: "Farbschema: automatisch",
  themeLight: "Farbschema: hell",
  themeDark: "Farbschema: dunkel",
  loading: "Daten werden geladen …",
  loadError: "Die Daten konnten nicht geladen werden. Lade die Seite neu; wenn es dann nicht klappt, melde es bitte auf GitHub.",
  heroLead: "Wer forscht an der",
  heroTo: "zu",
  heroPlaceholder: "Thema, Name oder Stichwort",
  heroSubmit: "Suchen",
  heroFacts: (works: string, persons: string, from: number, to: number) =>
    `${works} Werke von ${persons} Personen aus den Jahren ${from} bis ${to}, zusammengestellt aus OpenAlex. Personen werden nicht nach Zitationen oder Output sortiert.`,
  heroLimits: "Was die Daten können und was nicht",
  browseTitle: "Nach Fakultät stöbern",
  browseIntro: "Wähle deine Fakultät, dann das Institut oder Department. Dort findest du alle aufgeführten Personen und ihre Themen.",
  facultyFacts: (people: string, works: string) => `${people} Personen, ${works} Werke`,
  suggestTopics: "Themen",
  suggestPeople: "Personen",
  suggestAll: (q: string) => `Alle Ergebnisse für „${q}“`,
  filterFaculty: "Fakultät",
  filterUnit: "Einrichtung",
  filterAll: "Alle",
  filterFrom: "Von",
  filterTo: "Bis",
  mapTitle: "Themenkarte",
  mapIntro:
    "Jedes Werk zählt einmal, unter seinem Hauptthema nach OpenAlex. Klappe ein Feld auf, um Teilfelder und Themen zu sehen.",
  mapEmpty: "Für diese Auswahl gibt es keine Werke. Erweitere den Zeitraum oder wähle eine andere Einrichtung.",
  works: (n: number) => plural(n, "Werk", "Werke"),
  worksCount: (n: string, raw: number) => `${n} ${plural(raw, "Werk", "Werke")}`,
  trend: { up: "wachsend", down: "rückläufig", stable: "gleichbleibend", few: "zu wenige Werke für einen Trend" },
  trendExplain:
    "Trend: letzte drei abgeschlossene Jahre im Vergleich zu den drei Jahren davor (ab ±25 %).",
  runningYear: "laufendes Jahr, unvollständig",
  sparkLabel: (from: number, to: number) => `Werke pro Jahr, ${from} bis ${to}`,
  topicsIn: "Themen",
  topicKicker: "Thema",
  topicNameNote: "Themennamen stammen aus der englischsprachigen OpenAlex-Klassifikation.",
  perYear: "Werke pro Jahr",
  whoResearches: "Wer dazu veröffentlicht",
  whoResearchesNote: "Alphabetisch. Die Zahl nennt gemeinsame Werke mit diesem Thema, sie ist keine Bewertung.",
  whereTitle: "Wo an der Universität",
  whereNote: "Einrichtungen der Personen, die zu diesem Thema veröffentlichen.",
  relatedTitle: "Verwandte Themen",
  relatedNote: (subfield: string) => `Weitere Themen aus dem Teilfeld „${subfield}“ an der Universität.`,
  peopleShort: (n: number) => `${n} ${plural(n, "Person", "Personen")}`,
  personFacts: (works: number, from: number, recent: number, years: number) =>
    `${works} ${plural(works, "Werk", "Werke")} seit ${from}, davon ${recent} in den letzten ${years} Jahren.`,
  onThisPage: "Auf dieser Seite",
  recentWorks: (n: number) => `Werke der letzten ${n} Jahre`,
  noRecent: "Keine Werke in diesem Zeitraum.",
  moreWorks: (n: number) => `${n} weitere anzeigen`,
  openNetwork: "Im Netzwerk ansehen",
  onOpenAlex: "Auf OpenAlex ansehen",
  filterPeople: "Namen filtern",
  unitSource: {
    affiliation: (n: number, total: number) =>
      `Zuordnung aus den Zugehörigkeitsangaben in ${n} von ${total} Werken.`,
    mapping: () => "Zuordnung aus der gepflegten Zuordnungsdatei.",
    faculty: () => "Aus den Angaben ist nur die Fakultät erkennbar.",
    none: () => "Aus den Angaben ist keine Einrichtung erkennbar.",
  },
  chair: "Lehrstuhl oder Arbeitsgruppe",
  activity: { active: "aktiv", quiet: "zuletzt weniger aktiv", inactive: "seit Längerem kein Werk" },
  activityLine: (year: number) => `Letztes Werk mit Angabe der Universität: ${year}`,
  activityExplain:
    "Aktiv heißt: ein Werk in den letzten zwei Jahren. Das sagt nichts über Qualität und nicht, ob jemand noch an der Universität ist.",
  personTopics: "Themen",
  personTopicsNote: "Aus bis zu drei Themen je Werk.",
  coauthors: "Häufige Ko-Autor:innen an der Universität",
  coauthorsNote: (cap: number) => `Nur Werke mit höchstens ${cap} Autor:innen.`,
  sharedWorks: (n: number) => `${n} ${plural(n, "gemeinsames Werk", "gemeinsame Werke")}`,
  partners: "Häufige externe Partnerinstitutionen",
  noCoauthors: "Keine Ko-Autor:innen in der Auswahl.",
  profiles: "Profile",
  wrongTitle: "Stimmt etwas nicht?",
  wrongText:
    "Fehlen Werke, sind welche falsch zugeordnet oder stimmt die Einrichtung nicht? Melde es, dann korrigieren wir die Zuordnung.",
  reportError: "Fehler melden",
  removeText:
    "Du möchtest hier nicht genannt werden? Wir entfernen dich ohne Rückfragen, spätestens mit der nächsten Aktualisierung.",
  removeLink: "Entfernung beantragen",
  noContact: "Kontaktdaten zeigt der Themenkompass bewusst nicht. Sie stehen auf den Seiten der Universität.",
  unitKicker: "Einrichtung",
  facultyKicker: "Fakultät",
  unitPeople: "Personen",
  peopleCount: (n: string, raw: number) => `${n} ${plural(raw, "Person", "Personen")}`,
  unitPeopleNote: (min: number) =>
    `Alphabetisch. Aufgeführt ist, wer mindestens ${min} Werke im Zeitraum hat oder in der Zuordnungsdatei steht.`,
  unitTopics: "Häufigste Themen",
  searchTitle: "Suche",
  searchLabel: "Suchbegriff",
  searchHint: "Suche nach Thema, Name, Werktitel oder Zeitschrift. Tippfehler werden toleriert.",
  searchNone: (q: string) => `Keine Treffer für „${q}“. Versuche einen englischen Begriff; die Themen heißen in OpenAlex englisch.`,
  searchCount: (n: number) => `${n} ${plural(n, "Treffer", "Treffer")}`,
  resultsTopics: "Themen",
  resultsPeople: "Personen",
  resultsWorks: "Werke",
  networkTitle: "Ko-Autor:innen-Netzwerk",
  networkIntro:
    "Punkte sind Personen, Linien gemeinsame Werke in der Auswahl. Mit „Externe Institutionen“ erscheinen Partner außerhalb der Universität als Quadrate.",
  networkField: "Fach (OpenAlex-Feld)",
  networkSubfield: "Teilfeld",
  networkExternal: "Externe Institutionen zeigen",
  networkMin: "Mindestens gemeinsame Werke",
  networkStats: (people: number, inst: number, edges: number, works: number) =>
    `${people} Personen, ${inst} externe Institutionen, ${edges} Verbindungen aus ${works} Werken.`,
  networkTooBig: (n: number) =>
    `Die Auswahl ergibt ${n} Knoten; das wäre unlesbar. Wähle eine Fakultät, eine Einrichtung oder ein Fach.`,
  networkEmpty: "In dieser Auswahl gibt es keine gemeinsamen Werke.",
  networkTable: "Verbindungen als Tabelle",
  networkSelectHint: "Wähle einen Punkt, um Details zu sehen.",
  networkLoading: "Netzwerk wird berechnet …",
  colPerson: "Person",
  colPartner: "Verbunden mit",
  colWorks: "Gemeinsame Werke",
  personLink: "Zur Personenseite",
  legendPerson: "Person der Universität",
  legendInstitution: "Externe Institution",
  footData: "Daten: OpenAlex (CC0)",
  footUpdated: (date: string) => `Stand der Daten: ${date}`,
  footCode: "Quellcode (MIT)",
  footQuality: "Datenqualität und Grenzen",
  footLegal: "Impressum und Datenschutz",
  notFound: "Diese Seite gibt es nicht. Vielleicht wurde der Eintrag entfernt oder die ID hat sich geändert.",
  backHome: "Zur Startseite",
  typeLabels: {
    article: "Artikel",
    "book-chapter": "Buchkapitel",
    book: "Buch",
    "conference-paper": "Konferenzbeitrag",
    preprint: "Preprint",
    review: "Übersichtsartikel",
    report: "Bericht",
    dissertation: "Dissertation",
    "data-paper": "Datenpublikation",
    letter: "Kurzbeitrag",
  } as Record<string, string>,
  truncated: "Autorenliste bei OpenAlex gekürzt",
};

type Dict = typeof de;

const en: Dict = {
  skip: "Skip to content",
  navTopics: "Topics",
  navNetwork: "Network",
  navQuality: "Data quality and limits",
  navSearch: "Search",
  langSwitch: "Deutsch",
  langSwitchLabel: "Auf Deutsch umschalten",
  themeAuto: "Colour scheme: automatic",
  themeLight: "Colour scheme: light",
  themeDark: "Colour scheme: dark",
  loading: "Loading data …",
  loadError: "The data could not be loaded. Reload the page; if that does not help, please report it on GitHub.",
  heroLead: "Who at the",
  heroTo: "works on",
  heroPlaceholder: "topic, name or keyword",
  heroSubmit: "Search",
  heroFacts: (works, persons, from, to) =>
    `${works} works by ${persons} people from ${from} to ${to}, compiled from OpenAlex. People are never sorted by citations or output.`,
  heroLimits: "What the data can and cannot tell you",
  browseTitle: "Browse by faculty",
  browseIntro: "Pick your faculty, then the institute or department. There you find everyone listed and their topics.",
  facultyFacts: (people, works) => `${people} people, ${works} works`,
  suggestTopics: "Topics",
  suggestPeople: "People",
  suggestAll: (q) => `All results for “${q}”`,
  filterFaculty: "Faculty",
  filterUnit: "Unit",
  filterAll: "All",
  filterFrom: "From",
  filterTo: "To",
  mapTitle: "Topic map",
  mapIntro:
    "Each work counts once, under its primary OpenAlex topic. Open a field to see its subfields and topics.",
  mapEmpty: "There are no works for this selection. Widen the period or choose another unit.",
  works: (n) => plural(n, "work", "works"),
  worksCount: (n, raw) => `${n} ${plural(raw, "work", "works")}`,
  trend: { up: "growing", down: "declining", stable: "steady", few: "too few works for a trend" },
  trendExplain: "Trend: last three complete years compared with the three years before (from ±25 %).",
  runningYear: "current year, incomplete",
  sparkLabel: (from, to) => `Works per year, ${from} to ${to}`,
  topicsIn: "Topics",
  topicKicker: "Topic",
  topicNameNote: "Topic names come from the English OpenAlex classification.",
  perYear: "Works per year",
  whoResearches: "Who publishes on this",
  whoResearchesNote: "Alphabetical. The number counts works on this topic; it is not a rating.",
  whereTitle: "Where at the university",
  whereNote: "Units of the people who publish on this topic.",
  relatedTitle: "Related topics",
  relatedNote: (subfield) => `Other topics from the subfield “${subfield}” at the university.`,
  peopleShort: (n) => `${n} ${plural(n, "person", "people")}`,
  personFacts: (works, from, recent, years) =>
    `${works} ${plural(works, "work", "works")} since ${from}, ${recent} of them in the last ${years} years.`,
  onThisPage: "On this page",
  recentWorks: (n) => `Works from the last ${n} years`,
  noRecent: "No works in this period.",
  moreWorks: (n) => `Show ${n} more`,
  openNetwork: "View in the network",
  onOpenAlex: "View on OpenAlex",
  filterPeople: "Filter names",
  unitSource: {
    affiliation: (n, total) => `Assigned from the affiliation text in ${n} of ${total} works.`,
    mapping: () => "Assigned from the curated mapping file.",
    faculty: () => "Only the faculty can be recognised from the affiliation text.",
    none: () => "No unit can be recognised from the affiliation text.",
  },
  chair: "Chair or working group",
  activity: { active: "active", quiet: "less active recently", inactive: "no recent work" },
  activityLine: (year) => `Latest work listing the university: ${year}`,
  activityExplain:
    "Active means: a work in the last two years. It says nothing about quality, nor whether someone is still at the university.",
  personTopics: "Topics",
  personTopicsNote: "From up to three topics per work.",
  coauthors: "Frequent co-authors at the university",
  coauthorsNote: (cap) => `Only works with at most ${cap} authors.`,
  sharedWorks: (n) => `${n} shared ${plural(n, "work", "works")}`,
  partners: "Frequent external partner institutions",
  noCoauthors: "No co-authors in this selection.",
  profiles: "Profiles",
  wrongTitle: "Something wrong?",
  wrongText:
    "Missing works, works that are not yours, or the wrong unit? Report it and the assignment will be corrected.",
  reportError: "Report an error",
  removeText:
    "You do not want to be listed here? You will be removed without questions, at the latest with the next update.",
  removeLink: "Request removal",
  noContact: "Themenkompass deliberately shows no contact details. You find them on the university's pages.",
  unitKicker: "Unit",
  facultyKicker: "Faculty",
  unitPeople: "People",
  peopleCount: (n, raw) => `${n} ${plural(raw, "person", "people")}`,
  unitPeopleNote: (min) =>
    `Alphabetical. Listed are people with at least ${min} works in the period or an entry in the mapping file.`,
  unitTopics: "Most frequent topics",
  searchTitle: "Search",
  searchLabel: "Search term",
  searchHint: "Search for a topic, name, work title or journal. Typos are tolerated.",
  searchNone: (q) => `No results for “${q}”. Try another spelling or a broader term.`,
  searchCount: (n) => `${n} ${plural(n, "result", "results")}`,
  resultsTopics: "Topics",
  resultsPeople: "People",
  resultsWorks: "Works",
  networkTitle: "Co-author network",
  networkIntro:
    "Dots are people, lines are shared works in the selection. With “external institutions”, partners outside the university appear as squares.",
  networkField: "Discipline (OpenAlex field)",
  networkSubfield: "Subfield",
  networkExternal: "Show external institutions",
  networkMin: "Minimum shared works",
  networkStats: (people, inst, edges, works) =>
    `${people} people, ${inst} external institutions, ${edges} links from ${works} works.`,
  networkTooBig: (n) => `This selection has ${n} nodes, too many to read. Choose a faculty, a unit or a discipline.`,
  networkEmpty: "There are no shared works in this selection.",
  networkTable: "Links as a table",
  networkSelectHint: "Select a dot to see details.",
  networkLoading: "Computing the network …",
  colPerson: "Person",
  colPartner: "Linked to",
  colWorks: "Shared works",
  personLink: "Open profile",
  legendPerson: "Person at the university",
  legendInstitution: "External institution",
  footData: "Data: OpenAlex (CC0)",
  footUpdated: (date) => `Data as of ${date}`,
  footCode: "Source code (MIT)",
  footQuality: "Data quality and limits",
  footLegal: "Legal notice and privacy",
  notFound: "This page does not exist. The entry may have been removed or its id may have changed.",
  backHome: "Back to the start page",
  typeLabels: {
    article: "Article",
    "book-chapter": "Book chapter",
    book: "Book",
    "conference-paper": "Conference paper",
    preprint: "Preprint",
    review: "Review",
    report: "Report",
    dissertation: "Dissertation",
    "data-paper": "Data paper",
    letter: "Letter",
  },
  truncated: "author list truncated by OpenAlex",
};

export function t(): Dict {
  return lang === "de" ? de : en;
}
