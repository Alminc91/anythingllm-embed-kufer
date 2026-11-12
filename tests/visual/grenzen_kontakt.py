#!/usr/bin/env python3
"""Browser-Messung der Fehlerblase an den Grenzen und des Kontakts für
Besucher (issues/widget-grenzen-kontakt.md, Widget-Teil: AK-7 bis AK-10,
AK-13, AK-15, NAK-3, NAK-4, §8 Prüfmatrix).

Gebautes dist, lokale Testseite (tests/visual/fixtures/widget.html), Server
gemockt wie datenschutz_fenster.py (theme_visual.Mock); POST /stream-chat
antwortet je Frage aus einer Warteschlange: 429 mit errorCode nach dem
Vertrag (tests/fixtures/embedLimitContract.json, Fälle und Texte aus
embedLimitWidgetCases.json), 500, 503 ohne JSON
oder ein SSE-Stream. Je Ansicht (Chatfenster und In der Seite, 1440 x 900
und 390 x 800), Farbschema (hell, dunkel), Sprache (de, en) und mit bzw.
ohne gespeicherte E-Mail für Besucher drei Fragen nacheinander:

  - session_limit, daily_limit, technischer Fehler (500): Wortlaut der Blase
    wörtlich wie die Fixture, Art (data-error-notice), mailto-Link ohne
    Betreff nur mit Adresse (Linktext = Adresse, nichts dahinter), ohne
    Adresse kein Link und kein @; Kontrast Überschrift, Sätze und Link zur
    Fläche der Blase mindestens 4,5:1; Mail-Link mindestens 44 px hoch
    (Trefferfläche, Sollwert §8 mobil, hier in jeder Ansicht); kein
    waagerechter Bildlauf (Seite, Verlauf, Blase), Blase ganz im Fenster
  - Menü der Titelleiste: „E-Mail Support“ nur mit Adresse, Betreff wie
    bisher (layout.js mailSubject)
Einmalig (de, hell, Chatfenster 1440): lange Adresse bricht um ohne
waagerechten Bildlauf (auch 390), ungültige Adresse ohne Link, 503 ohne
JSON und eine normale Antwort danach (Regression: kein Fehlertext).

Aufruf (aus dem Repo, npm run build vorher):

  python3 tests/visual/grenzen_kontakt.py [--dist dist] [--tag neu] [--lang de en] [--themes light dark] [--views …] [--skip-once]

Ergebnis: .test-storage/grenzen-kontakt-<tag>.json, Bilder
.test-storage/grenzen-<tag>-<lang>-<ansicht>-<theme>-<mit|ohne>.png und
grenzen-<tag>-menue-…, Zeilen auf stdout, Ausstieg 1 bei Fehlern oder ohne
Ergebnis.
"""

import argparse
import json
import pathlib
import sys
import urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import datenschutz_fenster as df  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT_DIR = ROOT / ".test-storage"
CONTRACT = json.loads((ROOT / "tests" / "fixtures" / "embedLimitWidgetCases.json").read_text("utf-8"))
RESULTS = []
TAG = "neu"
EMAIL = "info@vhs-beispiel.de"
LONG_EMAIL = "kundenservice.weiterbildung.anmeldung@volkshochschule-musterstadt-landkreis.de"

VIEWS = [
    ("fenster-1440", "bubble", 1440, 900),
    ("seite-1440", "inline", 1440, 900),
    ("mobil-fenster-390", "bubble", 390, 800),
    ("mobil-seite-390", "inline", 390, 800),
]
LIMITS = {c["notice"]: c for c in CONTRACT["limitResponses"]}
SERVER_ERROR = next(c for c in CONTRACT["otherErrors"] if c["status"] == 500 and "errorCode" not in c["body"])
# Fragen je Seite: (Art der Blase, Antwort des Servers)
SEQUENCE = [
    ("session_limit", ("json", 429, LIMITS["session_limit"]["body"])),
    ("daily_limit", ("json", 429, LIMITS["daily_limit"]["body"])),
    ("technical", ("json", 500, SERVER_ERROR["body"])),
]
SUBJECT = {
    "de": 'Anfrage zum Chatbot "{name}" von {host}',
    "en": 'Question about the chatbot "{name}" from {host}',
}
NAME = "vhs Beispiel"


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(f"[{'OK ' if ok else 'FAIL'}] {key}: {detail}", flush=True)


