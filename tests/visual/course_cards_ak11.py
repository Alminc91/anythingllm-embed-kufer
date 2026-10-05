#!/usr/bin/env python3
"""AK-11 (Soll, Reviewer): reale Trefferquote der Kurskarten.

Stellt 20 Kursfragen (10 Thema+Zeit aus testset_v2_praesentation.json,
10 Thema aus testset_thema_donau.json; Pipelines/Chat/Auswertung/HybridSearch/v2)
einzeln über den ECHTEN Embed-Stream (/api/embed/<id>/stream-chat, je Frage
eigene sessionId), nimmt Antworttext + courseSources aus dem Abschluss-Chunk,
berechnet die Karten mit derselben Funktion wie das Widget
(src/utils/courseCards.js -> selectCourseCards, per node) und rendert jede
Antwort einmal im gebauten Widget (Verlauf gemockt mit genau dieser Antwort)
als Screenshot. Ergebnis: Protokoll (JSON + Markdown) und Screenshots.

Voraussetzungen (sonst sinnlos):
  - Ziel-Container mit Fork-Image >= 7.9 (liefert courseSources)
  - Embed mit visual_config.courseCards = "auto" (Design Center)
  - npm run build (Screenshots nutzen dist/)

Erzeugt ECHTE Chats (Kontingent, Verlauf) -> nur mit Freigabe:

  EMBED_LIVE_TESTS=1 python3 tests/visual/course_cards_ak11.py \
      --base-api https://demo-inline.ki.kufer.de/api/embed \
      --embed-id f8423e6d-607e-42f6-9b41-6449eeb12bb9 \
      --page-host demo.ki.kufer.de

Kurskarten v2 (AK-8, Soll: >= 18 Antworten mit Kurslinks haben für JEDEN
verlinkten Kurs eine Karte; Fork >= 7.10 mit Nachschlag + Karten-Marker):

  EMBED_LIVE_TESTS=1 python3 tests/visual/course_cards_ak11.py \
      --base-api https://demo-inline.ki.kufer.de/api/embed \
      --embed-id f8423e6d-607e-42f6-9b41-6449eeb12bb9 \
      --page-host demo.ki.kufer.de --position above --out tests/visual/results/ak8

  Offline neu bewerten (keine Chats): --from-json <out>/ak11_protokoll.json

Spalte "AK-8": jede Kursseite, die die Antwort verlinkt (Link unter dem
Kurs-Pfad, z. B. /kurssuche/kurs/), hat eine Karte — unabhängig davon, ob
der Kurs unter den Treffern war. Der Stream wird mitprotokolliert: vorab
gesendete courseSources (Chunk "courseSources"), courseCardsAnnounced, Marker
roh im Text (Server < 7.10).

Auswertung: Spalte "auto" = maschinelle Vorprüfung (Karten-URLs == in der
Antwort verlinkte Kurs-URLs aus courseSources, Kompaktliste/Limit
berücksichtigt). Der Reviewer prüft die 5 markierten Stichproben anhand der
Screenshots (Karten genau zu den genannten Kursen?) und trägt das Ergebnis
in die Spalte "Reviewer" ein. Soll: >= 16 von 20 Antworten, die Kurse nennen.
"""

import argparse
import json
import os
import pathlib
import random
import re
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPO = ROOT.parents[1]  # .../KI_Apps_Pipelines
HS = REPO / "Pipelines" / "Chat" / "Auswertung" / "HybridSearch" / "v2"
DEFAULT_OUT = ROOT / "tests" / "visual" / "results" / "ak11"

THEMA_ZEIT = [  # testset_v2_praesentation.json (Zeit/Thema, Ziele vorhanden)
    "Z3_thema_zeit-01", "Z3_thema_zeit-03", "Z3_thema_zeit-04", "Z3_thema_zeit-05", "Z3_thema_zeit-07",
    "Z3_thema_zeit-08", "Z3_thema_zeit-09", "Z3_thema_zeit-10", "Z3_thema_zeit-11", "Z3_thema_zeit-12",
]
THEMA = [  # testset_thema_donau.json (ein Satz je Thema)
    "T_thema-02", "T_thema-03", "T_thema-05", "T_thema-07", "T_thema-09",
    "T_thema-12", "T_thema-14", "T_thema-16", "T_thema-17", "T_thema-21",
]


def load_questions():
    v2 = {q["id"]: q for q in json.loads((HS / "testset_v2_praesentation.json").read_text())}
    th = {q["id"]: q for q in json.loads((HS / "testset_thema_donau.json").read_text())}
    return [v2[i] for i in THEMA_ZEIT] + [th[i] for i in THEMA]


