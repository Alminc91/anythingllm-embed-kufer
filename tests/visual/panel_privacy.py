#!/usr/bin/env python3
"""Playwright-Tests: Panel-Optik (Wunschfragen als Pillen, Begrüßung als Blase,
Kopfzeile mit Untertitel/Online-Punkt) und einmaliger Datenschutz-Hinweis
(data-suggestion-style / -greeting-style / -assistant-subtitle / -online-dot /
-privacy-notice …).

Einrichtung wie tests/visual/theme_visual.py (requirements.txt + chromium).

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenzen der NEUEN Zustände (gibt es auf main nicht) aus diesem Branch,
  #    nur fehlende Dateien, bestehende werden nie überschrieben
  python3 tests/visual/panel_privacy.py --baseline --new-states [--only panel-pills …]

  # 2) Prüfen (npm run build vorher)
  python3 tests/visual/panel_privacy.py

Der unveränderte Standard (ohne die neuen Attribute) wird von den
Bestandssuiten geprüft (theme_visual.py, inline_input.py, overlay.py,
course_cards.py: Bestands-Referenzen 0,0 %). Alle Aufrufe an praesentation
werden gemockt; stream-chat-Anfragen werden gezählt.
Ergebnisse: tests/visual/results/panel-*.png, summary-panel-privacy.json.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import inline_input as ii  # noqa: E402  (CountingMock, Hilfen)
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BASELINE_DIR = tv.BASELINE_DIR
RESULTS_DIR = tv.RESULTS_DIR
record = tv.record

MSGS = "Spanisch A1,Yoga,KI-Basics,Töpfern"
CFG = {k: v for k, v in tv.PRAES_CONFIG.items() if k != "defaultMessages"}
PANEL = {
    "suggestion-style": "pills",
    "greeting-style": "bubble",
    "assistant-subtitle": "durchsucht 1.243 Kurse",
    "online-dot": "true",
    "brand-text": "KI-Kursberater",
    "assistant-name": "KI-Kursberater",
    "default-messages": MSGS,
}
OPEN = {**tv.BASE_ATTRS, "open-on-load": "on"}
PILLS = {**OPEN, **PANEL}
PRIVACY = {**OPEN, "privacy-notice": "modal", "privacy-url": "https://example.org/datenschutz",
           "default-messages": MSGS}
PRIVACY_BUBBLE = {**PILLS, "privacy-notice": "bubble", "privacy-url": "https://example.org/datenschutz"}
DISCLAIMER = {**OPEN, "disclaimer": "footer", "default-messages": MSGS}
INLINE_PANEL = {**tv.BASE_ATTRS, "display-mode": "inline", "inline-start-state": "expanded", **PANEL}
BAR_PRIVACY = {**ii.INPUT, "privacy-notice": "modal"}
TEN = ",".join(f"Wunschfrage Nummer {i + 1}" for i in range(10))
SMALL = {"width": 360, "height": 740}
ACK_KEY = f"allm-privacy-ack-{tv.EMBED_ID}"


def mock(**k):
    k.setdefault("config", CFG)
    k.setdefault("stream", ii.STREAM)
    return ii.CountingMock(**k)


# (name, cfg, mock, wait-selector, viewport)
def pixel_cases():
    return [
        ("panel-pills", {"attrs": PILLS}, mock(), "#anything-llm-suggestion-pills", None),
        ("panel-pills-dark", {"attrs": {**PILLS, "theme": "dark"}}, mock(), "#anything-llm-suggestion-pills", None),
        ("panel-pills-inline", {"attrs": INLINE_PANEL, "inline": True}, mock(), "#anything-llm-suggestion-pills",
         None),
        ("panel-pills-text", {"attrs": {**OPEN, "suggestion-style": "pills", "default-messages": MSGS}}, mock(),
         "#anything-llm-suggestion-pills", None),
        ("panel-pills-mobile", {"attrs": {**PILLS, "default-messages": TEN}}, mock(),
         "#anything-llm-suggestion-pills", tv.MOBILE),
        ("privacy-modal", {"attrs": PRIVACY}, mock(), "#anything-llm-privacy-notice", None),
        ("privacy-modal-dark", {"attrs": {**PRIVACY, "theme": "dark"}}, mock(), "#anything-llm-privacy-notice",
         None),
        ("privacy-modal-mobile", {"attrs": PRIVACY}, mock(), "#anything-llm-privacy-notice", tv.MOBILE),
        ("privacy-bubble", {"attrs": PRIVACY_BUBBLE}, mock(), "#anything-llm-bubble-privacy", None),
        ("disclaimer-footer", {"attrs": DISCLAIMER}, mock(), "#anything-llm-ai-disclaimer", None),
    ]


def shoot(browser, base_url, case, out_path):
    name, cfg, m, sel, viewport = case
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport)
    try:
        tv.wait_shadow(page, sel)
        tv.settle(page)
        page.mouse.move(0, 0)
        # Fokus raus (Fokusring/Cursor nicht deterministisch)
        page.evaluate("() => window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur()")
        page.wait_for_timeout(100)
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return tv.errors_of(page)
    finally:
        ctx.close()


def run_pixel(browser, base_url, baseline, new_states, only=None):
    for case in pixel_cases():
        name = case[0]
        if only and name not in only:
            continue
        if baseline:
            if not new_states:
                continue  # alle Zustände sind neu (Referenz aus diesem Branch)
            out = BASELINE_DIR / f"{name}.png"
            if out.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            errs = shoot(browser, base_url, case, out)
            print(f"[BASE] {name} -> {out.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        out = RESULTS_DIR / f"panel-{name}.png"
        errs = shoot(browser, base_url, case, out)
        ref = BASELINE_DIR / f"{name}.png"
        if not ref.exists():
            record(f"REG {name}", False, "keine Referenz (erst --baseline --new-states laufen lassen)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"panel-{name}.diff.png")
        record(f"REG {name}", ratio <= tv.MAX_DIFF_RATIO and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""))


# ---------------------------------------------------------------------------
# Funktionsprüfungen
# ---------------------------------------------------------------------------
PILL_PROBE = """() => {
  const wrap = window.__q('#anything-llm-suggestion-pills');
  const win = window.__q('#anything-llm-chat').getBoundingClientRect();
  return [...wrap.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { text: b.textContent, h: r.height, top: Math.round(r.top), left: r.left, right: r.right,
             winLeft: win.left, winRight: win.right, border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
             radius: parseFloat(cs.borderTopLeftRadius) };
  });
}"""


def check_pills(browser, base_url):
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-suggestion-pills")
        tv.settle(page, 400)
        pills = page.evaluate(PILL_PROBE)
        bars = page.evaluate("() => window.__allmShadow.querySelectorAll('.msg-suggestion').length")
        ok = (len(pills) == 4 and [p["text"] for p in pills] == MSGS.split(",") and bars == 0
              and all(p["h"] <= 34 and p["border"] == "1px solid" and p["radius"] >= p["h"] / 2 for p in pills))
        record("AK-2 vier Pillen (≤ 34 px, 1px Rand, voll gerundet)", ok,
               json.dumps([{k: p[k] for k in ("text", "h", "border", "radius")} for p in pills], ensure_ascii=False))
        page.evaluate("() => [...window.__q('#anything-llm-suggestion-pills').querySelectorAll('button')][1].click()")
        ii.wait_user_and_token(page, "Yoga")
        sent = [r.get("message") for r in m.stream_requests]
        record("AK-2 Klick auf Pille sendet die Frage", sent == ["Yoga"], f"stream-chat: {sent}")
        st = page.evaluate("""() => ({
          bubble: !!window.__q('#anything-llm-greeting-bubble'),
          sub: window.__q('#anything-llm-header-subtitle') && window.__q('#anything-llm-header-subtitle').textContent })""")
        record("AK-3 nach dem Senden: Verlauf statt Begrüßung", not st["bubble"], json.dumps(st, ensure_ascii=False))
    finally:
        ctx.close()


def check_pills_wrap(browser, base_url, viewport, key):
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**PILLS, "default-messages": TEN}}, mock(),
                             viewport=viewport)
    try:
        tv.wait_shadow(page, "#anything-llm-suggestion-pills")
        tv.settle(page, 400)
        pills = page.evaluate(PILL_PROBE)
        rows = len({p["top"] for p in pills})
        inside = all(p["left"] >= p["winLeft"] - 0.5 and p["right"] <= p["winRight"] + 0.5 for p in pills)
        page_w = page.evaluate("() => document.documentElement.scrollWidth")
        ok = len(pills) == 6 and rows >= 2 and inside and page_w <= viewport["width"]
        record(f"{key} Pillen umbrechen bei {viewport['width']} px", ok,
               f"Pillen={len(pills)}, Zeilen={rows}, im Fenster={inside}, Seitenbreite={page_w}")
    finally:
        ctx.close()


def check_bubble_header(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, mock())
    try:
        tv.wait_shadow(page, "#anything-llm-greeting-bubble")
        tv.settle(page, 400)
        st = page.evaluate("""() => {
          const b = window.__q('#anything-llm-greeting-bubble'), s = window.__q('#anything-llm-greeting-small');
          const img = window.__q('#anything-llm-panel-welcome img');
          const dot = window.__q('[data-online-dot]'), sub = window.__q('#anything-llm-header-subtitle');
          const pills = window.__q('#anything-llm-suggestion-pills').getBoundingClientRect();
          const head = window.__q('#anything-llm-header img');
          return {
            bubble: b.textContent, avatar: !!img && img.getBoundingClientRect().width,
            small: s.textContent.slice(0, 30), smallSize: getComputedStyle(s).fontSize,
            order: b.getBoundingClientRect().bottom <= pills.top && pills.bottom <= s.getBoundingClientRect().top,
            pillsLeft: Math.round(pills.left - b.getBoundingClientRect().left),
            sub: sub && sub.textContent, dotBg: dot && getComputedStyle(dot).backgroundColor,
            dotAria: dot && dot.getAttribute('aria-hidden'), dotW: dot && dot.getBoundingClientRect().width,
            dotVisible: !!dot && dot.getBoundingClientRect().height > 0,
            headIcon: !!head && head.naturalWidth > 0,
            name: window.__q('#anything-llm-header').textContent,
          };
        }""")
        record("AK-3 Begrüßungsblase mit Avatar, greeting klein darunter",
               st["bubble"].startswith("Hallo! Ich bin Ihr digitaler Berater") and st["avatar"] == 28
               and st["smallSize"] == "11.5px" and st["order"],
               json.dumps({k: st[k] for k in ("bubble", "avatar", "small", "smallSize", "order", "pillsLeft")},
                          ensure_ascii=False))
        record("AK-4 Kopfzeile: Name, Untertitel, grüner Punkt (aria-hidden), Icon",
               "KI-Kursberater" in st["name"] and st["sub"] == "durchsucht 1.243 Kurse"
               and st["dotBg"] == "rgb(59, 178, 115)" and st["dotAria"] == "true" and st["dotW"] == 8
               and st["dotVisible"] and st["headIcon"],
               json.dumps({k: st[k] for k in ("name", "sub", "dotBg", "dotAria", "dotW", "headIcon")},
                          ensure_ascii=False))
    finally:
        ctx.close()


PRIV_PROBE = """() => {
  const n = window.__q('#anything-llm-privacy-notice');
  const a = window.__allmShadow.activeElement;
  const card = n && n.querySelector('[role=dialog]');
  const r = card && card.getBoundingClientRect();
  return {
    shown: !!n, text: card ? card.textContent : null, link: n && n.querySelector('a') && n.querySelector('a').href,
    focus: a ? a.textContent : null, inputDisabled: window.__q('#message-input') ? window.__q('#message-input').disabled : null,
    card: r ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null,
    vw: innerWidth, vh: innerHeight,
    ls: (() => { try { return localStorage.getItem('%s'); } catch (e) { return 'ERR'; } })(),
  };
}""" % ACK_KEY


def check_privacy(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": PRIVACY}, mock())
    try:
        tv.wait_shadow(page, "#anything-llm-privacy-notice")
        tv.settle(page, 800)
        st = page.evaluate(PRIV_PROBE)
        ok = (st["shown"] and st["text"].startswith("Datenschutz:")
              and "auf Servern in Deutschland" in st["text"] and "Qualitätssicherung" in st["text"]
              and "Weitere Informationen in der Erklärung zum Datenschutz" in st["text"]
              and st["link"] == "https://example.org/datenschutz" and st["focus"] == "Start"
              and st["inputDisabled"] is True and st["ls"] is None)
        record("AK-5 Hinweis beim ersten Öffnen: Text, Link, Fokus „Start“, Eingabe gesperrt", ok,
               json.dumps({k: st[k] for k in ("shown", "link", "focus", "inputDisabled", "ls")}, ensure_ascii=False))
        # Tab bleibt im Hinweis
        seq = []
        for _ in range(3):
            page.keyboard.press("Tab")
            seq.append(page.evaluate("() => { const a = window.__allmShadow.activeElement; return a ? a.textContent : null; }"))
        record("AK-5 Tab bleibt im Hinweis", seq == ["Erklärung zum Datenschutz", "Start", "Erklärung zum Datenschutz"],
               str(seq))
        card = page.evaluate("""() => { const c = window.__q('#anything-llm-privacy-notice [role=dialog]');
          const b = c.querySelector('button'); const win = window.__q('#anything-llm-chat').getBoundingClientRect();
          const r = c.getBoundingClientRect(), br = b.getBoundingClientRect(), cs = getComputedStyle(c);
          return { radius: cs.borderTopLeftRadius, widthRatio: +(r.width / win.width).toFixed(2),
                   h2: getComputedStyle(c.querySelector('h2')).fontSize, li: c.querySelectorAll('li').length,
                   btnH: br.height, btnCentered: Math.abs((br.left + br.right) / 2 - (r.left + r.right) / 2) < 1.5,
                   btnRadius: getComputedStyle(b).borderTopLeftRadius }; }""")
        record("AK-5 Optik: 24 px Rundung, ≈ 90 % Breite, Überschrift 20 px, 3 Punkte, Knopf mittig ≥ 44 px",
               card["radius"] == "24px" and 0.85 <= card["widthRatio"] <= 0.95 and card["h2"] == "20px"
               and card["li"] == 3 and card["btnH"] >= 44 and card["btnCentered"] and card["btnRadius"] == "999px",
               json.dumps(card))
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        record("AK-5 Escape bestätigt nicht", page.evaluate(PRIV_PROBE)["shown"], "")
        page.evaluate("() => [...window.__q('#anything-llm-privacy-notice').querySelectorAll('button')].find(b => b.textContent === 'Start').click()")
        page.wait_for_timeout(300)
        st2 = page.evaluate(PRIV_PROBE)
        ok2 = not st2["shown"] and st2["inputDisabled"] is False and bool(st2["ls"]) and st2["focus"] is not None
        record("AK-5 „Start“: Eingabe frei, localStorage gesetzt", ok2,
               json.dumps({k: st2[k] for k in ("shown", "inputDisabled", "ls", "focus")}, ensure_ascii=False))
        page.reload()
        tv.wait_shadow(page, "#message-input")
        tv.settle(page, 800)
        st3 = page.evaluate(PRIV_PROBE)
        record("AK-5 Neuladen: kein Hinweis mehr", not st3["shown"] and st3["inputDisabled"] is False,
               json.dumps({k: st3[k] for k in ("shown", "inputDisabled", "ls")}, ensure_ascii=False))
        record("AK-5 Konsole ohne Fehler", not tv.errors_of(page), str(tv.errors_of(page)))
    finally:
        ctx.close()


def check_privacy_no_storage(browser, base_url):
    """NAK-3: localStorage-Zugriff wirft -> kein Fehler, Hinweis erscheint, „Start“ wirkt.
    Nur für den Hinweis-Schlüssel: andere Teile des Widgets (Sitzungs-ID,
    Sprache) lesen localStorage ebenfalls und sind nicht Gegenstand."""
    block = """(() => { for (const fn of ['getItem', 'setItem']) { const orig = Storage.prototype[fn];
      Storage.prototype[fn] = function (k, ...rest) { if (String(k).startsWith('allm-privacy-ack-'))
        throw new DOMException('blocked', 'SecurityError'); return orig.call(this, k, ...rest); }; } })();"""
    ctx, page = tv.open_page(browser, base_url, {"attrs": PRIVACY}, mock(),
                             before_goto=lambda c, p: c.add_init_script(block))
    try:
        tv.wait_shadow(page, "#anything-llm-privacy-notice")
        tv.settle(page, 500)
        page.evaluate("() => [...window.__q('#anything-llm-privacy-notice').querySelectorAll('button')].find(b => b.textContent === 'Start').click()")
        page.wait_for_timeout(300)
        st = page.evaluate(PRIV_PROBE)
        errs = tv.errors_of(page)
        record("NAK-3 ohne localStorage: kein Fehler, Hinweis bestätigbar",
               not st["shown"] and st["inputDisabled"] is False and not errs and st["ls"] == "ERR",
               f"ls={st['ls']}, Fehler={errs}")
    finally:
        ctx.close()


BODY_PROBE = """() => {
  const p = (el) => { const cs = getComputedStyle(el); return [cs.overflow, cs.overflowY, cs.position, cs.paddingRight, cs.touchAction].join('|'); };
  return { body: p(document.body), html: p(document.documentElement), bodyStyle: document.body.getAttribute('style'),
           htmlStyle: document.documentElement.getAttribute('style') };
}"""


def check_no_page_block(browser, base_url):
    """NAK-2: Hinweis blockiert die Seite nicht (Body-Styles gleich, Seite scrollbar)."""
    tall = "main { min-height: 3000px; }"
    res = {}
    for name, attrs in (("ohne", {**OPEN, "default-messages": MSGS}), ("mit", PRIVACY)):
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "css": tall}, mock())
        try:
            tv.wait_shadow(page, "#message-input")
            tv.settle(page, 600)
            res[name] = page.evaluate(BODY_PROBE)
            if name == "mit":
                res["shown"] = page.evaluate(PRIV_PROBE)["shown"]
                page.mouse.move(200, 300)
                page.mouse.wheel(0, 600)
                page.wait_for_timeout(400)
                res["scrollY"] = page.evaluate("() => scrollY")
        finally:
            ctx.close()
    ok = res["mit"] == res["ohne"] and res.get("shown") and res.get("scrollY", 0) > 0
    record("NAK-2 Hinweis blockiert die Seite nicht", ok, json.dumps(res, ensure_ascii=False))


def check_privacy_mobile(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": PRIVACY}, mock(), viewport=tv.MOBILE)
    try:
        tv.wait_shadow(page, "#anything-llm-privacy-notice")
        tv.settle(page, 600)
        st = page.evaluate(PRIV_PROBE)
        c = st["card"]
        ok = st["shown"] and c["l"] >= 0 and c["r"] <= st["vw"] and c["t"] >= 0 and c["b"] <= st["vh"]
        record("NAK-5 mobil (390 px): Hinweis passt ins Vollbild", ok, json.dumps(c))
    finally:
        ctx.close()


def check_bar_ticket(browser, base_url):
    """AK-6 im Browser: Frage aus der Leiste wartet auf „Start“, dann genau 1 Anfrage."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": BAR_PRIVACY, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        tv.settle(page, 400)
        ii.type_in_bar(page, ii.QUESTION)
        page.keyboard.press("Enter")
        tv.wait_shadow(page, "#anything-llm-privacy-notice")
        page.wait_for_timeout(800)
        before = len(m.stream_requests)
        focus = page.evaluate("() => { const a = window.__allmShadow.activeElement; return a ? a.textContent : null; }")
        page.evaluate("() => [...window.__q('#anything-llm-privacy-notice').querySelectorAll('button')].find(b => b.textContent === 'Start').click()")
        ii.wait_user_and_token(page, ii.QUESTION)
        page.wait_for_timeout(300)
        sent = [r.get("message") for r in m.stream_requests]
        record("AK-6 Leisten-Frage wartet auf „Start“, dann genau 1 Anfrage",
               before == 0 and sent == [ii.QUESTION] and focus == "Start",
               f"vorher={before}, nachher={sent}, Fokus beim Hinweis={focus}")
    finally:
        ctx.close()


