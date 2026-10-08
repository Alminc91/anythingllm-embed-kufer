#!/usr/bin/env python3
"""Playwright-Tests: Kurskarten unter Antworten (data-course-cards="auto").

Einrichtung wie tests/visual/theme_visual.py (requirements.txt + chromium).

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenzen der Bestandszustände (Option aus) vom UNVERÄNDERTEN Build
  #    (main), nur fehlende Dateien — bestehende werden nie überschrieben
  python3 tests/visual/course_cards.py --baseline --dist /pfad/zum/main/dist

  # 2) Referenzen der NEUEN Zustände (Karten) aus diesem Branch
  python3 tests/visual/course_cards.py --baseline --new-states

  # 3) Prüfen (npm run build vorher)
  python3 tests/visual/course_cards.py

Alle Aufrufe an praesentation werden gemockt (Config, Status, Verlauf,
stream-chat). Der Abschluss-Chunk (finalizeResponseStream) trägt
courseSources wie der Fork ab Image 7.9 — echte Kurs-Metadaten von
praesentation (tests/fixtures/praesentationCourseSources.json). Für AK-8 wird
der Stream mit echten Pausen zwischen den Chunks ausgeliefert (fetch-Ersatz
nur in der Testseite) und das Einfügen der Karten per MutationObserver
protokolliert.

Kurskarten v2 (courseCardsPosition "above", Karten-Marker): Zustände
cc-above-* (Karten über der Antwort; Server kündigt Kurse vorab per Chunk
type "courseSources" an), AK-4b (Karten vor dem ersten Text-Token, genau eine
Einfügung, keine Verschiebung), AK-4c (ganze Karte klickbar, Tab/Enter) und
die Widget-Abwehr gegen einen durchgereichten Marker "[[KARTEN: …]]".
Schlanke Fallback-Karte: Zustand cc-fallback (Kurslink ohne courseSources-
Eintrag -> Karte nur mit Titel) + DOM-Prüfung below/above.

Getrennte Rundung (--allm-radius-card): Zustand cc-radius-card (Panel 40 px,
Karten 14 px, Blasen 18 px) + Messung mit/ohne --allm-radius-card.

Kurskarten v3 (Fork >= 7.13): Dauer/Ort aus den Kopfzeilen (sessions/venue)
und KI-Teaser je Karte (Chunk type "courseTeasers"): Zustände cc-v3-meta
(Kopf-/Metazeile), cc-v3-teaser und cc-v3-teaser-mobile (Untertext, bis zu
3 Zeilen, Klammer nur als letzter Ausweg) + DOM-Prüfung check_v3 (Teaser kommt nach den Karten,
Karten bleiben stehen, Verlauf-Reload, Teaserzeilen eines älteren Servers nie
sichtbar). Nur die neuen Zustände gezielt erzeugen:
  python3 tests/visual/course_cards.py --baseline --new-states \
      --only cc-v3-meta cc-v3-teaser cc-v3-teaser-mobile

Zeilen-Karten (courseCardsLayout "rows") und Teaser-Platzhalter (Issue
embed-zeilenkarten-tasten-morph-datenschutz): Zustände cc-rows-light/-dark
(Zeilen-Karten, Kartenbreite 700 px), cc-rows-mobile (390 px: Rasterkarte
einspaltig), cc-teaser-pending / cc-rows-pending (Platzhalter, Stream wartet
auf die Teaser) + DOM-Prüfungen check_rows (AK-1, AK-3), rows-teaser-fit
(AK-2) und teaser-pending-height (AK-4: Kartenhöhe vor/nach dem Teaser).
  python3 tests/visual/course_cards.py --baseline --new-states \
      --only cc-rows-light cc-rows-dark cc-rows-mobile cc-teaser-pending cc-rows-pending

Ergebnisse: tests/visual/results/course-cards-*.png, summary-course-cards.json.
"""

import argparse
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BASELINE_DIR = tv.BASELINE_DIR
RESULTS_DIR = tv.RESULTS_DIR
record = tv.record

FIX = json.loads((ROOT / "tests" / "fixtures" / "praesentationCourseSources.json").read_text())
BY = FIX["bergischYoga"]  # 12 Kurse, Bergisch-Land-Klon (Ort/Bezirk gefüllt)
CATEGORY_URL = "https://www.vhs-bergisch-land.de/kurse/umwelt-und-gesundheit"


def md(c, text=None):
    return f"[{text or c['title']}]({c['url']})"


QUESTION = "Gibt es Yogakurse am Abend?"
THREE = [BY[0], BY[6], BY[9]]  # Hatha Yoga, Kundalini-Yoga, Entspannt ins Wochenende
ANSWER_3 = (
    "Ja, am Abend gibt es zum Beispiel:\n\n"
    f"- {md(BY[0])} donnerstags um 18:30 Uhr in Leichlingen\n"
    f"- {md(BY[6])} mittwochs um 19:15 Uhr in Burscheid\n"
    f"- {md(BY[9])} freitags um 18:00 Uhr in Burscheid\n\n"
    f"Alle Angebote finden Sie unter [Umwelt und Gesundheit]({CATEGORY_URL})."
)
ANSWER_8 = "Wir haben mehrere passende Yogakurse:\n\n" + "\n".join(f"- {md(c)}" for c in BY[:8])
ANSWER_Q = "Meinen Sie Yoga für Anfänger oder eher Kurse für Fortgeschrittene?"
# Fallback-Karte: zweiter Kurslink hat keinen courseSources-Eintrag (Server hat
# den Kurs nicht gefunden) -> Karte nur mit Titel
FALLBACK_URL = "https://www.vhs-bergisch-land.de/kurssuche/kurs/yin-yoga-am-abend/26266299"
FALLBACK_TITLE = "Yin Yoga am Abend"
ANSWER_FB = (
    "Ja, am Abend gibt es zum Beispiel:\n\n"
    f"- {md(BY[0])} donnerstags um 18:30 Uhr in Leichlingen\n"
    f"- [**{FALLBACK_TITLE}**]({FALLBACK_URL}) dienstags in Burscheid\n"
    f"- {md(BY[6])} mittwochs um 19:15 Uhr in Burscheid"
)