def expected(lang, kind, email):
    t = CONTRACT["texts"][lang][kind]
    return t["withEmail"].replace("<E-Mail>", email) if email else t["withoutEmail"]


class LimitMock(tv.Mock):
    """Mock mit Warteschlange für /stream-chat: ("json", status, body),
    ("html", status) oder ("sse", [Ereignisse])."""

    def __init__(self, config, queue):
        super().__init__(config=config)
        self.queue = list(queue)
        self.asked = 0

    def handle(self, route):
        path = urllib.parse.urlparse(route.request.url).path
        if path.endswith("/stream-chat"):
            self.asked += 1
            item = self.queue.pop(0) if self.queue else ("json", 500, SERVER_ERROR["body"])
            if item[0] == "json":
                return route.fulfill(status=item[1], body=json.dumps(item[2]), content_type="application/json")
            if item[0] == "html":
                return route.fulfill(status=item[1], body="<html><body>Bad Gateway</body></html>", content_type="text/html")
            body = "".join(f"data: {json.dumps(ev)}\n\n" for ev in item[1])
            return route.fulfill(status=200, body=body, headers={"Content-Type": "text/event-stream"})
        return super().handle(route)


MEASURE_JS = r"""
() => {
  const root = window.__allmShadow;
  const q = window.__q;
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
      right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const notices = [...root.querySelectorAll('[data-error-notice]')];
  const n = notices[notices.length - 1];
  const hist = q('#chat-history');
  const win = q('#anything-llm-chat') || (hist && hist.closest('[id]'));
  const out = {
    count: notices.length,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    histOverflow: hist ? hist.scrollWidth > hist.clientWidth + 1 : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    window: r(win),
  };
  if (!n) return out;
  const a = n.querySelector('a');
  const title = n.querySelector('span');
  const ps = [...n.querySelectorAll('p')];
  Object.assign(out, {
    kind: n.getAttribute('data-error-notice'),
    text: n.textContent.replace(/\s+/g, ' ').trim(),
    bg: getComputedStyle(n).backgroundColor,
    title: { color: getComputedStyle(title).color, size: getComputedStyle(title).fontSize },
    ps: ps.map((p) => ({ color: getComputedStyle(p).color, size: getComputedStyle(p).fontSize })),
    rect: r(n),
    overflow: n.scrollWidth > n.clientWidth + 1,
    foreign: n.querySelectorAll('img, b, script, iframe').length,
    link: a ? { href: a.getAttribute('href'), text: a.textContent, rect: r(a), color: getComputedStyle(a).color,
      deco: getComputedStyle(a).textDecorationLine, after: (a.nextSibling && a.nextSibling.textContent) || '' } : null,
  });
  return out;
}
"""

MENU_JS = r"""
() => {
  const all = [...window.__allmShadow.querySelectorAll('a[href^="mailto:"]')]
    .filter((e) => !e.closest('[data-error-notice]'));
  return all.map((e) => ({ href: e.getAttribute('href'), text: e.textContent.trim() }));
}
"""


def send(page, text):
    page.evaluate("() => window.__q('#message-input').focus()")
    page.keyboard.type(text)
    page.keyboard.press("Enter")


def wait_notices(page, count, timeout=10000):
    page.wait_for_function(
        "(n) => window.__allmShadow && window.__allmShadow.querySelectorAll('[data-error-notice]').length >= n",
        arg=count, timeout=timeout)
    page.evaluate("() => { const h = window.__q('#chat-history'); if (h) h.scrollTop = h.scrollHeight; }")
    tv.settle(page, 350)


def contrast(fg, bg):
    return df.contrast_of(fg, bg)


