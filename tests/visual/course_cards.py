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
SMALL = {"width": 360, "height": 740}
CARD_SEL = "[data-course-cards]"

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
            await new Promise((r) => setTimeout(r, plan.delay));
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
    ]


def shoot(browser, base_url, case, out_path):
    name, cfg, m, sel, action, viewport, _ = case
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport, before_goto=freeze)
    try:
        tv.wait_shadow(page, sel)
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
        if only and name not in only:
            continue
        if baseline:
            if (origin == "new") != new_states:
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
        ref = BASELINE_DIR / f"{name}.png"
        if not ref.exists():
            record(f"PIX {name}", False, "Referenz fehlt (--baseline)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"course-cards-{name}-diff.png")
        key = "AK-1" if origin == "main" else "REG"
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
    const a = c.querySelector("a");
    const r = c.getBoundingClientRect();
    const tr = (a || c).getBoundingClientRect();
    return {
      text: c.innerText,
      title: a ? a.textContent : null,
      href: a ? a.getAttribute("href") : null,
      target: a ? a.getAttribute("target") : null,
      rel: a ? a.getAttribute("rel") : null,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
      titleH: tr.height, titleLH: parseFloat(cs(a || c, "line-height")),
      bg: cs(c, "background-color"), color: cs(c, "color"),
      border: cs(c, "border-top-color"), borderLeft: cs(c, "border-left-color"),
      titleColor: a ? cs(a, "color") : null,
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