def stream_events(answer, course_sources=BY, uuid="u-1", parts=3):
    """Antwort in mehreren Chunks + Abschluss-Chunk mit courseSources."""
    size = max(1, len(answer) // parts + 1)
    chunks = [answer[i : i + size] for i in range(0, len(answer), size)]
    ev = [
        {"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": c}
        for c in chunks
    ]
    ev[-1]["close"] = True
    final = {"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712}
    if course_sources is not None:
        final["courseSources"] = course_sources
    return ev + [final]


def history(answer, course_sources=BY):
    msg = {
        "role": "assistant",
        "content": answer,
        "sentAt": tv.SENT_AT + 5,
        "chatId": 4711,
        "feedbackScore": None,
        "sources": [],
    }
    if course_sources is not None:
        msg["courseSources"] = course_sources
    return [{"role": "user", "content": QUESTION, "sentAt": tv.SENT_AT}, msg]


OPEN = {**tv.BASE_ATTRS, "open-on-load": "on"}
CARDS = {**OPEN, "course-cards": "auto"}
ABOVE = {**CARDS, "course-cards-position": "above"}
BELOW = {**CARDS, "course-cards-position": "below"}
# Kurz-Antwortstil (Course Cards Mode) mit Marker-Ankündigung: Server schickt
# zuerst die angekündigten Kurse, dann den Text; der Abschluss-Chunk ergänzt
# einen verlinkten Kurs ohne Treffer-Dokument (BY[9]).
ANNOUNCED = [BY[6], BY[0]]
ANSWER_SHORT = (
    "Ja, abends gibt es passende Yogakurse:\n\n"
    f"1. {md(BY[6], '**' + BY[6]['title'] + '**')}\n"
    f"2. {md(BY[0], '**' + BY[0]['title'] + '**')}\n"
    f"3. {md(BY[9], '**' + BY[9]['title'] + '**')}\n\n"
    "Suchen Sie eher einen Kurs am Wochenende?"
)


def announced_events(answer=ANSWER_SHORT, uuid="u-1", parts=4, marker=None):
    """Chunk courseSources (vorab) + Text-Chunks + Abschluss mit Ergänzung."""
    text = (marker + answer) if marker else answer
    size = max(1, len(text) // parts + 1)
    chunks = [text[i : i + size] for i in range(0, len(text), size)]
    ev = []
    if not marker:
        ev.append({"uuid": uuid, "type": "courseSources", "courseSources": ANNOUNCED, "close": False, "error": False})
    ev += [
        {"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": c}
        for c in chunks
    ]
    ev[-1]["close"] = True
    final = {"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712,
             "courseSources": ANNOUNCED + [BY[9]]}
    if not marker:
        final["courseCardsAnnounced"] = len(ANNOUNCED)
    return ev + [final]


def announced_history():
    h = history(ANSWER_SHORT, course_sources=ANNOUNCED + [BY[9]])
    h[1]["courseCardsAnnounced"] = len(ANNOUNCED)
    return h


# Kurskarten v3: Donau-Yoga mit Dauer/Ort (Kopfzeilen "Dauer:"/"Kursort:")
V3 = [
    {**FIX["donauYoga"][0], "sessions": "16 Abende", "venue": "Realschule"},
    {**FIX["donauYoga"][1], "sessions": "12 x", "venue": "Realschule"},
]
TEASERS_V3 = {
    V3[0]["url"]: "Für Yoga-Erfahrene: kräftigende Haltungen, ruhige Atemübungen und ein "
                  "entspannter Ausklang am Montagabend.",
    V3[1]["url"]: "Sanfter Einstieg mit etwas Vorerfahrung – Dehnung, Atmung und Entspannung nach "
                  "einem langen Arbeitstag, ideal zum Abschalten unter der Woche.",
}
ANSWER_V3 = (
    "Ja, zwei Yogakurse am Abend passen gut zu Ihrer Frage. "
    "Möchten Sie eher gezielt weitermachen oder in Ruhe einsteigen? Alle Kurse finden Sie unter "
    "[Gesundheit](https://aw.donau.kufer.de/programm/gesundheit)."
)
TEASER_LINES_V3 = "[[TEASER 0: Kräftigende Haltungen am Montagabend.]]\n[[TEASER 1: Sanfter Einstieg dienstags.]]\n"


def v3_events(uuid="u-1", parts=4, teasers=True, passthrough=False):
    """Kurskarten v3: courseSources (vorab) -> courseTeasers -> Text -> Abschluss.
    passthrough: älterer Server — kein Teaser-Chunk, Marker + Teaserzeilen im Text."""
    text = ("[[KARTEN: 0, 1]]\n" + TEASER_LINES_V3 + ANSWER_V3) if passthrough else ANSWER_V3
    size = max(1, len(text) // parts + 1)
    chunks = [text[i : i + size] for i in range(0, len(text), size)]
    ev = []
    if not passthrough:
        ev.append({"uuid": uuid, "type": "courseSources", "courseSources": V3, "close": False, "error": False})
        if teasers:
            ev.append({"uuid": uuid, "type": "courseTeasers", "teasers": TEASERS_V3, "close": False, "error": False})
    ev += [
        {"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": c}
        for c in chunks
    ]
    ev[-1]["close"] = True
    ev.append({"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712})
    return ev


def v3_history(teasers=True):
    h = history(ANSWER_V3, course_sources=V3)
    h[1]["courseCardsAnnounced"] = len(V3)
    if teasers:
        h[1]["courseTeasers"] = TEASERS_V3
    return h


SMALL = {"width": 360, "height": 740}
CARD_SEL = "[data-course-cards]"
# Mockup vhs Rhein: Panel 40 px, Karten 14 px, Blasen 18 px (--allm-radius-card)
RADIUS_CSS = ("#anythingllm-embed-widget { --allm-radius: 40px; --allm-radius-card: 14px; "
              "--allm-radius-bubble: 18px; }")

# Zeilen-Karten: Fenster so breit, dass die Karte 700 px misst (Desktop)
ROWS = {**ABOVE, "course-cards-layout": "rows"}
# Fenstergröße gibt es nur aus dem Design Center (visual_config windowWidth)
WIDE = {"windowWidth": "794px"}
ROWS_WIDE = ROWS
GRID_WIDE = ABOVE
MOBILE_390 = {"width": 390, "height": 740}
# AK-2: drei Teaser à 18–20 Wörter (Stil der Demo-Teaser vom 06.10.)
TEASERS_FIT = [
    "Für alle mit etwas Yoga-Erfahrung: kräftigende Haltungen, ruhige Atemübungen und ein entspannter "
    "Ausklang am Montagabend in kleiner Gruppe.",
    "Sanfter Einstieg mit etwas Vorerfahrung: Dehnung, Atmung und Entspannung nach der Arbeit, ideal zum "
    "Abschalten auch mitten in der Woche.",
    "Praxisnaher Einstieg in KI-Werkzeuge für den Alltag: Texte formulieren, Bilder erstellen und Risiken "
    "sicher einschätzen lernen, ganz ohne Vorkenntnisse.",
]
PENDING_TEXT = "KI-Beschreibung wird erstellt …"


def pending_events(teaser_delay=1200, hold=False):
    """AK-4: courseSources sofort, courseTeasers nach teaser_delay ms, dann
    Text. hold: Teaser kommen (praktisch) nie — Zustand für Screenshots."""
    ev = v3_events(parts=3)
    ev[0]["__delay"] = 150
    ev[1]["__delay"] = 600000 if hold else teaser_delay
    for e in ev[2:]:
        e["__delay"] = 150
    return ev


# ---------------------------------------------------------------------------
# Testseiten-Helfer: Stream mit Pausen (fetch-Ersatz) + Protokoll der Karten
# ---------------------------------------------------------------------------
SLOW_STREAM_JS = r"""
(() => {
  window.__streamLog = [];
  window.__cardLog = [];
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const plan = window.__SLOW_STREAM;
    if (plan && url && url.split("?")[0].endsWith("/stream-chat")) {
      const enc = new TextEncoder();
      const body = new ReadableStream({
        async start(ctrl) {
          for (const ev of plan.events) {
            await new Promise((r) => setTimeout(r, ev.__delay ?? plan.delay));
            window.__streamLog.push({ t: performance.now(), type: ev.type, close: !!ev.close });
            ctrl.enqueue(enc.encode("data: " + JSON.stringify(ev) + "\n\n"));
          }
          ctrl.close();
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    return origFetch.apply(this, arguments);
  };
  const watch = () => {
    if (!window.__allmShadow) return requestAnimationFrame(watch);
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes)
          if (n.nodeType === 1 && (n.matches("[data-course-cards]") || n.querySelector("[data-course-cards]")))
            window.__cardLog.push({ t: performance.now(), op: "add", replies: window.__allmShadow.querySelectorAll(".allm-reply").length });
        for (const n of r.removedNodes)
          if (n.nodeType === 1 && (n.matches("[data-course-cards]") || n.querySelector("[data-course-cards]")))
            window.__cardLog.push({ t: performance.now(), op: "remove" });
      }
    }).observe(window.__allmShadow, { childList: true, subtree: true });
  };
  watch();
})();
"""


def send(page, text=QUESTION):
    page.evaluate("() => window.__q('#message-input').focus()")
    page.keyboard.type(text)
    page.keyboard.press("Enter")


def freeze(ctx, page):
    page.clock.set_fixed_time(tv.SENT_AT)


# ---------------------------------------------------------------------------
# Pixel-Zustände
# ---------------------------------------------------------------------------
# (name, cfg, mock, wait-selector, aktion, viewport, Referenz-Herkunft)
#   "main": Referenz vom unveränderten Build (AK-1)
#   "new":  neuer Zustand, Referenz aus diesem Branch (Regressionsschutz)
def pixel_cases():
    assistant = ".allm-anything-llm-assistant-message a"
    return [
        # AK-1: Option aus, Server liefert courseSources trotzdem -> wie main
        ("cc-off-stream", {"attrs": OPEN}, tv.Mock(config={}, stream=stream_events(ANSWER_3)), "#message-input",
         "send", None, "main"),
        ("cc-off-history", {"attrs": OPEN}, tv.Mock(config={}, history=history(ANSWER_3)), assistant, None, None,
         "main"),
        # neue Zustände
        ("cc-cards-light", {"attrs": CARDS}, tv.Mock(config={}, stream=stream_events(ANSWER_3)), "#message-input",
         "send", None, "new"),
        ("cc-cards-dark", {"attrs": {**CARDS, "theme": "dark"}}, tv.Mock(config={}, stream=stream_events(ANSWER_3)),
         "#message-input", "send", None, "new"),
        ("cc-cards-mobile", {"attrs": CARDS}, tv.Mock(config={}, stream=stream_events(ANSWER_3)), "#message-input",
         "send", SMALL, "new"),
        ("cc-compact-light", {"attrs": CARDS}, tv.Mock(config={}, history=history(ANSWER_8)), CARD_SEL, None, None,
         "new"),
        ("cc-question-light", {"attrs": CARDS}, tv.Mock(config={}, history=history(ANSWER_Q)), assistant.replace(" a", ""),
         None, None, "new"),
        # Kurskarten v2: Karten über der Antwort (neue Zustände)
        ("cc-above-light", {"attrs": ABOVE}, tv.Mock(config={}, stream=announced_events()), "#message-input",
         "send", None, "new"),
        ("cc-above-history", {"attrs": ABOVE}, tv.Mock(config={}, history=announced_history()), CARD_SEL, None, None,
         "new"),
        ("cc-above-mobile", {"attrs": ABOVE}, tv.Mock(config={}, stream=announced_events()), "#message-input",
         "send", SMALL, "new"),
        # AK-4: "above" ohne Karten (Rückfrage) und explizit "below" = bestehende Referenz
        ("cc-above-question", {"attrs": ABOVE}, tv.Mock(config={}, history=history(ANSWER_Q)),
         assistant.replace(" a", ""), None, None, "same", "cc-question-light"),
        ("cc-below-explicit", {"attrs": BELOW}, tv.Mock(config={}, stream=stream_events(ANSWER_3)), "#message-input",
         "send", None, "same", "cc-cards-light"),
        # Schlanke Fallback-Karte (Kurslink ohne Serverdaten)
        ("cc-fallback", {"attrs": CARDS}, tv.Mock(config={}, stream=stream_events(ANSWER_FB)), "#message-input",
         "send", None, "new"),
        # Karten getrennt vom Panel gerundet (--allm-radius-card)
        ("cc-radius-card", {"attrs": CARDS, "css": RADIUS_CSS}, tv.Mock(config={}, stream=stream_events(ANSWER_3)),
         "#message-input", "send", None, "new"),
        # Kurskarten v3: Dauer/Ort (ohne Teaser) und KI-Teaser als Untertext
        ("cc-v3-meta", {"attrs": ABOVE}, tv.Mock(config={}, history=v3_history(teasers=False)), CARD_SEL, None,
         None, "new"),
        ("cc-v3-teaser", {"attrs": ABOVE}, tv.Mock(config={}, stream=v3_events()), "#message-input", "send", None,
         "new"),
        ("cc-v3-teaser-mobile", {"attrs": ABOVE}, tv.Mock(config={}, stream=v3_events()), "#message-input", "send",
         SMALL, "new"),
        # Zeilen-Karten (courseCardsLayout "rows") und Teaser-Platzhalter
        ("cc-rows-light", {"attrs": ROWS_WIDE}, tv.Mock(config=WIDE, history=v3_history()), CARD_SEL, None, None,
         "new"),
        ("cc-rows-dark", {"attrs": {**ROWS_WIDE, "theme": "dark"}}, tv.Mock(config=WIDE, history=v3_history()),
         CARD_SEL, None, None, "new"),
        ("cc-rows-mobile", {"attrs": ROWS}, tv.Mock(config={}, history=v3_history()), CARD_SEL, None, MOBILE_390,
         "new"),
        ("cc-teaser-pending", {"attrs": ABOVE, "slow": pending_events(hold=True)}, tv.Mock(config={}),
         "#message-input", "send-pending", None, "new"),
        ("cc-rows-pending", {"attrs": ROWS_WIDE, "slow": pending_events(hold=True)}, tv.Mock(config=WIDE),
         "#message-input", "send-pending", None, "new"),
    ]


def shoot(browser, base_url, case, out_path):
    name, cfg, m, sel, action, viewport = case[:6]
    slow = cfg.get("slow")
    cfg = {k: v for k, v in cfg.items() if k != "slow"}

    def before(ctx, page):
        freeze(ctx, page)
        if slow:
            ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps({'events': slow, 'delay': 150})};")
            ctx.add_init_script(SLOW_STREAM_JS)

    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport, before_goto=before)
    try:
        tv.wait_shadow(page, sel)
        if action == "send-pending":
            send(page)
            page.wait_for_function("() => window.__allmShadow.querySelectorAll('[data-teaser-pending]').length >= 2",
                                   timeout=10000)
        if action == "send":
            send(page)
            # Antwort fertig (Abschluss-Chunk verarbeitet): Bewertungs-Knöpfe da
            page.wait_for_function("() => !!window.__q('.allm-anything-llm-assistant-message a')", timeout=10000)
            if "auto" in json.dumps(cfg):
                page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        tv.settle(page)
        page.evaluate("() => window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur()")
        page.mouse.move(0, 0)
        page.wait_for_timeout(100)
        # Karten in den sichtbaren Bereich (Verlauf scrollt nach unten)
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return tv.errors_of(page), page.evaluate(f"() => window.__allmShadow.querySelectorAll('{CARD_SEL}').length")
    finally:
        m.release()
        ctx.close()


def run_pixel(browser, base_url, baseline, new_states, only=None):
    target = BASELINE_DIR if baseline else RESULTS_DIR
    target.mkdir(parents=True, exist_ok=True)
    for case in pixel_cases():
        name, origin = case[0], case[6]
        # "same": Vergleich mit einer bestehenden Referenz (case[7]), nie eigene
        ref_name = case[7] if len(case) > 7 else name
        if only and name not in only:
            continue
        if baseline:
            if origin == "same" or (origin == "new") != new_states:
                continue
            out = BASELINE_DIR / f"{name}.png"
            if out.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            errs, n = shoot(browser, base_url, case, out)
            print(f"[BASE] {name} -> {out.relative_to(ROOT)} (Karten im DOM: {n})" + (f" Konsole: {errs}" if errs else ""))
            continue
        out = RESULTS_DIR / f"course-cards-{name}.png"
        errs, n = shoot(browser, base_url, case, out)
        ref = BASELINE_DIR / f"{ref_name}.png"
        if not ref.exists():
            record(f"PIX {name}", False, "Referenz fehlt (--baseline)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"course-cards-{name}-diff.png")
        key = {"main": "AK-1", "same": f"AK-4 (= {ref_name})"}.get(origin, "REG")
        record(f"{key} {name}", ratio <= tv.MAX_DIFF_RATIO and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd}), Karten im DOM {n}"
               + (f", Konsole: {errs}" if errs else ""))
        if origin == "main":
            record(f"AK-1 {name}: 0 Karten ohne Option", n == 0, f"{n} Kartenbereiche im DOM")


# ---------------------------------------------------------------------------
# DOM-Prüfungen
# ---------------------------------------------------------------------------
CARD_INFO_JS = r"""
() => {
  const s = window.__allmShadow;
  const sec = s.querySelector("[data-course-cards]");
  if (!sec) return null;
  const cs = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
  const cards = [...sec.querySelectorAll(".allm-course-card")].map((c) => {
    // Kurskarten v2: die Karte selbst ist der Link (<a class="allm-course-card">)
    const a = c.matches("a") ? c : c.querySelector("a");
    const t = c.querySelector(".allm-course-title") || a;
    const r = c.getBoundingClientRect();
    const tr = (t || c).getBoundingClientRect();
    return {
      text: c.innerText,
      title: t ? t.textContent : null,
      href: a ? a.getAttribute("href") : null,
      target: a ? a.getAttribute("target") : null,
      rel: a ? a.getAttribute("rel") : null,
      links: c.querySelectorAll("a").length + (c.matches("a") ? 1 : 0),
      name: a ? a.getAttribute("aria-label") : null,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
      titleH: tr.height, titleLH: parseFloat(cs(t || c, "line-height")),
      bg: cs(c, "background-color"), color: cs(c, "color"),
      border: cs(c, "border-top-color"), borderLeft: cs(c, "border-left-color"),
      titleColor: t ? cs(t, "color") : null,
      schedule: c.querySelector(".allm-course-schedule") ? cs(c.querySelector(".allm-course-schedule"), "color") : null,
      details: c.querySelector(".allm-course-details") ? cs(c.querySelector(".allm-course-details"), "color") : null,
      status: c.querySelector(".allm-course-status") ? cs(c.querySelector(".allm-course-status"), "color") : null,
    };
  });
  const rows = [...sec.querySelectorAll(".allm-course-row")].map((r) => r.innerText);
  const hist = s.querySelector("#chat-history");
  const footer = sec.querySelector(".allm-course-category");
  return {
    cards, rows,
    footer: footer ? { text: footer.textContent, href: footer.getAttribute("href"), rel: footer.getAttribute("rel"), target: footer.getAttribute("target") } : null,
    secScroll: [sec.scrollWidth, sec.clientWidth],
    histScroll: hist ? [hist.scrollWidth, hist.clientWidth] : null,
    docScroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
  };
}
"""


def open_and_send(browser, base_url, attrs, m, viewport=None, css=None):
    cfg = {"attrs": attrs}
    if css:
        cfg["css"] = css
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport, before_goto=freeze)
    tv.wait_shadow(page, "#message-input")
    send(page)
    page.wait_for_function("() => !!window.__q('.allm-anything-llm-assistant-message a')", timeout=10000)
    return ctx, page


def check_ak2(browser, base_url):
    m = tv.Mock(config={}, stream=stream_events(ANSWER_3))
    ctx, page = open_and_send(browser, base_url, CARDS, m)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        info = page.evaluate(CARD_INFO_JS)
        titles = [c["title"] for c in info["cards"]]
        want = [c["title"] for c in sorted(THREE, key=lambda c: c["start_date"])]
        record("AK-2 genau die verlinkten Kurse, sortiert nach Beginn", titles == want, f"{titles}")
        ok_fields = all(
            c["href"] and "·" in c["text"] and " Uhr" in c["text"] and "ab " in c["text"] and "€" in c["text"]
            for c in info["cards"]
        )
        record("AK-2 Felder je Karte (Link, Wochentag/Uhrzeit, Beginn, Ort, Preis)", ok_fields,
               " | ".join(c["text"].replace("\n", " / ") for c in info["cards"]))
        links_ok = all(c["target"] == "_blank" and c["rel"] == "noopener noreferrer" for c in info["cards"])
        f = info["footer"]
        record("Links target=_blank rel=noopener noreferrer", links_ok and f and f["target"] == "_blank" and f["rel"] == "noopener noreferrer",
               f"Karten {links_ok}, Abschluss {f}")
        record("AK-5 Abschlusslink mit Linktext der Antwort", f and f["text"] == "Umwelt und Gesundheit →"
               and f["href"] == CATEGORY_URL, f"{f}")
        no_undef = not any(("undefined" in c["text"] or "NaN" in c["text"]) for c in info["cards"])
        record("AK-7 kein undefined/NaN", no_undef, "ok" if no_undef else "gefunden")
    finally:
        m.release()
        ctx.close()


FALLBACK_INFO_JS = r"""
() => {
  const s = window.__allmShadow;
  const reply = [...s.querySelectorAll(".allm-anything-llm-assistant-message")].pop();
  const card = (c) => {
    const r = c.getBoundingClientRect();
    return {
      title: c.querySelector(".allm-course-title")?.textContent ?? null,
      text: c.innerText, href: c.getAttribute("href"), tag: c.tagName,
      fallback: c.hasAttribute("data-course-fallback"), h: Math.round(r.height),
      meta: c.querySelectorAll(".allm-course-schedule, .allm-course-details, .allm-course-status").length,
      below: reply ? r.top >= reply.getBoundingClientRect().bottom : null,
    };
  };
  const top = s.querySelector("[data-course-cards]");
  const footer = s.querySelector("[data-course-cards-footer]");
  return {
    top: top ? [...top.querySelectorAll(".allm-course-card")].map(card) : [],
    footer: footer ? [...footer.querySelectorAll(".allm-course-card")].map(card) : [],
  };
}
"""


def check_fallback(browser, base_url):
    """Schlanke Fallback-Karte: Kurslink ohne courseSources-Eintrag."""
    # below: Reihenfolge wie die übrigen Karten (datierte zuerst), nur Titel
    m = tv.Mock(config={}, stream=stream_events(ANSWER_FB))
    ctx, page = open_and_send(browser, base_url, CARDS, m)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        page.wait_for_timeout(300)
        info = page.evaluate(FALLBACK_INFO_JS)
        cards = info["top"]
        fb = [c for c in cards if c["fallback"]]
        full = [c for c in cards if not c["fallback"]]
        ok = (len(cards) == 3 and len(fb) == 1 and fb[0]["title"] == FALLBACK_TITLE
              and fb[0]["text"].strip() == FALLBACK_TITLE and fb[0]["href"] == FALLBACK_URL
              and fb[0]["tag"] == "A" and fb[0]["meta"] == 0 and cards[-1]["fallback"]
              and all(c["meta"] >= 2 for c in full) and all(c["h"] > fb[0]["h"] for c in full))
        record("Fallback-Karte (below): nur Titel + Link, ganze Karte klickbar, nach den datierten", ok,
               " | ".join(f"{c['title']} (fallback {c['fallback']}, Zeilen {c['meta']}, {c['h']} px)" for c in cards))
    finally:
        m.release()
        ctx.close()
    # above mit Ankündigung: Fallback-Karte unter der Antwort, oben unverändert
    events = announced_events(answer=ANSWER_FB)
    m = tv.Mock(config={}, stream=events)
    ctx, page = open_and_send(browser, base_url, ABOVE, m)
    try:
        page.wait_for_function("() => !!window.__q('[data-course-cards-footer]')", timeout=10000)
        page.wait_for_timeout(300)
        info = page.evaluate(FALLBACK_INFO_JS)
        ok = (len(info["footer"]) == 1 and info["footer"][0]["fallback"] and info["footer"][0]["below"]
              and info["footer"][0]["title"] == FALLBACK_TITLE and not any(c["fallback"] for c in info["top"])
              and [c["title"] for c in info["top"]] == [BY[6]["title"], BY[0]["title"]])
        record("Fallback-Karte (above): unter der Antwort, Karten oben unverändert", ok,
               f"oben {[c['title'] for c in info['top']]}, unten {[c['title'] for c in info['footer']]}")
    finally:
        m.release()
        ctx.close()


def check_ak8(browser, base_url):
    """Streamende Antwort mit Pausen: Karten erscheinen genau einmal, nach dem
    letzten Text-Chunk, nie während des Streams; danach kein Entfernen."""
    events = stream_events(ANSWER_3, parts=6)
    plan = {"events": events, "delay": 250}

    def before(ctx, page):
        freeze(ctx, page)
        ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan)};")
        ctx.add_init_script(SLOW_STREAM_JS)

    ctx, page = tv.open_page(browser, base_url, {"attrs": CARDS}, tv.Mock(config={}), before_goto=before)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        # während des Streams mehrfach nachsehen
        seen_during = 0
        for _ in range(12):
            page.wait_for_timeout(120)
            st = page.evaluate("() => ({log: window.__streamLog.length, cards: !!window.__q('[data-course-cards]')})")
            if st["log"] < len(events) - 1 and st["cards"]:
                seen_during += 1
        page.wait_for_function("() => window.__streamLog.length >= %d" % len(events), timeout=15000)
        page.wait_for_timeout(800)
        res = page.evaluate("() => ({stream: window.__streamLog, cards: window.__cardLog, n: window.__allmShadow.querySelectorAll('[data-course-cards]').length})")
        adds = [c for c in res["cards"] if c["op"] == "add"]
        removes = [c for c in res["cards"] if c["op"] == "remove"]
        last_text = max(e["t"] for e in res["stream"] if e["type"] == "textResponseChunk")
        ok = (len(adds) == 1 and not removes and res["n"] == 1 and adds[0]["t"] >= last_text and seen_during == 0)
        record("AK-8 Karten einmal nach Stream-Ende, kein Flackern", ok,
               f"eingefügt {len(adds)}x, entfernt {len(removes)}x, während Stream sichtbar {seen_during}x, "
               f"Einfügen {adds[0]['t'] - last_text:+.0f} ms nach letztem Text-Chunk" if adds else f"{res}")
    finally:
        ctx.close()