def check_notice(st, tag, lang, kind, email, mobile):
    exp = expected(lang, kind, email)
    record(f"Wortlaut und Art ({tag} {kind})", st.get("kind") == kind and st.get("text") == exp,
           {"kind": st.get("kind"), "text": st.get("text"), "soll": exp})
    link = st.get("link")
    if email:
        ok = (link is not None and link["href"] == f"mailto:{email}" and link["text"] == email
              and link["after"].strip() == "" and "underline" in (link["deco"] or ""))
        record(f"mailto ohne Betreff, Linktext = Adresse, nichts dahinter ({tag} {kind})", ok, link)
        if link:
            record(f"Trefferfläche Mail-Link >= 44 px ({tag} {kind})", link["rect"]["h"] >= 44,
                   {"h": link["rect"]["h"], "w": link["rect"]["w"], "mobil": mobile})
            c = contrast(link["color"], st["bg"])
            record(f"Kontrast Mail-Link >= 4,5 ({tag} {kind})", c >= 4.5, {"kontrast": c, "fg": link["color"], "bg": st["bg"]})
    else:
        record(f"ohne Adresse kein Link, kein @ ({tag} {kind})", link is None and "@" not in (st.get("text") or ""),
               {"link": link, "text": st.get("text")})
    cs = [contrast(st["title"]["color"], st["bg"])] + [contrast(p["color"], st["bg"]) for p in st["ps"]]
    record(f"Kontrast Text >= 4,5 ({tag} {kind})", min(cs) >= 4.5, {"kontrast": cs, "bg": st["bg"]})
    vw = st["viewport"]["w"]
    inside = st["rect"]["x"] >= 0 and st["rect"]["right"] <= vw + 0.5
    record(f"kein waagerechter Bildlauf, Blase im Fenster ({tag} {kind})",
           not st["hScroll"] and not st["histOverflow"] and not st["overflow"] and inside,
           {"seite": st["hScroll"], "verlauf": st["histOverflow"], "blase": st["overflow"], "rect": st["rect"], "vw": vw})
    record(f"kein HTML in der Blase ({tag} {kind})", st["foreign"] == 0, {"elemente": st["foreign"]})


def check_menu(page, tag, lang, email, shot):
    page.evaluate("() => { const b = window.__q('button[aria-label=Optionen], button[aria-label=Options]'); b && b.click(); }")
    tv.settle(page, 300)
    links = page.evaluate(MENU_JS)
    page.screenshot(path=str(shot))
    if email:
        subject = SUBJECT[lang].format(name=NAME, host="127.0.0.1")
        want = f"mailto:{email}?subject={urllib.parse.quote(subject, safe='')}"
        ok = len(links) == 1 and links[0]["href"].startswith(want + "&body=")
        record(f"Menü: E-Mail Support mit Betreff wie bisher ({tag})", ok, {"links": links, "soll_beginn": want})
    else:
        record(f"Menü: kein Kontakt-Link ohne Adresse ({tag})", links == [], {"links": links})
    page.evaluate("() => { const b = window.__q('button[aria-label=Optionen], button[aria-label=Options]'); b && b.click(); }")


def check_view(browser, base_url, name, display, width, height, theme, lang, with_email):
    which = "mit" if with_email else "ohne"
    tag = f"{lang} {name} {theme} {which}"
    email = EMAIL if with_email else None
    config = {**df.CONFIG, "brandText": NAME, **({"supportEmail": EMAIL} if with_email else {})}
    mock = LimitMock(config, [s[1] for s in SEQUENCE])
    ctx, page = df.open_view(browser, base_url, display, width, height, theme, lang, mock=mock)
    try:
        tv.wait_shadow(page, "#message-input")
        for i, (kind, _resp) in enumerate(SEQUENCE):
            send(page, f"Frage {i + 1}")
            wait_notices(page, i + 1)
            st = page.evaluate(MEASURE_JS)
            check_notice(st, tag, lang, kind, email, width < 768)
        record(f"eine Blase je Frage, Frage wieder möglich ({tag})", st["count"] == len(SEQUENCE) and mock.asked == len(SEQUENCE),
               {"blasen": st["count"], "anfragen": mock.asked})
        page.screenshot(path=str(OUT_DIR / f"grenzen-{TAG}-{lang}-{name}-{theme}-{which}.png"))
        check_menu(page, tag, lang, email, OUT_DIR / f"grenzen-{TAG}-menue-{lang}-{name}-{theme}-{which}.png")
        # bekannt und unverändert seit vor 8.2: je Fehlerantwort ein
        # unbehandeltes Promise (streamChat lehnt nach handleChat ab,
        # ChatContainer fängt es nicht; pageerror „Error“) sowie die
        # Meldungen ANYTHING_LLM_CHAT_WIDGET_ERROR und die des Browsers zum
        # Status der Antwort
        all_errs = tv.errors_of(page)
        known = [e for e in all_errs if e == "Error"]
        errs = [e for e in all_errs
                if e != "Error" and "ANYTHING_LLM_CHAT_WIDGET_ERROR" not in e
                and "status of 429" not in e and "status of 500" not in e]
        record(f"Konsole ohne weitere Fehler ({tag})", not errs and len(known) <= len(SEQUENCE),
               {"weitere": errs[:3], "bekannt_unbehandelt": len(known)})
    finally:
        ctx.close()


