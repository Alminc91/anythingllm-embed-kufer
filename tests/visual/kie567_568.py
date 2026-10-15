#!/usr/bin/env python3
"""Browser-Prüfung KIE-567 (Antworten mit Kursen) und KIE-568 (Willkommens-
blasen je Gerät) am gebauten dist, Server gemockt (tests/visual/theme_visual).

KIE-567: Server-Config courseCards "auto"|"off", courseCardsPosition
"above"|"below"; Antwort im Kurz-Stil (Kurse per Marker angekündigt, Text
ohne Links) bzw. bei "off" klassisch mit Links. Geprüft: Reihenfolge Karten/
Text/Folgefragen in Chatblase (Desktop, Handy) und Inline, Frage nach der
Antwort noch im Blick, Script-Attribut überstimmt den Server nicht.
KIE-568: welcomeBubblesDesktop/-Mobile off|first|every bei 1440 und 390 px:
Blasen sichtbar ja/nein, localStorage/sessionStorage, Unterseite im selben
Tab, neuer Tab, Script-Attribut, Bestand ohne Schlüssel, Öffnen/Schließen.

Aufruf (nach npm run build):  python3 tests/visual/kie567_568.py [--out DIR]
Screenshots: DIR (Standard .test-storage/kie567-568/), Ergebnis summary.json.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import course_cards as cc  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BY = cc.BY
DESKTOP = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 844}
QUESTION = "Gibt es Yogakurse am Abend?"
FU = ["Gibt es Kurse am Wochenende?", "Was kostet ein Kurs?"]
ANNOUNCED = [BY[0], BY[6], BY[9]]
TEASERS = {
    BY[0]["url"]: "Für Einsteiger, die sanfte Haltungen und bewusste Atmung in ruhigem Tempo üben möchten.",
    BY[6]["url"]: "Für Geübte, die ihre Praxis mit kräftigenden Abfolgen vertiefen möchten.",
    BY[9]["url"]: "Zum Abschalten am Freitagabend, mit viel Ruhe und leichten Übungen.",
}
SHORT = "Ja, drei Yogakurse am Abend passen: einer zum sanften Einstieg, einer zum Vertiefen und einer zum Entspannen am Wochenende."
CLASSIC = (
    "Ja, abends gibt es passende Yogakurse:\n\n"
    + "\n".join(f"{i + 1}. {cc.md(c, '**' + c['title'] + '**')}" for i, c in enumerate(ANNOUNCED))
    + "\n\nAlle Kurse finden abends statt."
)
RESULTS = []
OUT = ROOT / ".test-storage" / "kie567-568"


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(("OK   " if ok else "FAIL ") + key + ": " + json.dumps(detail, ensure_ascii=False)[:300])


def cards_events(uuid="u-1"):
    ev = [
        {"uuid": uuid, "type": "courseSources", "courseSources": ANNOUNCED, "close": False, "error": False},
        {"uuid": uuid, "type": "courseTeasers", "teasers": TEASERS, "close": False, "error": False},
    ]
    size = len(SHORT) // 3 + 1
    ev += [{"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": SHORT[i:i + size]}
           for i in range(0, len(SHORT), size)]
    ev[-1]["close"] = True
    ev.append({"uuid": uuid, "type": "followUps", "followUps": FU, "close": False, "error": False})
    ev.append({"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712,
               "courseCardsAnnounced": len(ANNOUNCED)})
    return ev


def classic_events(uuid="u-1"):
    ev = [{"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": CLASSIC}]
    ev[-1]["close"] = True
    ev.append({"uuid": uuid, "type": "followUps", "followUps": FU, "close": False, "error": False})
    ev.append({"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712})
    return ev


ORDER_JS = r"""
() => {
  const last = (sel) => { const l = window.__allmShadow.querySelectorAll(sel); return l[l.length - 1] || null; };
  const text = last('.allm-anything-llm-assistant-message');
  const cards = last('[data-course-cards]');
  const pills = window.__q('#anything-llm-follow-ups');
  const pos = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
  const hist = window.__q('#chat-history');
  const users = window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message');
  const q = users[users.length - 1];
  const hr = hist.getBoundingClientRect();
  const qr = q ? q.getBoundingClientRect() : null;
  return {
    cards: cards ? cards.querySelectorAll('.allm-course-card').length : 0,
    cardsPosition: cards ? cards.getAttribute('data-position') : null,
    textBeforeCards: pos(text, cards),
    cardsBeforeText: pos(cards, text),
    cardsBeforePills: pos(cards, pills),
    textBeforePills: pos(text, pills),
    pills: !!pills,
    links: text ? [...text.querySelectorAll('a')].map((a) => a.getAttribute('href')) : [],
    teaser: cards ? cards.textContent.includes('sanfte Haltungen') : false,
    questionVisible: !!qr && qr.top >= hr.top - 1 && qr.top < hr.bottom,
    scroll: { top: Math.round(hist.scrollTop), height: hist.scrollHeight, client: hist.clientHeight },
    pillsVisible: !!pills && pills.getBoundingClientRect().bottom <= hr.bottom + 1,
    docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}
"""


def open_chat(browser, base_url, config, events, viewport, attrs=None, inline=False):
    m = tv.Mock(config=config, stream=events)
    cfg = {"attrs": {**tv.BASE_ATTRS, **(attrs or {})}}
    if inline:
        cfg["inline"] = True
    else:
        cfg["attrs"]["open-on-load"] = "on"
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport, before_goto=cc.freeze)
    if inline:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        page.keyboard.type(QUESTION)
        page.keyboard.press("Enter")
    else:
        tv.wait_shadow(page, "#message-input")
        cc.send(page, QUESTION)
    page.wait_for_function("() => !!window.__q('#anything-llm-follow-ups')", timeout=15000)
    tv.settle(page, 1200)
    return ctx, page


def kie567(browser, base_url):
    cases = [
        ("567-above-desktop", {"courseCards": "auto", "courseCardsPosition": "above"}, cards_events(), DESKTOP, None, False),
        ("567-below-desktop", {"courseCards": "auto", "courseCardsPosition": "below"}, cards_events(), DESKTOP, None, False),
        ("567-below-phone", {"courseCards": "auto", "courseCardsPosition": "below"}, cards_events(), PHONE, None, False),
        ("567-below-inline", {"courseCards": "auto", "courseCardsPosition": "below", "displayMode": "inline"},
         cards_events(), DESKTOP, None, True),
        ("567-off-desktop", {"courseCards": "off", "courseCardsPosition": "above"}, classic_events(), DESKTOP, None, False),
        ("567-off-inline", {"courseCards": "off", "courseCardsPosition": "below", "displayMode": "inline"},
         classic_events(), DESKTOP, None, True),
        # Script-Attribut verlangt Karten, Server sagt Nur Text: Server gewinnt
        ("567-off-script-auto", {"courseCards": "off", "courseCardsPosition": "above"}, classic_events(), DESKTOP,
         {"course-cards": "auto", "course-cards-position": "above"}, False),
        # Bestand: Server ohne die Schlüssel -> Karten zuerst
        ("567-legacy-default", {}, cards_events(), DESKTOP, None, False),
    ]
    for name, config, events, vp, attrs, inline in cases:
        ctx, page = open_chat(browser, base_url, config, events, vp, attrs, inline)
        try:
            info = page.evaluate(ORDER_JS)
            page.screenshot(path=str(OUT / f"{name}.png"))
            errs = tv.errors_of(page)
            if "off" in name:
                ok = (info["cards"] == 0 and len(info["links"]) == 3 and info["pills"] and info["textBeforePills"]
                      and info["pillsVisible"])
            elif "below" in name:
                ok = (info["cards"] == 3 and info["cardsPosition"] == "below" and info["textBeforeCards"]
                      and info["cardsBeforePills"] and info["teaser"] and info["questionVisible"])
            else:
                ok = (info["cards"] == 3 and info["cardsPosition"] == "above" and info["cardsBeforeText"]
                      and info["textBeforePills"] and info["questionVisible"])
            ok = ok and not info["docOverflow"] and not errs
            record(name, ok, {**info, "errors": errs})
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# KIE-568
# ---------------------------------------------------------------------------
KEY_JS = "() => { const k = Object.keys(localStorage).concat(Object.keys(sessionStorage)).find((x) => x.startsWith('anythingllm-embed-bubbles-dismissed')); return { local: k ? localStorage.getItem(k) : null, session: k ? sessionStorage.getItem(k) : null }; }"
STATE_JS = "() => { const b = window.__q('[data-welcome-bubbles]'); return { bubbles: !!b, mode: b ? b.getAttribute('data-welcome-bubbles') : null, button: !!window.__q('#anything-llm-embed-chat-button') }; }"


def load_button(page, base_url, cfg):
    page.goto(f"{base_url}/tests/visual/fixtures/widget.html?c=" + __import__("urllib.parse").parse.quote(json.dumps(cfg)))
    tv.wait_shadow(page, "#anything-llm-embed-chat-button")
    tv.settle(page, 900)
    return {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}


def bubble_ctx(browser, base_url, config, viewport, attrs=None):
    m = tv.Mock(config=config)
    cfg = {"attrs": {**tv.BASE_ATTRS, **(attrs or {})}}
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport)
    tv.wait_shadow(page, "#anything-llm-embed-chat-button")
    tv.settle(page, 900)
    return ctx, page, cfg


def kie568(browser, base_url):
    both = lambda d, mo: {"welcomeBubblesDesktop": d, "welcomeBubblesMobile": mo}  # noqa: E731

    # 1) Aus am Desktop, Handy beim ersten Besuch
    for vp, label, want in [(DESKTOP, "1440", False), (PHONE, "390", True)]:
        ctx, page, cfg = bubble_ctx(browser, base_url, both("off", "first"), vp)
        st = {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}
        page.screenshot(path=str(OUT / f"568-desktop-off-mobile-first-{label}.png"))
        record(f"568-off/first-{label}", st["bubbles"] == want and st["button"] and st["local"] is None
               and st["session"] is None, st)
        ctx.close()

    # 2) Beim ersten Besuch (localStorage): ohne Interaktion wieder, nach X nie mehr
    for vp, label in [(DESKTOP, "1440"), (PHONE, "390")]:
        ctx, page, cfg = bubble_ctx(browser, base_url, both("first", "first"), vp)
        s1 = {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}
        page.screenshot(path=str(OUT / f"568-first-{label}.png"))
        s2 = load_button(page, base_url, cfg)  # Unterseite, keine Interaktion
        page.evaluate("() => window.__q('[aria-label=\"Close all chat bubbles\"]').click()")
        page.wait_for_timeout(300)
        s3 = {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}
        p2 = ctx.new_page()  # neuer Tab
        s4 = load_button(p2, base_url, cfg)
        ok = (s1["bubbles"] and s1["mode"] == "first" and s1["local"] is None and s2["bubbles"]
              and not s3["bubbles"] and s3["local"] and json.loads(s3["local"]).get("manuallyDismissed")
              and not s4["bubbles"])
        record(f"568-first-{label}", ok, {"start": s1, "unterseite": s2, "nachX": s3, "neuerTab": s4})
        ctx.close()

    # 3) Bei jedem Besuch (sessionStorage): Unterseite nein, neuer Tab ja
    for vp, label in [(DESKTOP, "1440"), (PHONE, "390")]:
        ctx, page, cfg = bubble_ctx(browser, base_url, both("every", "every"), vp)
        s1 = {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}
        page.screenshot(path=str(OUT / f"568-every-{label}.png"))
        s2 = load_button(page, base_url, cfg)  # Unterseite im selben Tab
        p2 = ctx.new_page()  # neuer Tab = erneuter Besuch
        s3 = load_button(p2, base_url, cfg)
        # Chat öffnen und schließen (Regression)
        p2.evaluate("() => window.__q('#anything-llm-embed-chat-button').click()")
        tv.wait_shadow(p2, "#message-input")
        opened = p2.evaluate("() => { const c = window.__q('#anything-llm-chat'); return !!c && c.getBoundingClientRect().height > 0; }")
        ok = (s1["bubbles"] and s1["mode"] == "every" and s1["local"] is None and s1["session"]
              and json.loads(s1["session"]).get("shown") and not s2["bubbles"] and s3["bubbles"] and opened)
        record(f"568-every-{label}", ok, {"start": s1, "unterseite": s2, "neuerTab": s3, "chatOffen": opened})
        ctx.close()

    # 4) Script-Attribut kann den Server-Wert nicht aushebeln
    ctx, page, cfg = bubble_ctx(browser, base_url, both("off", "off"), DESKTOP,
                                attrs={"welcome-bubbles-desktop": "every", "display-chatbot-bubbles": "true"})
    st = page.evaluate(STATE_JS)
    record("568-script-attr", not st["bubbles"] and st["button"], st)
    ctx.close()

    # 5) Bestand ohne neue Schlüssel: wie bisher (erster Besuch, Standardblasen)
    ctx, page, cfg = bubble_ctx(browser, base_url, {}, DESKTOP)
    st = {**page.evaluate(STATE_JS), **page.evaluate(KEY_JS)}
    page.screenshot(path=str(OUT / "568-legacy-1440.png"))
    record("568-legacy", st["bubbles"] and st["mode"] == "first" and st["local"] is None and st["session"] is None, st)
    # Blase anklicken öffnet den Chat und merkt chatOpened (bisherige Logik)
    page.evaluate("() => window.__q('[data-welcome-bubbles]').click()")
    tv.wait_shadow(page, "#message-input")
    after = page.evaluate(KEY_JS)
    page.screenshot(path=str(OUT / "568-legacy-open-1440.png"))
    record("568-legacy-open", after["local"] and json.loads(after["local"]).get("chatOpened"), after)
    ctx.close()


def main():
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    OUT = pathlib.Path(args.out)
    OUT.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(ROOT / "dist")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            kie567(browser, base_url)
            kie568(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()
    (OUT / "summary.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
    failed = [r["key"] for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} ok" + (f", FAIL: {failed}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