def check_arrow_under_notice(browser, base_url):
    """Review 3: bei geladenem Verlauf (Hinweis noch nicht bestätigt) liegt der
    Scroll-nach-unten-Pfeil (z-50) UNTER dem Hinweis (z-index 60) und ist nicht
    klickbar (elementFromPoint trifft den Hinweis, Klick scrollt nicht)."""
    hist = []
    for i in range(10):
        hist.append({"role": "user", "content": f"Frage {i + 1}: Gibt es Kurse am Abend?", "sentAt": tv.SENT_AT + i * 60})
        hist.append({"role": "assistant", "content": "Ja. " + "Ein längerer Absatz zur Antwort. " * 6,
                     "sentAt": tv.SENT_AT + i * 60 + 5, "chatId": i + 1})
    ctx, page = tv.open_page(browser, base_url, {"attrs": PRIVACY}, mock(history=hist))
    try:
        tv.wait_shadow(page, "#anything-llm-privacy-notice")
        tv.wait_shadow(page, "#chat-history")
        tv.settle(page, 500)
        page.evaluate("() => { const h = window.__q('#chat-history'); h.scrollTop = 0; h.dispatchEvent(new Event('scroll')); }")
        tv.wait_shadow(page, "#scroll-to-bottom-button")
        page.wait_for_timeout(300)
        st = page.evaluate("""() => {
          const btn = window.__q('#scroll-to-bottom-button'), r = btn.getBoundingClientRect();
          const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
          const hit = window.__allmShadow.elementFromPoint(x, y);
          return { x, y, hitNotice: !!(hit && hit.closest('#anything-llm-privacy-notice')),
                   hitArrow: !!(hit && hit.closest('#scroll-to-bottom-button')),
                   z: getComputedStyle(window.__q('#anything-llm-privacy-notice')).zIndex,
                   top: window.__q('#chat-history').scrollTop };
        }""")
        page.mouse.click(st["x"], st["y"])
        page.wait_for_timeout(400)
        top_after = page.evaluate("() => window.__q('#chat-history').scrollTop")
        ok = st["hitNotice"] and not st["hitArrow"] and st["z"] == "60" and top_after == st["top"]
        record("Review 3 Scroll-Pfeil liegt unter dem Hinweis (nicht klickbar)", ok,
               json.dumps({**st, "topNachKlick": top_after}))
    finally:
        ctx.close()