def check_ak9(browser, base_url):
    # (a) dunkles Standard-Theme: Kartenfarben = dunkler Variablensatz
    m = tv.Mock(config={}, stream=stream_events(ANSWER_3))
    ctx, page = open_and_send(browser, base_url, {**CARDS, "theme": "dark"}, m)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        info = page.evaluate(CARD_INFO_JS)
        c = info["cards"][0]
        want = {"bg": tv.DARK_SURFACE if hasattr(tv, "DARK_SURFACE") else "rgb(29, 29, 33)",
                "color": "rgb(244, 242, 239)", "border": "rgb(120, 123, 130)"}
        got = {"bg": c["bg"], "color": c["color"], "border": c["border"]}
        record("AK-9 dunkel: surface/text/border aus dem dunklen Satz", got == want, f"{got}")
        worst = check_contrast(info, "dunkel")
        record("AK-9 dunkel: Kontrast >= 4,5:1", worst >= 4.5, f"min. {worst:.2f}:1")
    finally:
        m.release()
        ctx.close()
    # (b) Seiten-CSS --allm-* wirkt auf die Karten (hell)
    css = ("#anythingllm-embed-widget { --allm-surface: #fdf6e3; --allm-text: #102030; "
           "--allm-border: #aa00aa; --allm-accent: #0b6e4f; --allm-text-muted: #3d4a55; }")
    m = tv.Mock(config={}, stream=stream_events(ANSWER_3))
    ctx, page = open_and_send(browser, base_url, CARDS, m, css=css)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        info = page.evaluate(CARD_INFO_JS)
        c = info["cards"][0]
        got = {"bg": c["bg"], "color": c["color"], "border": c["border"], "accent": c["borderLeft"],
               "muted": c["details"]}
        want = {"bg": "rgb(253, 246, 227)", "color": "rgb(16, 32, 48)", "border": "rgb(170, 0, 170)",
                "accent": "rgb(11, 110, 79)", "muted": "rgb(61, 74, 85)"}
        record("AK-9 Seiten-CSS --allm-surface/-text/-border/-accent/-text-muted wirken", got == want, f"{got}")
    finally:
        m.release()
        ctx.close()
    # (c) helles Standard-Theme: Kontrast
    m = tv.Mock(config={}, stream=stream_events(ANSWER_3))
    ctx, page = open_and_send(browser, base_url, CARDS, m)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        info = page.evaluate(CARD_INFO_JS)
        worst = check_contrast(info, "hell")
        record("AK-9 hell: Kontrast >= 4,5:1", worst >= 4.5, f"min. {worst:.2f}:1")
    finally:
        m.release()
        ctx.close()