def check_once(browser, base_url):
    # lange Adresse: Umbruch ohne waagerechten Bildlauf (1440 und 390)
    for name, display, width, height in (VIEWS[0], VIEWS[3]):
        tag = f"de {name} light lange Adresse"
        mock = LimitMock({**df.CONFIG, "supportEmail": LONG_EMAIL}, [SEQUENCE[1][1]])
        ctx, page = df.open_view(browser, base_url, display, width, height, "light", "de", mock=mock)
        try:
            tv.wait_shadow(page, "#message-input")
            send(page, "Frage")
            wait_notices(page, 1)
            st = page.evaluate(MEASURE_JS)
            check_notice(st, tag, "de", "daily_limit", LONG_EMAIL, width < 768)
            page.screenshot(path=str(OUT_DIR / f"grenzen-{TAG}-lange-adresse-{name}.png"))
        finally:
            ctx.close()
    # ungültige Adresse, 503 ohne JSON, danach eine normale Antwort
    tag = "de fenster-1440 light ungültig"
    stream = [
        {"uuid": "a-1", "type": "textResponseChunk", "textResponse": "Ja, es gibt Yogakurse.", "sources": [], "close": False},
        {"uuid": "a-1", "type": "textResponseChunk", "textResponse": "", "sources": [], "close": True},
        {"uuid": "a-1", "type": "finalizeResponseStream", "chatId": 11, "close": True},
    ]
    mock = LimitMock({**df.CONFIG, "supportEmail": "kontakt(at)vhs-beispiel.de"},
                     [SEQUENCE[0][1], ("html", 503), ("sse", stream)])
    ctx, page = df.open_view(browser, base_url, "bubble", 1440, 900, "light", "de", mock=mock)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page, "Frage 1")
        wait_notices(page, 1)
        check_notice(page.evaluate(MEASURE_JS), tag, "de", "session_limit", None, False)
        send(page, "Frage 2")
        wait_notices(page, 2)
        check_notice(page.evaluate(MEASURE_JS), f"{tag} 503", "de", "technical", None, False)
        send(page, "Frage 3")
        page.wait_for_function("() => (window.__q('#chat-history') || {}).textContent?.includes('Ja, es gibt Yogakurse.')",
                               timeout=10000)
        tv.settle(page, 400)
        st = page.evaluate(MEASURE_JS)
        record(f"normale Antwort nach Fehlern ohne Fehlerblase ({tag})", st["count"] == 2, {"blasen": st["count"]})
        page.screenshot(path=str(OUT_DIR / f"grenzen-{TAG}-ungueltig-regression.png"))
        check_menu(page, tag, "de", None, OUT_DIR / f"grenzen-{TAG}-menue-ungueltig.png")
    finally:
        ctx.close()


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--tag", default="neu")
    ap.add_argument("--lang", nargs="+", default=["de", "en"])
    ap.add_argument("--themes", nargs="+", default=["light", "dark"])
    ap.add_argument("--views", nargs="+", default=[v[0] for v in VIEWS])
    ap.add_argument("--skip-once", action="store_true")
    return ap.parse_args()


def main():
    args = parse_args()
    global TAG
    TAG = args.tag
    OUT_DIR.mkdir(exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in args.lang:
            for name, display, width, height in VIEWS:
                if name not in args.views:
                    continue
                for theme in args.themes:
                    for with_email in (True, False):
                        try:
                            check_view(browser, base_url, name, display, width, height, theme, lang, with_email)
                        except Exception as e:  # weiter prüfen, Fehler festhalten
                            record(f"Ablauf {lang} {name} {theme} {'mit' if with_email else 'ohne'}", False,
                                   str(e).splitlines()[0])
        if not args.skip_once:
            try:
                check_once(browser, base_url)
            except Exception as e:
                record("Ablauf einmalige Prüfungen", False, str(e).splitlines()[0])
        browser.close()
    srv.shutdown()
    out = OUT_DIR / f"grenzen-kontakt-{TAG}.json"
    out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(bad)}/{len(RESULTS)} ok -> {out}")
    sys.exit(1 if bad or not RESULTS else 0)


if __name__ == "__main__":
    main()