def check_bubble_scrolled_to_pills(browser, base_url):
    """Review 10: lange Datenschutz-Blase im Blasenfenster -> beim Öffnen ans
    Ende gescrollt, die Pillen liegen vollständig im sichtbaren Bereich."""
    ctx, page = tv.open_page(browser, base_url, {"attrs": PRIVACY_BUBBLE}, mock())
    try:
        tv.wait_shadow(page, "#anything-llm-suggestion-pills")
        tv.settle(page, 500)
        st = page.evaluate("""() => {
          const sc = window.__q('#anything-llm-panel-welcome').parentElement, r = sc.getBoundingClientRect();
          const p = window.__q('#anything-llm-suggestion-pills').getBoundingClientRect();
          return { overflow: sc.scrollHeight > sc.clientHeight, top: Math.round(sc.scrollTop),
                   atEnd: Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) <= 1,
                   pillsVisible: p.top >= r.top - 0.5 && p.bottom <= r.bottom + 0.5 };
        }""")
        record("Review 10 lange Blase: beim Öffnen ans Ende gescrollt, Pillen sichtbar",
               st["overflow"] and st["atEnd"] and st["pillsVisible"], json.dumps(st))
    finally:
        ctx.close()


def check_dot_ring_dark_header(browser, base_url):
    """Review 5: Ring des Online-Punkts in der Kopfzeilen-Farbe (dunkler Header
    per headerBgColor), nicht in --allmi-surface."""
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, mock(config={**CFG, "headerBgColor": "#123456"}))
    try:
        tv.wait_shadow(page, "[data-online-dot]")
        tv.settle(page, 400)
        st = page.evaluate("""() => {
          const dot = window.__q('[data-online-dot]'), head = window.__q('#anything-llm-header');
          return { ring: getComputedStyle(dot).boxShadow, header: getComputedStyle(head).backgroundColor };
        }""")
        ok = st["header"] == "rgb(18, 52, 86)" and st["ring"].startswith("rgb(18, 52, 86) 0px 0px 0px 2px")
        record("Review 5 Online-Punkt-Ring in der Kopfzeilen-Farbe (dunkler Header)", ok, json.dumps(st))
    finally:
        ctx.close()