def ask(base_api, embed_id, question, timeout=180):
    """Eine Frage über den Embed-Stream; liefert Text, courseSources, Dauer."""
    session = str(uuid.uuid4())
    body = json.dumps({"message": question, "sessionId": session, "conversationId": session}).encode()
    req = urllib.request.Request(f"{base_api}/{embed_id}/stream-chat", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
    t0 = time.time()
    text, course_sources, error, chat_id = "", None, None, None
    announced, early_at, first_text_at = 0, None, None
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            try:
                ev = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
            if ev.get("type") in ("textResponseChunk", "textResponse"):
                if ev.get("textResponse") and first_text_at is None:
                    first_text_at = round(time.time() - t0, 2)
                text += ev.get("textResponse") or ""
            if ev.get("type") == "courseSources" and isinstance(ev.get("courseSources"), list):
                course_sources = ev["courseSources"]
                announced = len(ev["courseSources"])
                early_at = round(time.time() - t0, 2)
            if ev.get("type") == "abort":
                error = ev.get("error")
            if ev.get("type") == "finalizeResponseStream":
                chat_id = ev.get("chatId")
                if isinstance(ev.get("courseSources"), list):
                    course_sources = ev["courseSources"]
                if isinstance(ev.get("courseCardsAnnounced"), int):
                    announced = ev["courseCardsAnnounced"]
    return {"session": session, "text": text, "courseSources": course_sources, "error": error,
            "chatId": chat_id, "seconds": round(time.time() - t0, 1),
            "courseCardsAnnounced": announced, "earlyCardsAt": early_at, "firstTextAt": first_text_at,
            "markerRaw": text.lstrip().startswith("[[KARTEN")}


SELECT_JS = r"""
import { selectCourseCards, selectAnnouncedCourseCards, stripCardsMarker, extractLinks, normalizeUrl } from "%s";
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const items = JSON.parse(input);
  const out = items.map(({ text: raw, courseSources, pageHost, position, announced }) => {
    const text = stripCardsMarker(raw || "");
    const settings = { courseCards: "auto" };
    const sel = position === "above"
      ? selectAnnouncedCourseCards(text, courseSources || [], settings, { pageHost, announced: announced || 0 })
      : selectCourseCards(text, courseSources || [], settings, { pageHost });
    const srcKeys = new Map((courseSources || []).map((c) => [normalizeUrl(c.url), c.url]));
    const links = [...new Set(extractLinks(text).map((l) => normalizeUrl(l.url)).filter(Boolean))];
    const linked = links.filter((k) => srcKeys.has(k));
    return { ...sel, linkedCourseKeys: linked, allLinkKeys: links, cardKeys: sel.cards.map((c) => c.key) };
  });
  process.stdout.write(JSON.stringify(out));
});
"""


def select_cards(items):
    js = SELECT_JS % (ROOT / "src" / "utils" / "courseCards.js").as_uri()
    res = subprocess.run(["node", "--input-type=module", "-e", js], input=json.dumps(items),
                         capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


# Kurslinks in der Antwort, die NICHT in courseSources stehen (Retrieval-Lücke,
# z. B. Kurs aus dem Verlauf/Backfill) -> zählen nicht gegen die Karten
COURSE_LINK_RX = re.compile(r"\]\((https?://[^)\s]+/kurs/[^)\s]+)\)")


def auto_verdict(r, sel):
    linked = set(sel["linkedCourseKeys"])
    cards = set(sel["cardKeys"])
    names_courses = bool(linked) or bool(cards) or bool(COURSE_LINK_RX.search(r["text"]))
    if not names_courses:
        return names_courses, None, "keine Kurse genannt"
    if r["courseSources"] is None:
        return names_courses, False, "kein courseSources im Abschluss-Chunk (Image < 7.9 oder Option aus)"
    limit = 10 if sel["compact"] else 5
    if not linked:
        ok = bool(cards)  # nur Titel-Treffer -> Reviewer prüft
    elif len(linked) <= limit:
        ok = linked <= cards  # jeder verlinkte Kurs hat eine Karte (Titel-Treffer dürfen dazukommen)
    else:
        ok = len(cards) == limit
    note = f"verlinkt {len(linked)}, Karten {len(cards)}" + (" (Kompaktliste)" if sel["compact"] else "")
    missing = COURSE_LINK_RX.findall(r["text"])
    if missing and not linked:
        note += f"; {len(missing)} Kurslink(s) ohne courseSources-Eintrag"
    return names_courses, ok, note


# AK-8: Kursseiten-Links (Kurs-Pfad mit Slug + Kursnummer) in der Antwort
COURSE_PAGE_RX = re.compile(r"/(kurs|kurssuche/kurs|kursdetails/kurs|veranstaltungssuche/kurs)/[^/]+/[^/?#]*\d")


COURSE_CARDS_MAX = 5  # wie src/utils/courseCards.js


def ak8_verdict(sel):
    """Jede verlinkte Kursseite hat eine Karte (Kompaktliste zählt mit).

    Über dem Kartenlimit (5 Karten, `above` kappt ohne Kompaktliste) gelten
    Links als abgedeckt, wenn „weitere Kurse im Programm“ erscheint
    (`more` > 0) — höchstens so viele, wie `more` zählt.
    """
    course_links = [k for k in sel["allLinkKeys"] if COURSE_PAGE_RX.search("/" + k.split("/", 1)[-1])]
    if not course_links:
        return None, "keine Kurslinks"
    cards = set(sel["cardKeys"])
    missing = [k for k in course_links if k not in cards]
    more = sel.get("more") or 0
    covered = []
    if missing and more > 0 and len(cards) >= COURSE_CARDS_MAX:
        covered, missing = missing[:more], missing[more:]
    note = f"Kurslinks {len(course_links)}, Karten {len(cards)}"
    if covered:
        note += f"; {len(covered)} über dem Kartenlimit (weitere Kurse)"
    if missing:
        note += "; ohne Karte: " + ", ".join(m.rsplit("/", 2)[-2] for m in missing)
    return not missing, note


def screenshots(results, out_dir, dist, page_host, position="below"):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import theme_visual as tv  # noqa: E402
    from playwright.sync_api import sync_playwright  # noqa: E402

    srv, base_url = tv.start_server(dist)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for r in results:
                hist = [
                    {"role": "user", "content": r["q"], "sentAt": tv.SENT_AT},
                    {"role": "assistant", "content": r["text"], "sentAt": tv.SENT_AT + 5, "chatId": 1,
                     "feedbackScore": None, "sources": [], "courseSources": r["courseSources"] or [],
                     "courseCardsAnnounced": r.get("courseCardsAnnounced") or 0},
                ]
                m = tv.Mock(config={}, history=hist)
                ctx, page = tv.open_page(browser, base_url, {"attrs": {**tv.BASE_ATTRS, "open-on-load": "on",
                                                                       "course-cards": "auto",
                                                                       "course-cards-position": position}},
                                         m, viewport={"width": 520, "height": 1400})
                try:
                    tv.wait_shadow(page, ".allm-anything-llm-assistant-message")
                    tv.settle(page, 500)
                    shot = out_dir / f"{r['id']}.png"
                    page.screenshot(path=str(shot), full_page=True)
                    r["screenshot"] = shot.name
                finally:
                    ctx.close()
            browser.close()
    finally:
        srv.shutdown()


def write_report(results, out_dir, args, sample_ids):
    rows = []
    naming = [r for r in results if r["names_courses"]]
    ok = [r for r in naming if r["auto_ok"]]
    with_links = [r for r in results if r.get("ak8_ok") is not None]
    ak8_ok = [r for r in with_links if r["ak8_ok"]]
    marker_raw = sum(1 for r in results if r.get("markerRaw"))
    early = [r for r in results if r.get("earlyCardsAt") is not None]
    for r in results:
        rows.append(
            f"| {r['id']} | {r['q']} | {'ja' if r['names_courses'] else 'nein'} | "
            f"{len(r['courseSources'] or [])} | {len(r['cards'])}{' (kompakt)' if r['compact'] else ''} | "
            f"{'–' if r['auto_ok'] is None else ('ok' if r['auto_ok'] else 'FEHLT')} | {r['auto_note']} | "
            f"{'–' if r.get('ak8_ok') is None else ('ok' if r['ak8_ok'] else 'FEHLT')} | {r.get('ak8_note', '')} | "
            f"{r.get('courseCardsAnnounced') or 0} | "
            f"{'**Stichprobe**' if r['id'] in sample_ids else ''} | {r.get('screenshot', '')} |  |"
        )
    md = [
        "# AK-11 Kurskarten — Protokoll",
        "",
        f"Ziel: `{args.base_api}` Embed `{args.embed_id}`, Seiten-Host `{args.page_host}`, "
        f"{time.strftime('%d.%m.%Y %H:%M')}",
        "",
        f"Antworten, die Kurse nennen: **{len(naming)}** von {len(results)}; davon maschinell passend: "
        f"**{len(ok)}** (Soll ≥ 16). Reviewer-Stichprobe (5): {', '.join(sample_ids)}",
        "",
        f"**AK-8** (jeder verlinkte Kurs hat eine Karte): **{len(ak8_ok)}** von {len(with_links)} Antworten mit "
        f"Kurslinks (Soll ≥ 18). Position `{args.position}`; vorab angekündigte Karten in {len(early)} Antworten; "
        f"Marker roh im Stream (Server < 7.10): {marker_raw}.",
        "",
        "| ID | Frage | nennt Kurse | courseSources | Karten | auto | Hinweis | AK-8 | AK-8 Hinweis | angekündigt | Stichprobe | Screenshot | Reviewer |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        *rows,
        "",
        "## Antworten",
        "",
    ]
    for r in results:
        md += [f"### {r['id']} — {r['q']}", "", "```", r["text"].strip(), "```", "",
               "Karten: " + ("; ".join(f"{c['title']} ({c['url']})" for c in r["cards"]) or "keine")
               + (f" · Abschlusslink: {r['categoryLink']['text']} ({r['categoryLink']['url']})" if r["categoryLink"] else ""),
               ""]
    (out_dir / "ak11_protokoll.md").write_text("\n".join(md))
    (out_dir / "ak11_protokoll.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(f"\nAntworten mit Kursen: {len(naming)}/{len(results)}, maschinell passend: {len(ok)} (Soll >= 16)")
    print(f"AK-8: {len(ak8_ok)}/{len(with_links)} Antworten mit Kurslinks haben für jeden Link eine Karte (Soll >= 18)")
    print(f"Protokoll: {out_dir / 'ak11_protokoll.md'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-api", default="https://praesentation.ki.kufer.de/api/embed")
    ap.add_argument("--embed-id", default="78eda2c6-5bd0-44b5-b097-30d694a56677")
    ap.add_argument("--page-host", default="demo.ki.kufer.de", help="Host der Webseite (Domainregel der Karten)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--no-screenshots", action="store_true")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--position", choices=["below", "above"], default="below",
                    help="Kurskarten-Position wie data-course-cards-position (Auswahl + Screenshots)")
    ap.add_argument("--from-json", help="vorhandenes ak11_protokoll.json offline neu bewerten (keine Chats)")
    args = ap.parse_args()

    out_dir = pathlib.Path(args.out)
    if args.from_json:
        out_dir.mkdir(parents=True, exist_ok=True)
        results = json.loads(pathlib.Path(args.from_json).read_text())
        return evaluate(results, out_dir, args)

    if os.environ.get("EMBED_LIVE_TESTS") != "1":
        print("Abbruch: erzeugt echte Chats (Kontingent, Verlauf). Nur mit EMBED_LIVE_TESTS=1 starten.")
        return 2

    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for q in load_questions()[: args.limit]:
        try:
            r = ask(args.base_api, args.embed_id, q["q"])
        except Exception as e:  # noqa: BLE001
            r = {"text": "", "courseSources": None, "error": str(e), "seconds": None, "session": None, "chatId": None}
        r.update({"id": q["id"], "q": q["q"], "targets": q.get("targets", [])})
        results.append(r)
        print(f"{q['id']}: {len(r['text'])} Zeichen, courseSources "
              f"{'—' if r['courseSources'] is None else len(r['courseSources'])}, {r['seconds']} s"
              + (f", Fehler {r['error']}" if r["error"] else ""), flush=True)

    return evaluate(results, out_dir, args)


def evaluate(results, out_dir, args):
    sel = select_cards([{"text": r["text"], "courseSources": r["courseSources"], "pageHost": args.page_host,
                         "position": args.position, "announced": r.get("courseCardsAnnounced") or 0}
                        for r in results])
    for r, s in zip(results, sel):
        r.update({"cards": s["cards"], "compact": s["compact"], "categoryLink": s["categoryLink"], "more": s["more"]})
        r["names_courses"], r["auto_ok"], r["auto_note"] = auto_verdict(r, s)
        r["ak8_ok"], r["ak8_note"] = ak8_verdict(s)

    if all(r["courseSources"] is None for r in results):
        print("WARNUNG: keine Antwort mit courseSources — Image < 7.9 oder visual_config.courseCards nicht 'auto'.")

    naming = [r["id"] for r in results if r["names_courses"]]
    sample_ids = sorted(random.Random(args.seed).sample(naming, min(5, len(naming))))
    if not args.no_screenshots:
        screenshots(results, out_dir, args.dist, args.page_host, args.position)
    write_report(results, out_dir, args, sample_ids)
    return 0


if __name__ == "__main__":
    sys.exit(main())