def check_contrast(info, label):
    worst = 99.0
    for c in info["cards"]:
        bg = tv.parse_rgb(c["bg"])
        for key in ("titleColor", "schedule", "details", "status"):
            if not c[key]:
                continue
            ratio = tv.contrast(tv.over(tv.parse_rgb(c[key]), bg), bg)
            worst = min(worst, ratio)
    return worst


def check_ak10(browser, base_url):
    m = tv.Mock(config={}, stream=stream_events(ANSWER_3))
    ctx, page = open_and_send(browser, base_url, CARDS, m, viewport=SMALL)
    try:
        page.wait_for_function(f"() => !!window.__q('{CARD_SEL}')", timeout=10000)
        tv.settle(page, 300)
        info = page.evaluate(CARD_INFO_JS)
        xs = {c["x"] for c in info["cards"]}
        ys = [c["y"] for c in info["cards"]]
        one_col = len(xs) == 1 and ys == sorted(ys) and len(set(ys)) == len(ys)
        no_scroll = (info["secScroll"][0] <= info["secScroll"][1] and info["histScroll"][0] <= info["histScroll"][1]
                     and info["docScroll"][0] <= info["docScroll"][1])
        long_title = max(info["cards"], key=lambda c: len(c["title"] or ""))
        wraps = long_title["titleH"] > long_title["titleLH"] * 1.5
        record("AK-10 360 px: einspaltig", one_col, f"x={sorted(xs)}, y={ys}, Breiten={[c['w'] for c in info['cards']]}")
        record("AK-10 360 px: kein horizontales Scrollen", no_scroll,
               f"Karten {info['secScroll']}, Verlauf {info['histScroll']}, Seite {info['docScroll']}")
        record("AK-10 360 px: langer Titel bricht um", wraps,
               f"„{long_title['title'][:40]}…“ Höhe {long_title['titleH']:.0f}px, Zeile {long_title['titleLH']:.0f}px")
    finally:
        m.release()
        ctx.close()


def check_history_and_compact(browser, base_url):
    # Verlauf: courseSources aus der Historie -> Karten
    m = tv.Mock(config={}, history=history(ANSWER_3))
    ctx, page = tv.open_page(browser, base_url, {"attrs": CARDS}, m)
    try:
        tv.wait_shadow(page, CARD_SEL)
        info = page.evaluate(CARD_INFO_JS)
        record("Verlauf: Karten aus gespeicherten courseSources", len(info["cards"]) == 3, f"{len(info['cards'])} Karten")
    finally:
        ctx.close()
    # Kompaktliste
    m = tv.Mock(config={}, history=history(ANSWER_8))
    ctx, page = tv.open_page(browser, base_url, {"attrs": CARDS}, m)
    try:
        tv.wait_shadow(page, CARD_SEL)
        info = page.evaluate(CARD_INFO_JS)
        record("AK-4 8 genannte Kurse -> 8 Kompaktzeilen, keine Karten", len(info["rows"]) == 8 and not info["cards"],
               f"{len(info['rows'])} Zeilen, {len(info['cards'])} Karten; 1. Zeile „{info['rows'][0]}“")
    finally:
        ctx.close()
    # Rückfrage
    m = tv.Mock(config={}, history=history(ANSWER_Q))
    ctx, page = tv.open_page(browser, base_url, {"attrs": CARDS}, m)
    try:
        tv.wait_shadow(page, ".allm-anything-llm-assistant-message")
        tv.settle(page, 300)
        n = page.evaluate(f"() => window.__allmShadow.querySelectorAll('{CARD_SEL}').length")
        record("AK-6 Rückfrage: keine Kartenfläche", n == 0, f"{n}")
    finally:
        ctx.close()
    # Option über visual_config (Server) statt Script-Attribut
    m = tv.Mock(config={"courseCards": "auto"}, history=history(ANSWER_3))
    ctx, page = tv.open_page(browser, base_url, {"attrs": OPEN}, m)
    try:
        tv.wait_shadow(page, CARD_SEL)
        record("visual_config.courseCards=auto schaltet ein", True, "Karten sichtbar")
    except Exception as e:  # noqa: BLE001
        record("visual_config.courseCards=auto schaltet ein", False, str(e)[:120])
    finally:
        ctx.close()