def check_privacy_bubble(browser, base_url):
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**OPEN, "privacy-notice": "bubble",
                                                           "privacy-url": "/datenschutz", "default-messages": MSGS}}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-bubble-privacy")
        tv.settle(page, 500)
        st = page.evaluate("""() => ({
          paras: [...window.__q('#anything-llm-bubble-privacy').querySelectorAll('p')].map(p => p.textContent),
          strong: [...window.__q('#anything-llm-bubble-privacy').querySelectorAll('strong')].map(e => e.textContent),
          link: window.__q('#anything-llm-bubble-privacy a') && window.__q('#anything-llm-bubble-privacy a').getAttribute('href'),
          popup: !!window.__q('#anything-llm-privacy-notice'), disabled: window.__q('#message-input').disabled,
          small: !!window.__q('#anything-llm-greeting-small'),
          ls: Object.keys(localStorage).filter(k => k.startsWith('allm-privacy-ack-')) })""")
        ok = (len(st["paras"]) == 4 and st["paras"][2].startswith("Bitte teilen Sie nur Angaben")
              and st["strong"] == [] and st["paras"][3] == "Datenschutz" and st["link"] == "/datenschutz"
              and not st["popup"] and st["disabled"] is False and not st["small"] and st["ls"] == [])
        record("Datenschutz in der Blase: Punkte (neutral, ohne „Wichtig:“), Link; kein Popup, Eingabe frei, kein localStorage", ok,
               json.dumps(st, ensure_ascii=False)[:400])
    finally:
        ctx.close()


def check_disclaimer(browser, base_url):
    """Fester KI-Hinweis unter dem Eingabefeld: Blase, Inline (Box), mobil Vollbild."""
    variants = [
        ("Blase", {"attrs": DISCLAIMER}, None),
        ("Inline", {"attrs": {**tv.BASE_ATTRS, "display-mode": "inline", "inline-start-state": "expanded",
                              "disclaimer": "footer"}, "inline": True}, None),
        ("mobil", {"attrs": DISCLAIMER}, tv.MOBILE),
    ]
    for name, cfg, vp in variants:
        ctx, page = tv.open_page(browser, base_url, cfg, mock(), viewport=vp)
        try:
            tv.wait_shadow(page, "#anything-llm-ai-disclaimer")
            tv.settle(page, 500)
            st = page.evaluate("""() => { const n = window.__q('#anything-llm-ai-disclaimer');
              const inp = window.__q('#message-input').closest('form') || window.__q('#message-input');
              const r = n.getBoundingClientRect(), ir = inp.getBoundingClientRect(), cs = getComputedStyle(n);
              const win = window.__q('#anything-llm-chat').getBoundingClientRect();
              return { text: n.textContent, role: n.getAttribute('role'), size: cs.fontSize, align: cs.textAlign,
                       gap: Math.round(r.top - ir.bottom), visible: r.height > 0 && r.bottom <= win.bottom + 0.5,
                       pointer: cs.cursor }; }""")
            ok = (st["text"] == "Ich bin eine KI und kann Fehler machen. Bitte überprüfen Sie meine Antworten."
                  and st["role"] == "note" and st["size"] == "11.5px" and st["align"] == "center"
                  and 0 <= st["gap"] <= 12 and st["visible"])
            record(f"KI-Hinweis unter dem Eingabefeld ({name})", ok, json.dumps(st, ensure_ascii=False))
        finally:
            ctx.close()