class RecordingMock(tv.Mock):
    """Mock wie in theme_visual, protokolliert jeden API-Aufruf."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.calls = []

    def handle(self, route):
        path = route.request.url.split("/api/embed/")[-1].split("?")[0]
        rest = path.split("/", 1)[-1] if "/" in path else ""
        # Session-ID (UUID) ist je Seite neu -> vereinheitlichen
        rest = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<session>", rest)
        self.calls.append(f"{route.request.method} {rest}")
        return super().handle(route)


def check_nak4(browser, base_url):
    """Karten sind reine Darstellung: gleiche API-Aufrufe mit und ohne Option,
    kein zusätzlicher Schreib-/Zählaufruf (Verlauf/Kontingent unberührt)."""
    calls = {}
    for label, attrs in (("aus", OPEN), ("auto", CARDS)):
        m = RecordingMock(config={}, history=history(ANSWER_3))
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, m)
        try:
            tv.wait_shadow(page, ".allm-anything-llm-assistant-message a")
            tv.settle(page, 800)
            calls[label] = sorted(m.calls)
        finally:
            ctx.close()
    writes = [c for c in calls["auto"] if not c.startswith("GET ")]
    record("NAK-4 Karten lösen keine zusätzlichen Server-Aufrufe aus", calls["aus"] == calls["auto"] and not writes,
           f"aus={calls['aus']}, auto={calls['auto']}")



# ---------------------------------------------------------------------------
# Kurskarten v2
# ---------------------------------------------------------------------------
# Protokoll im Testfenster: erste Karten-Einfügung, erstes sichtbares Text-
# Zeichen der Antwort, Lage der Kartenfläche im Verlauf (relativ zum Inhalt,
# unabhängig vom Auto-Scroll), Marker-Sichtungen.
ABOVE_PROBE_JS = r"""
(() => {
  window.__probe = { cardsAt: null, textAt: null, tops: [], marker: 0, adds: 0, removes: 0 };
  const isCards = (n) => n.nodeType === 1 && (n.matches("[data-course-cards]") || n.querySelector("[data-course-cards]"));
  const watch = () => {
    const s = window.__allmShadow;
    if (!s) return requestAnimationFrame(watch);
    new MutationObserver((records) => {
      const p = window.__probe;
      for (const r of records) {
        for (const n of r.addedNodes) if (isCards(n)) p.adds++;
        for (const n of r.removedNodes) if (isCards(n)) p.removes++;
      }
      const sec = s.querySelector("[data-course-cards]");
      const hist = s.querySelector("#chat-history");
      const text = [...s.querySelectorAll(".allm-reply, .allm-anything-llm-assistant-message")]
        .map((e) => e.textContent).join("").trim();
      if (sec && p.cardsAt === null) { p.cardsAt = performance.now(); sec.__first = true; }
      if (text && p.textAt === null) p.textAt = performance.now();
      if (sec && hist) {
        const top = sec.getBoundingClientRect().top - hist.getBoundingClientRect().top + hist.scrollTop;
        p.tops.push(Math.round(top * 10) / 10);
      }
      if (/KARTEN/.test(s.textContent)) p.marker++;
    }).observe(s, { childList: true, subtree: true, characterData: true });
  };
  watch();
})();
"""


def slow_page(browser, base_url, attrs, events, delay=250, extra_js=None):
    plan = {"events": events, "delay": delay}

    def before(ctx, page):
        freeze(ctx, page)
        ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan)};")
        ctx.add_init_script(SLOW_STREAM_JS)
        ctx.add_init_script(ABOVE_PROBE_JS)
        if extra_js:
            ctx.add_init_script(extra_js)

    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, tv.Mock(config={}), before_goto=before)
    tv.wait_shadow(page, "#message-input")
    send(page)
    page.wait_for_function("() => window.__streamLog.length >= %d" % len(events), timeout=20000)
    page.wait_for_timeout(800)
    return ctx, page


def check_ak4b(browser, base_url):
    """above + streamende Antwort: Karten stehen vor dem ersten Text-Token, genau
    eine Einfügung, die Kartenfläche verschiebt sich nicht; die Ergänzung am
    Ende wird angehängt (gleicher Knoten, erste Karte bleibt)."""
    events = announced_events(parts=6)
    ctx, page = slow_page(browser, base_url, ABOVE, events)
    try:
        res = page.evaluate("""() => {
          const s = window.__allmShadow, sec = s.querySelector('[data-course-cards]');
          const reply = s.querySelector('.allm-anything-llm-assistant-message');
          return { probe: window.__probe, n: s.querySelectorAll('[data-course-cards]').length,
                   first: !!(sec && sec.__first), titles: [...s.querySelectorAll('.allm-course-title')].map(e => e.textContent),
                   before: !!(sec && reply && (sec.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING)) };
        }""")
        p = res["probe"]
        lead = (p["textAt"] - p["cardsAt"]) if p["cardsAt"] is not None and p["textAt"] is not None else None
        record("AK-4b Karten vor dem ersten Text-Token", lead is not None and lead > 0,
               f"Karten {lead:+.0f} ms vor dem ersten Text" if lead is not None else f"{p}")
        record("AK-4b genau eine Einfügung, kein Entfernen, gleicher Knoten", p["adds"] == 1 and p["removes"] == 0
               and res["n"] == 1 and res["first"], f"eingefügt {p['adds']}x, entfernt {p['removes']}x, Knoten erhalten {res['first']}")
        tops = p["tops"]
        record("AK-4b Kartenfläche verschiebt sich nicht", bool(tops) and max(tops) - min(tops) <= 0.5,
               f"{len(tops)} Messungen, Lage {min(tops) if tops else None}–{max(tops) if tops else None} px")
        want = [BY[6]["title"], BY[0]["title"], BY[9]["title"]]
        record("AK-4b Ergänzung am Ende angehängt, Reihenfolge stabil", res["titles"] == want and res["before"],
               f"{res['titles']}, Karten vor der Antwort {res['before']}")
        record("Marker nie sichtbar (above)", p["marker"] == 0, f"{p['marker']} Sichtungen")
    finally:
        ctx.close()


def check_marker_passthrough(browser, base_url):
    """Server < 7.10 reicht den Marker durch: das Widget zeigt ihn nie."""
    for label, attrs in (("above", ABOVE), ("below", CARDS)):
        events = announced_events(parts=8, marker="[[KARTEN: 0, 1]]\n\n")
        ctx, page = slow_page(browser, base_url, attrs, events, delay=150)
        try:
            p = page.evaluate("() => window.__probe")
            txt = page.evaluate("() => window.__allmShadow.querySelector('.allm-anything-llm-assistant-message').textContent")
            record(f"Marker vom Server durchgereicht ({label}): nie sichtbar", p["marker"] == 0 and "KARTEN" not in txt
                   and txt.strip().startswith("Ja, abends"), f"{p['marker']} Sichtungen, Text „{txt.strip()[:30]}…“")
        finally:
            ctx.close()


def check_ak4c(browser, base_url):
    """Ganze Karte klickbar: Klick auf Zeit, Ort/Preis, Badge, Rand öffnet die
    Kurs-URL im neuen Tab; Tab-Fokus landet auf der Karte als EIN Element,
    Enter öffnet; Hover/Fokus über --allm-hover-bg/--allm-focus-ring."""
    for label, attrs, m in (("below", CARDS, tv.Mock(config={}, history=history(ANSWER_3))),
                            ("above", ABOVE, tv.Mock(config={}, history=announced_history()))):
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, m)
        ctx.route("https://www.vhs-bergisch-land.de/**",
                  lambda route: route.fulfill(status=200, body="<title>Kurs</title>", content_type="text/html"))
        try:
            tv.wait_shadow(page, ".allm-course-card")
            tv.settle(page, 400)
            card = page.evaluate("""() => {
              const c = window.__allmShadow.querySelector('.allm-course-card');
              c.scrollIntoView({block: 'center'});
              const box = (sel) => { const e = sel ? c.querySelector(sel) : c; const r = e.getBoundingClientRect();
                                     return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.x, t: r.y, w: r.width, h: r.height }; };
              return { href: c.getAttribute('href'), tag: c.tagName, links: c.querySelectorAll('a').length,
                       name: c.getAttribute('aria-label'), title: c.querySelector('.allm-course-title').textContent,
                       schedule: box('.allm-course-schedule'), details: box('.allm-course-details'),
                       status: box('.allm-course-status'), card: box(null) };
            }""")
            points = {
                "Zeit": (card["schedule"]["x"], card["schedule"]["y"]),
                "Ort/Preis": (card["details"]["x"], card["details"]["y"]),
                "Badge": (card["status"]["x"], card["status"]["y"]),
                "Rand rechts unten": (card["card"]["l"] + card["card"]["w"] - 4, card["card"]["t"] + card["card"]["h"] - 4),
                "Rand links": (card["card"]["l"] + 1.5, card["card"]["y"]),
            }
            opened = {}
            for where, (x, y) in points.items():
                with ctx.expect_page(timeout=5000) as info:
                    page.mouse.click(x, y)
                popup = info.value
                popup.wait_for_load_state()
                opened[where] = popup.url == card["href"]
                popup.close()
            record(f"AK-4c ({label}) Klick irgendwo auf die Karte öffnet die Kurs-URL", all(opened.values()),
                   ", ".join(f"{k}: {'ok' if v else 'NEIN'}" for k, v in opened.items()))
            record(f"AK-4c ({label}) ein Link je Karte, Name = Titel",
                   card["tag"] == "A" and card["links"] == 0 and card["name"] == card["title"],
                   f"<{card['tag'].lower()}> mit {card['links']} inneren Links, Name „{card['name']}“")
            # Hover
            page.mouse.move(*points["Ort/Preis"])
            page.wait_for_timeout(150)
            hover = page.evaluate("() => getComputedStyle(window.__allmShadow.querySelector('.allm-course-card')).backgroundColor")
            record(f"AK-4c ({label}) Hover-Fläche --allm-hover-bg", hover == "rgb(243, 244, 246)", hover)
            page.mouse.move(0, 0)
            # Tastatur: Fokus auf das Element davor, dann Tab -> Karte, Enter
            page.evaluate("""() => {
              const s = window.__allmShadow, c = s.querySelector('.allm-course-card');
              const all = [...s.querySelectorAll('a[href], button, input, textarea, [tabindex]')]
                .filter((e) => !e.disabled && e.tabIndex >= 0 && e.offsetParent !== null);
              const i = all.indexOf(c);
              all[i - 1].focus();
            }""")
            page.keyboard.press("Tab")
            focus = page.evaluate("""() => { const a = window.__allmShadow.activeElement;
              return { card: !!a && a.classList.contains('allm-course-card'), outline: a ? getComputedStyle(a).outlineStyle : null,
                       width: a ? getComputedStyle(a).outlineWidth : null }; }""")
            with ctx.expect_page(timeout=5000) as info:
                page.keyboard.press("Enter")
            popup = info.value
            popup.wait_for_load_state()
            entered = popup.url == card["href"]
            popup.close()
            record(f"AK-4c ({label}) Tab landet auf der Karte, Fokusring sichtbar, Enter öffnet",
                   focus["card"] and focus["outline"] not in (None, "none") and entered,
                   f"Fokus auf Karte {focus['card']}, outline {focus['outline']} {focus['width']}, Enter {entered}")
        finally:
            ctx.close()


def check_radius_card(browser, base_url):
    """AK-6: --allm-radius 40px + --allm-radius-card 14px -> Panel 40, Karte 14;
    ohne --allm-radius-card Karte 0,75 × 40 = 30 px; ohne beides 12 px (wie bisher)."""
    js = ("() => ({ win: getComputedStyle(window.__q('#anything-llm-chat')).borderTopLeftRadius, "
          "card: getComputedStyle(window.__q('.allm-course-card')).borderTopLeftRadius })")
    for label, css, want in (("40/14", RADIUS_CSS, ("40px", "14px")),
                             ("40 ohne --allm-radius-card", "#anythingllm-embed-widget { --allm-radius: 40px; }",
                              ("40px", "30px")),
                             ("Standard", None, ("16px", "12px"))):
        ctx, page = open_and_send(browser, base_url, CARDS, tv.Mock(config={}, stream=stream_events(ANSWER_3)), css=css)
        try:
            page.wait_for_function("() => !!window.__q('.allm-course-card')", timeout=10000)
            r = page.evaluate(js)
            record(f"AK-6 Karten-Rundung getrennt ({label})", (r["win"], r["card"]) == want,
                   f"Panel {r['win']}, Karte {r['card']} (Soll {want[0]} / {want[1]})")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Kurskarten v3: Dauer/Ort + KI-Teaser
# ---------------------------------------------------------------------------
# Protokoll: erster Teaser (Zeit), Kartenknoten vor/nach dem Teaser, rohe
# Teaserzeilen im sichtbaren Text.
V3_PROBE_JS = r"""
(() => {
  window.__v3 = { teaserAt: null, raw: 0, cardsBefore: null };
  const watch = () => {
    const s = window.__allmShadow;
    if (!s) return requestAnimationFrame(watch);
    new MutationObserver(() => {
      const p = window.__v3;
      const cards = [...s.querySelectorAll(".allm-course-card")];
      if (s.querySelector(".allm-course-teaser")) {
        if (p.teaserAt === null) p.teaserAt = performance.now();
      } else if (cards.length) {
        p.cardsBefore = cards;
      }
      if (/\[\[TEASER|KARTEN/.test(s.textContent)) p.raw++;
    }).observe(s, { childList: true, subtree: true, characterData: true });
  };
  watch();
})();
"""

V3_DOM_JS = r"""
() => {
  const s = window.__allmShadow;
  const cards = [...s.querySelectorAll(".allm-course-card")];
  const before = window.__v3 ? window.__v3.cardsBefore : null;
  return {
    sameNodes: !!before && before.length === cards.length && before.every((c, i) => c === cards[i]),
    cards: cards.map((c) => {
      const t = c.querySelector(".allm-course-teaser");
      const title = c.querySelector(".allm-course-title");
      const cs = t ? getComputedStyle(t) : null;
      return {
        title: title ? title.textContent : null,
        schedule: (c.querySelector(".allm-course-schedule") || {}).textContent || null,
        details: (c.querySelector(".allm-course-details") || {}).textContent || null,
        teaser: t ? t.textContent : null,
        afterTitle: !!t && t.previousElementSibling === title,
        h: t ? t.getBoundingClientRect().height : null,
        lh: cs ? parseFloat(cs.lineHeight) : null,
        fs: cs ? cs.fontSize : null,
        color: cs ? cs.color : null,
        titleColor: title ? getComputedStyle(title).color : null,
        clamp: cs ? cs.webkitLineClamp : null,
        clipped: !!t && t.scrollHeight > t.clientHeight + 1,
        described: !!t && (c.getAttribute("aria-describedby") || "").includes(t.id),
      };
    }),
    text: (s.querySelector(".allm-anything-llm-assistant-message") || {}).textContent || "",
  };
}
"""


def check_v3(browser, base_url):
    """Kurskarten v3 (AK-2/AK-5/NAK-3): Dauer/Ort in Kopf- und Metazeile; KI-
    Teaser kommt nach den Karten (Chunk courseTeasers), steht unter dem Titel
    (13 px, Textfarbe, bis zu 3 Zeilen), Karten bleiben dieselben Knoten an
    derselben Stelle; Verlauf-Reload zeigt ihn; Teaserzeilen eines älteren
    Servers sind nie sichtbar."""
    events = v3_events(parts=6)
    for label, viewport in (("Desktop", None), ("360 px", SMALL)):
        plan = {"events": events, "delay": 250}

        def before(ctx, page):
            freeze(ctx, page)
            ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan)};")
            ctx.add_init_script(SLOW_STREAM_JS)
            ctx.add_init_script(ABOVE_PROBE_JS)
            ctx.add_init_script(V3_PROBE_JS)

        ctx, page = tv.open_page(browser, base_url, {"attrs": ABOVE}, tv.Mock(config={}), viewport=viewport,
                                 before_goto=before)
        try:
            tv.wait_shadow(page, "#message-input")
            send(page)
            page.wait_for_function("() => window.__streamLog.length >= %d" % len(events), timeout=20000)
            page.wait_for_timeout(800)
            p = page.evaluate("() => window.__probe")
            v = page.evaluate("() => window.__v3")
            d = page.evaluate(V3_DOM_JS)
            want = [TEASERS_V3[c["url"]] for c in V3]
            got = [c["teaser"] for c in d["cards"]]
            record(f"AK-5 Teaser unter dem Titel ({label})", got == want and all(c["afterTitle"] for c in d["cards"]),
                   f"{[g[:25] if g else g for g in got]}")
            ok_style = all(c["fs"] == "13px" and c["color"] == c["titleColor"] for c in d["cards"])
            record(f"AK-5 Teaser 13 px in Textfarbe ({label})", ok_style,
                   f"{[(c['fs'], c['color']) for c in d['cards']]}")
            ok_clamp = all(c["clamp"] == "3" and c["h"] <= 3 * c["lh"] + 1 for c in d["cards"])
            record(f"AK-5 höchstens 3 Zeilen ({label})", ok_clamp,
                   f"Höhen {[round(c['h'], 1) for c in d['cards']]} bei Zeilenhöhe {d['cards'][0]['lh']}")
            record(f"AK-5 Teaser in der Kartenbeschreibung ({label})", all(c["described"] for c in d["cards"]),
                   "aria-describedby")
            lead = (v["teaserAt"] - p["cardsAt"]) if v["teaserAt"] and p["cardsAt"] else None
            record(f"AK-5 Karten zuerst, Teaser nachgefüllt ({label})", lead is not None and lead > 0,
                   f"Teaser {lead:+.0f} ms nach den Karten" if lead is not None else f"{v} / {p}")
            tops = p["tops"]
            record(f"AK-5 kein Sprung: dieselben Kartenknoten, Fläche fest ({label})",
                   d["sameNodes"] and p["adds"] == 1 and p["removes"] == 0 and bool(tops)
                   and max(tops) - min(tops) <= 0.5,
                   f"gleiche Knoten {d['sameNodes']}, eingefügt {p['adds']}x, Lage {min(tops) if tops else None}–"
                   f"{max(tops) if tops else None} px")
            record(f"AK-2 Kopf-/Metazeile mit Dauer und Ort ({label})",
                   d["cards"][0]["schedule"] == "Mo · 18:00 Uhr · 16 Abende"
                   and d["cards"][0]["details"] == "ab 14.09.2026 · Realschule · 60 €",
                   f"„{d['cards'][0]['schedule']}“ / „{d['cards'][0]['details']}“")
            record(f"Teaser/Marker nie als Text ({label})", v["raw"] == 0 and "TEASER" not in d["text"],
                   f"{v['raw']} Sichtungen")
        finally:
            ctx.close()

    # Verlauf-Reload: courseTeasers aus /history
    ctx, page = tv.open_page(browser, base_url, {"attrs": ABOVE}, tv.Mock(config={}, history=v3_history()),
                             before_goto=freeze)
    try:
        tv.wait_shadow(page, CARD_SEL)
        d = page.evaluate(V3_DOM_JS)
        record("AK-5 Verlauf-Reload zeigt die Teaser", [c["teaser"] for c in d["cards"]]
               == [TEASERS_V3[c["url"]] for c in V3], f"{len(d['cards'])} Karten")
    finally:
        ctx.close()

    # Älterer Server (< 7.13) reicht Marker + Teaserzeilen im Text durch
    for label, attrs in (("above", ABOVE), ("below", CARDS)):
        ev = v3_events(parts=9, passthrough=True)
        ctx, page = slow_page(browser, base_url, attrs, ev, delay=120, extra_js=V3_PROBE_JS)
        try:
            v = page.evaluate("() => window.__v3")
            txt = page.evaluate("() => window.__allmShadow.querySelector('.allm-anything-llm-assistant-message')"
                                ".textContent")
            record(f"NAK Teaserzeilen vom Server durchgereicht ({label}): nie sichtbar",
                   v["raw"] == 0 and "TEASER" not in txt and txt.strip().startswith("Ja, zwei"),
                   f"{v['raw']} Sichtungen, Text „{txt.strip()[:30]}…“")
        finally:
            ctx.close()


# AK-3 (Feinschliff): Teaser mit 20 Wörtern bei 330 px Kartenbreite
# vollständig (3 Zeilen, keine Ellipse). Schrift Arial (im Testsystem
# Liberation Sans, metrisch gleich; typische Breite von Systemschriften):
# die Standardschrift des Testsystems (DejaVu Sans, ≈ 10 % breiter) bräche
# den Text in 4 Zeilen.
# 20 Wörter, 136 Zeichen (Demo-Teaser 06.10.: 98–152 Zeichen, 15–19 Wörter;
# bei 330 px passen in Arial-Metrik ≈ 140 Zeichen in 3 Zeilen)
TEASER_20 = ("Sanfter Einstieg mit etwas Vorerfahrung: Dehnung, Atmung und Entspannung nach "
             "der Arbeit, ideal zum Abschalten auch mitten in der Woche.")
TEASER_FIT_JS = """() => { const l = window.__q('.allm-course-list'); l.style.gridTemplateColumns = '330px';
  return [...l.querySelectorAll('.allm-course-card')].map(c => { const t = c.querySelector('.allm-course-teaser');
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    return { w: Math.round(c.getBoundingClientRect().width), text: t.textContent,
             lines: Math.round(t.scrollHeight / lh), clipped: t.scrollHeight > t.clientHeight + 1,
             clamp: getComputedStyle(t).webkitLineClamp }; }); }"""


def check_teaser_20_words(browser, base_url):
    words = len([w for w in TEASER_20.split() if w != "–"])
    hist = v3_history()
    hist[1]["courseTeasers"] = {**TEASERS_V3, V3[1]["url"]: TEASER_20}
    ctx, page = tv.open_page(browser, base_url,
                             {"attrs": ABOVE, "css": "#anythingllm-embed-widget { --allm-font: Arial; }"},
                             tv.Mock(config={}, history=hist), before_goto=freeze)
    try:
        tv.wait_shadow(page, CARD_SEL)
        tv.settle(page, 400)
        d = page.evaluate(TEASER_FIT_JS)
        c = next(x for x in d if x["text"] == TEASER_20)
        record("AK-3 Teaser mit 20 Wörtern bei 330 px vollständig (≤ 3 Zeilen, keine Ellipse)",
               words == 20 and c["w"] == 330 and c["lines"] <= 3 and not c["clipped"] and c["clamp"] == "3",
               json.dumps({**c, "text": f"{words} Wörter/{len(TEASER_20)} Zeichen"}, ensure_ascii=False))
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# Zeilen-Karten und Teaser-Platzhalter
# ---------------------------------------------------------------------------
ROWS_DOM_JS = r"""() => {
  const s = window.__allmShadow;
  const list = s.querySelector('.allm-course-list');
  const hist = s.querySelector('#chat-history');
  const cs = (el, p) => el ? getComputedStyle(el).getPropertyValue(p).trim() : null;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right }; };
  return {
    layout: list && list.getAttribute('data-layout'),
    histScroll: hist ? [hist.scrollWidth, hist.clientWidth] : null,
    accent: getComputedStyle(document.getElementById('anythingllm-embed-widget')).getPropertyValue('--allmi-accent').trim(),
    cards: [...s.querySelectorAll('[data-course-cards] .allm-course-card')].map((c) => {
      const when = c.querySelector('.allm-course-when'), title = c.querySelector('.allm-course-title'),
            meta = c.querySelector('.allm-course-details'), badge = c.querySelector('.allm-course-status'),
            teaser = c.querySelector('.allm-course-teaser');
      return { row: c.hasAttribute('data-course-row'), links: c.querySelectorAll('a').length + (c.matches('a') ? 1 : 0),
        name: c.getAttribute('aria-label'), card: box(c),
        when: when && when.textContent, whenColor: cs(when, 'color'), whenNum: cs(when, 'font-variant-numeric'),
        whenBox: box(when), title: title && title.textContent, titleBox: box(title), titleFs: cs(title, 'font-size'),
        titleFw: cs(title, 'font-weight'),
        meta: meta && meta.textContent, metaBox: box(meta), metaFs: cs(meta, 'font-size'),
        badge: badge && badge.textContent, badgeBox: box(badge), badgeBorder: cs(badge, 'border-top-color'),
        schedule: !!c.querySelector('.allm-course-schedule'),
        teaser: teaser && teaser.textContent, teaserBox: box(teaser),
        clamp: cs(teaser, '-webkit-line-clamp'), border: cs(c, 'border-top-width'), radius: cs(c, 'border-top-left-radius'),
        pad: cs(c, 'padding') };
    }),
  };
}"""


def check_rows(browser, base_url):
    """AK-1 (Desktop, Kartenbreite 700 px) und AK-3 (390 px: Rasterkarte
    einspaltig, kein Überlauf) im Browser."""
    for theme in ("light", "dark"):
        attrs = {**ROWS_WIDE, "theme": theme}
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, tv.Mock(config=WIDE, history=v3_history()),
                                 before_goto=freeze)
        try:
            tv.wait_shadow(page, CARD_SEL)
            tv.settle(page, 300)
            d = page.evaluate(ROWS_DOM_JS)
            c = d["cards"][0]
            accent = page.evaluate("() => { const e = document.createElement('i'); e.style.color = "
                                   "getComputedStyle(document.getElementById('anythingllm-embed-widget'))"
                                   ".getPropertyValue('--allmi-accent'); document.body.appendChild(e); "
                                   "const c = getComputedStyle(e).color; e.remove(); return c; }")
            ok = (d["layout"] == "rows" and all(x["row"] and x["links"] == 1 for x in d["cards"])
                  and round(c["card"]["w"]) == 700
                  and c["when"] == "Mo 18:00" and c["whenColor"] == accent and c["whenNum"] == "tabular-nums"
                  and c["title"] == V3[0]["title"] and c["name"] == V3[0]["title"]
                  and c["meta"] == "ab 14.09.2026 · 16 Abende · Realschule · 60 €"
                  and c["badge"] == "buchbar" and c["badgeBorder"] == accent
                  and c["whenBox"]["x"] < c["titleBox"]["x"] < c["badgeBox"]["x"]
                  and abs(c["metaBox"]["x"] - c["titleBox"]["x"]) < 0.5 and c["metaBox"]["y"] > c["titleBox"]["y"]
                  and c["card"]["r"] - c["badgeBox"]["r"] <= 15 and not c["schedule"]
                  and c["titleFs"] == "14px" and c["titleFw"] == "600" and c["metaFs"] == "12px"
                  and c["border"] == "1px" and c["pad"] == "12px 14px")
            record(f"AK-1 Zeilen-Karte: links Zeit (Akzent), Mitte Titel+Meta, rechts „buchbar“, 1 Link ({theme})", ok,
                   json.dumps({k: c[k] for k in ("when", "whenColor", "whenNum", "meta", "badge", "card")}
                              | {"layout": d["layout"], "accent": accent}, ensure_ascii=False))
            t = d["cards"][0]
            record(f"AK-1 Teaser unter der Meta-Zeile, Klammer 2 ({theme})",
                   t["teaser"] == TEASERS_V3[V3[0]["url"]] and t["clamp"] == "2"
                   and t["teaserBox"]["y"] >= t["metaBox"]["y"] + t["metaBox"]["h"] - 0.5,
                   f"clamp {t['clamp']}, Teaser y {t['teaserBox']['y']:.1f} / Meta-Unterkante "
                   f"{t['metaBox']['y'] + t['metaBox']['h']:.1f}")
        finally:
            ctx.close()

    ctx, page = tv.open_page(browser, base_url, {"attrs": ROWS}, tv.Mock(config={}, history=v3_history()),
                             viewport=MOBILE_390, before_goto=freeze)
    try:
        tv.wait_shadow(page, CARD_SEL)
        tv.settle(page, 300)
        d = page.evaluate(ROWS_DOM_JS)
        xs = {round(c["card"]["x"]) for c in d["cards"]}
        ok = (d["layout"] == "rows-narrow" and not any(c["row"] for c in d["cards"])
              and all(c["schedule"] and c["clamp"] == "3" for c in d["cards"]) and len(xs) == 1
              and d["histScroll"][0] <= d["histScroll"][1])
        record("AK-3 390 px: Rasterkarte einspaltig, Teaser bis 3 Zeilen, kein horizontaler Überlauf", ok,
               json.dumps({"layout": d["layout"], "x": sorted(xs), "w": [round(c["card"]["w"]) for c in d["cards"]],
                           "histScroll": d["histScroll"]}))
    finally:
        ctx.close()


ROWS_FIT_JS = """async ([teasers, width]) => { const l = window.__q('.allm-course-list');
  // Kartenbreite über die Listenbreite (eine Spalte) — der ResizeObserver
  // des Widgets sieht dieselbe Breite wie bei einem schmaleren Fenster
  l.style.width = width + 'px';
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  const cards = [...l.querySelectorAll('[data-course-row]')];
  return cards.map((c, i) => { const t = c.querySelector('.allm-course-teaser'); t.textContent = teasers[i];
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    return { w: Math.round(c.getBoundingClientRect().width), tw: Math.round(t.getBoundingClientRect().width),
             words: teasers[i].split(/\\s+/).length, lines: Math.round(t.scrollHeight / lh),
             fits: t.scrollHeight <= t.clientHeight, clamp: getComputedStyle(t).webkitLineClamp }; }); }"""


def check_rows_teaser_fit(browser, base_url):
    """AK-2 rows-teaser-fit: Teaser à 18–20 Wörter passen ohne Kappung —
    bei 700 px Kartenbreite in höchstens 2 Zeilen (Klammer 2), bei 640 und
    480 px (Review-Befund 5: unter 680 px 3 Zeilen) in höchstens 3 Zeilen
    (Klammer 3). Arial-Metrik wie AK-3 des Feinschliffs."""
    hist = v3_history()
    extra = {**FIX["donauYoga"][0], "url": V3[0]["url"].replace("262-", "262-9"), "title": "KI-Basics für den Alltag"}
    hist[1]["courseSources"] = V3 + [extra]
    hist[1]["courseCardsAnnounced"] = 3
    hist[1]["courseTeasers"] = {c["url"]: "x" for c in V3 + [extra]}
    for width, max_lines in ((700, 2), (640, 3), (480, 3)):
        ctx, page = tv.open_page(browser, base_url,
                                 {"attrs": ROWS_WIDE, "css": "#anythingllm-embed-widget { --allm-font: Arial; }"},
                                 tv.Mock(config=WIDE, history=hist), before_goto=freeze)
        try:
            tv.wait_shadow(page, CARD_SEL)
            tv.settle(page, 400)
            d = page.evaluate(ROWS_FIT_JS, [TEASERS_FIT, width])
            ok = (len(d) == 3 and all(18 <= x["words"] <= 20 and x["w"] == width and x["fits"]
                                      and x["lines"] <= max_lines and x["clamp"] == str(max_lines) for x in d))
            record(f"AK-2 rows-teaser-fit: 3 Teaser à 18–20 Wörter bei {width} px ohne Kappung, "
                   f"≤ {max_lines} Zeilen", ok, json.dumps(d))
        finally:
            ctx.close()


PENDING_PROBE_JS = r"""
(() => {
  window.__ph = [];
  const t0 = performance.now();
  const step = () => {
    const s = window.__allmShadow;
    if (s) {
      const cards = [...s.querySelectorAll('[data-course-cards] .allm-course-card')];
      if (cards.length) window.__ph.push({ t: Math.round(performance.now() - t0),
        pending: s.querySelectorAll('[data-teaser-pending]').length,
        teasers: s.querySelectorAll('[data-course-cards] .allm-course-teaser').length,
        text: !!(s.querySelector('.allm-reply, .allm-anything-llm-assistant-message') || {}).textContent,
        h: cards.map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10) });
    }
    if (window.__ph.length < 600) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();
"""


def check_teaser_pending(browser, base_url):
    """AK-4 teaser-pending-height: Platzhalter je Karte (gedämpft, pulsierend),
    nach dem Teaser-Chunk (1.200 ms) steht dort der Teaser, Kartenhöhe vor und
    nach gleich (± 1 px); Raster reserviert 3, Zeilen-Karte 2 Zeilen. AK-5:
    Stream ohne Teaser -> Platzhalter weg."""
    for label, attrs in (("Raster", GRID_WIDE), ("Zeilen", ROWS_WIDE), ("Raster 360 px", ABOVE)):
        viewport = SMALL if "360" in label else None
        cfg_mock = {} if "360" in label else WIDE
        plan = {"events": pending_events(), "delay": 150}

        def before(ctx, page):
            freeze(ctx, page)
            ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan)};")
            ctx.add_init_script(SLOW_STREAM_JS)
            ctx.add_init_script(PENDING_PROBE_JS)

        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, tv.Mock(config=cfg_mock), viewport=viewport,
                                 before_goto=before)
        try:
            tv.wait_shadow(page, "#message-input")
            send(page)
            page.wait_for_function("() => window.__allmShadow.querySelectorAll('[data-teaser-pending]').length >= 2",
                                   timeout=10000)
            # gedämpft = dieselbe Farbe wie die Meta-Zeile (--allmi-text-muted)
            info = page.evaluate("""() => { const p = window.__q('[data-teaser-pending]');
              const muted = getComputedStyle(window.__q('.allm-course-details')).color;
              const cs = getComputedStyle(p);
              return { text: p.textContent, color: cs.color, muted, anim: cs.animationName,
                       dur: cs.animationDuration, iter: cs.animationIterationCount, h: p.getBoundingClientRect().height }; }""")
            record(f"AK-4 Platzhalter „{PENDING_TEXT}“ gedämpft, Puls 1,6 s ({label})",
                   info["text"] == PENDING_TEXT and info["color"] == info["muted"]
                   and info["anim"] == "allm-teaser-pending" and info["dur"] == "1.6s" and info["iter"] == "infinite",
                   json.dumps(info, ensure_ascii=False))
            page.wait_for_function("() => window.__streamLog.length >= %d" % len(plan["events"]), timeout=20000)
            page.wait_for_timeout(600)
            ph = page.evaluate("() => window.__ph")
            before_f = [f for f in ph if f["pending"] > 0]
            after_f = [f for f in ph if f["teasers"] > 0]
            hb = before_f[-1]["h"] if before_f else None
            ha = after_f[0]["h"] if after_f else None
            hend = ph[-1]["h"]
            same = (hb and ha and len(hb) == len(ha) and all(abs(a - b) <= 1 for a, b in zip(hb, ha))
                    and all(abs(a - b) <= 1 for a, b in zip(hb, hend)))
            swap = any(f["pending"] == 0 and f["teasers"] > 0 for f in ph) and not any(
                f["pending"] > 0 and f["teasers"] > 0 for f in ph)
            record(f"AK-4 teaser-pending-height: Teaser ersetzt Platzhalter an Ort und Stelle, Höhe gleich ({label})",
                   bool(same) and swap and len(before_f) > 10,
                   f"vor {hb}, nach {ha}, Ende {hend}, Frames mit Platzhalter {len(before_f)}")
        finally:
            ctx.close()

    # AK-5: Stream ohne Teaser-Chunk -> Platzhalter weg, sobald Text kommt
    ev = pending_events()
    del ev[1]
    plan = {"events": ev, "delay": 150}

    def before2(ctx, page):
        freeze(ctx, page)
        ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan)};")
        ctx.add_init_script(SLOW_STREAM_JS)
        ctx.add_init_script(PENDING_PROBE_JS)

    ctx, page = tv.open_page(browser, base_url, {"attrs": ROWS_WIDE}, tv.Mock(config=WIDE), before_goto=before2)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        page.wait_for_function("() => window.__streamLog.length >= %d" % len(ev), timeout=20000)
        page.wait_for_timeout(500)
        ph = page.evaluate("() => window.__ph")
        n = page.evaluate("() => window.__allmShadow.querySelectorAll('[data-teaser-pending]').length")
        record("AK-5 Stream ohne Teaser: Platzhalter erst sichtbar, am Ende 0 im DOM",
               n == 0 and any(f["pending"] for f in ph), f"am Ende {n}, Frames mit Platzhalter "
               f"{sum(1 for f in ph if f['pending'])}")
    finally:
        ctx.close()

    # reduzierte Bewegung: kein Puls
    plan3 = {"events": pending_events(hold=True), "delay": 150}

    def before3(ctx, page):
        freeze(ctx, page)
        ctx.add_init_script(f"window.__SLOW_STREAM = {json.dumps(plan3)};")
        ctx.add_init_script(SLOW_STREAM_JS)

    ctx, page = tv.open_page(browser, base_url, {"attrs": ABOVE}, tv.Mock(config={}), reduced_motion="reduce",
                             before_goto=before3)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        page.wait_for_function("() => !!window.__q('[data-teaser-pending]')", timeout=10000)
        anim = page.evaluate("() => getComputedStyle(window.__q('[data-teaser-pending]')).animationName")
        record("AK-4 prefers-reduced-motion: Platzhalter ohne Puls", anim == "none", anim)
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--new-states", action="store_true", help="mit --baseline: Referenzen der neuen Zustände")
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            run_pixel(browser, base_url, args.baseline, args.new_states, args.only)
            if not args.baseline:
                check_ak2(browser, base_url)
                check_ak8(browser, base_url)
                check_ak9(browser, base_url)
                check_ak10(browser, base_url)
                check_history_and_compact(browser, base_url)
                check_nak4(browser, base_url)
                check_ak4b(browser, base_url)
                check_marker_passthrough(browser, base_url)
                check_ak4c(browser, base_url)
                check_fallback(browser, base_url)
                check_radius_card(browser, base_url)
                check_v3(browser, base_url)
                check_teaser_20_words(browser, base_url)
                check_rows(browser, base_url)
                check_rows_teaser_fit(browser, base_url)
                check_teaser_pending(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    passed = sum(1 for _, ok, _ in tv.RESULTS if ok)
    summary = [{"key": k, "ok": ok, "detail": d} for k, ok, d in tv.RESULTS]
    (RESULTS_DIR / "summary-course-cards.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"\n{passed}/{len(tv.RESULTS)} Prüfungen bestanden.")
    return 0 if passed == len(tv.RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