def check_defaults_dom(browser, base_url):
    """AK-1 (DOM): ohne neue Attribute keine neuen Elemente."""
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**OPEN, "default-messages": MSGS}}, mock())
    try:
        tv.wait_shadow(page, "#message-input")
        tv.settle(page, 500)
        st = page.evaluate("""() => ({
          pills: !!window.__q('#anything-llm-suggestion-pills'), bubble: !!window.__q('#anything-llm-greeting-bubble'),
          privacy: !!window.__q('#anything-llm-privacy-notice'), dot: !!window.__q('[data-online-dot]'),
          sub: !!window.__q('#anything-llm-header-subtitle'), note: !!window.__q('#anything-llm-ai-disclaimer'),
          bars: window.__allmShadow.querySelectorAll('.msg-suggestion').length })""")
        ok = not any(st[k] for k in ("pills", "bubble", "privacy", "dot", "sub", "note")) and st["bars"] == 4
        record("AK-1 Standard ohne neue Attribute: nur Balken, nichts Neues", ok, json.dumps(st))
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="fehlende Referenz-Screenshots erzeugen")
    ap.add_argument("--new-states", action="store_true", help="mit --baseline: Referenzen der neuen Zustände")
    ap.add_argument("--dist", default=str(ROOT / "dist"), help="Verzeichnis mit dem gebauten Widget")
    ap.add_argument("--only", nargs="*", help="nur diese Pixel-Zustände")
    args = ap.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            run_pixel(browser, base_url, args.baseline, args.new_states, args.only)
            if not args.baseline:
                check_defaults_dom(browser, base_url)
                check_pills(browser, base_url)
                check_pills_wrap(browser, base_url, SMALL, "AK-2")
                check_pills_wrap(browser, base_url, tv.MOBILE, "NAK-5")
                check_bubble_header(browser, base_url)
                check_privacy(browser, base_url)
                check_privacy_no_storage(browser, base_url)
                check_no_page_block(browser, base_url)
                check_privacy_mobile(browser, base_url)
                check_bar_ticket(browser, base_url)
                check_arrow_under_notice(browser, base_url)
                check_bubble_scrolled_to_pills(browser, base_url)
                check_dot_ring_dark_header(browser, base_url)
                check_privacy_bubble(browser, base_url)
                check_disclaimer(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    failed = [r for r in tv.RESULTS if not r[1]]
    print(f"\n{len(tv.RESULTS) - len(failed)}/{len(tv.RESULTS)} Prüfungen bestanden.")
    (RESULTS_DIR / "summary-panel-privacy.json").write_text(
        json.dumps([{"check": k, "ok": ok, "detail": d} for k, ok, d in tv.RESULTS], ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
