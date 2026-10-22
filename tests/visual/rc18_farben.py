#!/usr/bin/env python3
"""Playwright-Beleg Fixliste 7.22-rc18 (W62, E25, E26, W61): feste Farben
direkt am Element gegen Seiten-CSS und @property der Seite.

Testseite per page.set_content (wie tests/visual/rc17_rangfolge.py), alle
Aufrufe an den Server gemockt (/config wie ein Server ab 7.22). Seiten-CSS:
  --allm-text-muted: transparent, --allm-assistant-text: transparent,
  --allm-assistant-bg gleich der Textfarbe der Datenschutz-Blase,
  @property --allmi-ai-notice-text { syntax: "<color>"; inherits: false;
  initial-value: transparent } und dieselbe Registrierung für die übrigen
  internen Farben (KI-Hinweis-Fläche, Datenschutz, Akzent), dazu
  data-assistant-bg-color gleich der Textfarbe und data-greeting-style="text".
Gemessen werden die berechneten Farben von KI-Hinweis, Datenschutz-Blase
(Text, Überschrift, Punkte, Fläche) und Chat-Button bzw. Senden-Button
(Akzent, Gruppe A); Kontrast mindestens 4,5:1 hell und dunkel.

Aufruf (aus dem Repo-Wurzelverzeichnis, npm run build vorher):

  python3 tests/visual/rc18_farben.py [--out .test-storage/rc18] [--dist dist]
                                      [--label nachher] [--no-assert]

Ergebnis: Zeilen PASS/FAIL, Bildschirmfotos <label>-*.png und
<label>-farben.json im Ausgabeordner. Mit --dist auf einen älteren Build und
--no-assert entsteht der Vorher-Beleg.
"""

import argparse
import json
import pathlib
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
BRAND = (ROOT / "tests" / "visual" / "fixtures" / "brand.png").read_bytes()
WIDGET = "https://widget.test"
SITE = "https://kunde.test/"
API = "https://praesentation.ki.kufer.de/api/embed"
EMBED_ID = "78eda2c6-5bd0-44b5-b097-30d694a56677"
NOTICE_DE = "Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten."
GREETING_DE = "Hallo! Ich bin Ihr KI-Berater. Wie kann ich Ihnen helfen?"
# Antwort eines Servers ab 7.22 (feste Standards wie embedStandards.js),
# Akzentfarbe im Design Center gespeichert
SERVER = {
    "greetingStyle": "bubble",
    "suggestionStyle": "pills",
    "followUps": "pills",
    "disclaimer": "footer",
    "onlineDot": False,
    "courseCardsAnswerStyle": "short",
    "courseCardsLayout": "rows",
    "inlineInput": True,
    "inlineOpenOn": "focus",
    "inlineEffect": "morph",
    "inlineLayout": "overlay",
    "inlineStartState": "collapsed",
    "inlineHeight": "520px",
    "inheritFont": True,
    "privacyNotice": "bubble",
    "privacyUrl": "https://kunde.test/datenschutz",
    "courseCardsPosition": "above",
    "welcomeBubblesDesktop": "off",
    "welcomeBubblesMobile": "off",
    # Pillen zum Messen der Farben: Liste eines Servers bis 7.22-rc22 (seit E42
    # liefert der Fork ohne gespeicherte Liste [])
    "defaultMessages": ["Ich suche einen Deutschkurs.", "Gibt es Excel-Kurse am Abend?"],
    "defaultMessagesStandard": True,
    "buttonColor": "#0b5f8a",
    "userBgColor": "#0b5f8a",
    "linkColor": "#0b5f8a",
}
ACCENT = (11, 95, 138)
# feste Farben (utils/theme.js AI_NOTICE_COLORS, PRIVACY_NOTICE_COLORS)
WANT = {
    "hell": {"notice": ((107, 114, 128), (255, 255, 255)),
             "privacy": ((87, 83, 78), (34, 38, 40), (255, 255, 255))},
    "dunkel": {"notice": ((166, 168, 173), (29, 29, 33)),
               "privacy": ((166, 168, 173), (244, 242, 239), (42, 42, 47))},
}
REGISTER = ["ai-notice-text", "ai-notice-bg", "text-muted", "assistant-text", "assistant-bg",
            "privacy-text", "privacy-title", "privacy-bg", "accent", "on-accent", "link"]


def page_css(text_hex):
    props = "\n".join(
        f'@property --allmi-{n} {{ syntax: "<color>"; inherits: false; '
        f'initial-value: {"hotpink" if n in ("accent", "link") else ("transparent" if "bg" not in n else text_hex)}; }}'
        for n in REGISTER
    )
    return f"""
{props}
#anythingllm-embed-widget, body {{
  --allm-text-muted: transparent;
  --allm-assistant-text: transparent;
  --allm-assistant-bg: {text_hex};
  --allm-surface: {text_hex};
}}
body {{ margin: 0; font-family: sans-serif; background: #e9e7e4; }}
main {{ max-width: 760px; margin: 40px auto; }}
"""


INIT_JS = r"""
(() => {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = orig.call(this, init);
    if (this.id === "anythingllm-embed-widget") window.__allmShadow = root;
    return root;
  };
  window.__q = (sel) => window.__allmShadow && window.__allmShadow.querySelector(sel);
})();
"""
RESULTS = []


def record(key, ok, detail, assert_on=True):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    tag = "PASS" if ok else ("FAIL" if assert_on else "INFO")
    print(f"[{tag}] {key}: {json.dumps(detail, ensure_ascii=False)}")


def rgb(s):
    m = re.findall(r"[\d.]+", s or "")
    if len(m) < 3:
        return None
    alpha = float(m[3]) if len(m) >= 4 else 1.0
    return tuple(round(float(x)) for x in m[:3]) if alpha > 0 else ("transparent",)


def contrast(a, b):
    if not a or not b or a == ("transparent",) or b == ("transparent",):
        return 0.0

    def lum(c):
        def ch(v):
            v /= 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])

    x, y = sorted([lum(a), lum(b)], reverse=True)
    return round((x + 0.05) / (y + 0.05), 2)


def open_page(browser, dist, server_config, attrs, css, inline=False, viewport=(1280, 900)):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, locale="de-DE",
                              timezone_id="Europe/Berlin", device_scale_factor=1)
    ctx.add_init_script(INIT_JS)
    cors = {"Access-Control-Allow-Origin": "*"}

    def route_all(route):
        u = urllib.parse.urlparse(route.request.url)
        if route.request.url == SITE:
            return route.fulfill(body="<!doctype html><meta charset=utf-8><title>Kunde</title>",
                                 content_type="text/html; charset=utf-8")
        if route.request.url.startswith(WIDGET):
            name = u.path.lstrip("/")
            ctype = ("text/css" if name.endswith(".css") else "application/javascript") + "; charset=utf-8"
            return route.fulfill(body=(dist / name).read_bytes(), content_type=ctype)
        if route.request.url.startswith(API):
            rest = u.path.split(EMBED_ID, 1)[-1]
            if rest == "/config":
                return route.fulfill(json=server_config, headers=cors)
            if rest == "/status":
                return route.fulfill(json={"enabled": True}, headers=cors)
            if rest == "/audio/status":
                return route.fulfill(json={"stt": False, "tts": False}, headers=cors)
            if route.request.method == "GET":
                return route.fulfill(json={"history": []}, headers=cors)
            return route.fulfill(status=404, body="", headers=cors)
        if route.request.resource_type == "image":
            return route.fulfill(body=BRAND, content_type="image/png")
        return route.abort()

    ctx.route("**/*", route_all)
    page = ctx.new_page()
    page.console_log = []
    page.on("console", lambda m: page.console_log.append((m.type, m.text)))
    page.on("pageerror", lambda e: page.console_log.append(("pageerror", str(e))))
    page.goto(SITE)
    data = " ".join(f'data-{k}="{v}"' for k, v in {"embed-id": EMBED_ID, "base-api-url": API, **attrs}.items())
    mount = '<div id="kufer-assistent"></div>' if inline else ""
    page.set_content(
        f"<!doctype html><html lang=de><head><meta charset=utf-8><style>{css}</style></head>"
        f"<body><main><h1>Testseite rc18</h1>{mount}<p>Inhalt darunter.</p></main>"
        f'<script {data} src="{WIDGET}/anythingllm-chat-widget.min.js"></script></body></html>'
    )
    return ctx, page


def wait(page, sel, timeout=15000):
    page.wait_for_function("(s) => !!(window.__q && window.__q(s))", arg=sel, timeout=timeout)


PROBE = r"""() => {
  const q = (s) => window.__q(s);
  const col = (el, p) => el ? getComputedStyle(el)[p] : null;
  const p = q('#anything-llm-ai-disclaimer');
  const span = p && p.querySelector('span');
  const priv = q('#anything-llm-privacy-bubble');
  const title = q('#anything-llm-bubble-privacy-title');
  const li = priv && priv.querySelector('li');
  const link = priv && priv.querySelector('a');
  const greet = q('#anything-llm-greeting-bubble');
  const centered = q('p.allm-text-center');
  const btn = q('#anything-llm-embed-chat-button') || q('#anything-llm-inline-send');
  const send = q('#send-message-button');
  return {
    notice: p ? { text: p.textContent, color: col(p, 'color'), bg: col(span, 'backgroundColor'),
                  w: p.getBoundingClientRect().width } : null,
    privacy: priv ? { color: col(priv, 'color'), bg: col(priv, 'backgroundColor'),
                      title: col(title, 'color'), li: col(li, 'color'), link: col(link, 'color'),
                      text: priv.textContent.slice(0, 80) } : null,
    greeting: greet ? { text: greet.textContent, color: col(greet, 'color'), bg: col(greet, 'backgroundColor') } : null,
    centered: centered ? centered.textContent : null,
    button: btn ? col(btn, 'backgroundColor') : null,
    send: send ? col(send, 'color') : null,
  };
}"""


def check(page, label, scheme, assert_on, extra_key=""):
    st = page.evaluate(PROBE)
    want = WANT[scheme]
    n = st["notice"]
    nt, nb = (rgb(n["color"]), rgb(n["bg"])) if n else (None, None)
    record(f"{label} E24/W62: KI-Hinweis lesbar ({scheme}){extra_key}",
           n is not None and n["text"] == NOTICE_DE and (nt, nb) == want["notice"] and contrast(nt, nb) >= 4.5,
           {"color": n and n["color"], "bg": n and n["bg"], "kontrast": contrast(nt, nb)}, assert_on)
    pr = st["privacy"]
    if pr is None:
        record(f"{label} E25: Datenschutz-Blase vorhanden ({scheme}){extra_key}", False, st, assert_on)
        return st
    pt, ptt, pb = rgb(pr["color"]), rgb(pr["title"]), rgb(pr["bg"])
    li = rgb(pr["li"])
    ok = ((pt, ptt, pb) == want["privacy"] and li == pt and contrast(pt, pb) >= 4.5
          and contrast(ptt, pb) >= 4.5)
    record(f"{label} E25: Datenschutz-Text lesbar ({scheme}){extra_key}", ok,
           {"text": pr["color"], "titel": pr["title"], "punkt": pr["li"], "fläche": pr["bg"],
            "kontrast_text": contrast(pt, pb), "kontrast_titel": contrast(ptt, pb), "link": pr["link"]},
           assert_on)
    return st


def case_privacy_only(browser, dist, out, label, dark, assert_on):
    # ohne data-greeting-style: nur die Farben (E25, W62), auch am alten Stand
    # mit Datenschutz-Blase
    scheme = "dunkel" if dark else "hell"
    text_hex = "#A6A8AD" if dark else "#57534e"
    config = {**SERVER, **({"theme": "dark"} if dark else {})}
    attrs = {"assistant-bg-color": text_hex, "open-on-load": "on"}
    ctx, page = open_page(browser, dist, config, attrs, page_css(text_hex))
    try:
        wait(page, "#anything-llm-ai-disclaimer")
        page.wait_for_timeout(700)
        check(page, label, scheme, assert_on, " ohne data-greeting-style")
        page.screenshot(path=str(out / f"{label}-chatfenster-{scheme}-farben.png"))
    finally:
        ctx.close()


def case_bubble(browser, dist, out, label, dark, assert_on):
    scheme = "dunkel" if dark else "hell"
    text_hex = "#A6A8AD" if dark else "#57534e"
    config = {**SERVER, **({"theme": "dark"} if dark else {})}
    attrs = {"greeting-style": "text", "assistant-bg-color": text_hex, "open-on-load": "on"}
    ctx, page = open_page(browser, dist, config, attrs, page_css(text_hex))
    try:
        wait(page, "#anything-llm-ai-disclaimer")
        page.wait_for_timeout(700)
        st = check(page, label, scheme, assert_on)
        record(f"{label} E26/W60: Datenschutz an, Begrüßung als Blase trotz data-greeting-style=text ({scheme})",
               st["greeting"] is not None and st["privacy"] is not None and st["greeting"]["text"] == GREETING_DE,
               {"begrüßung": st["greeting"], "mittig": st["centered"]}, assert_on)
        page.screenshot(path=str(out / f"{label}-chatfenster-{scheme}.png"))
        # Gruppe A: Akzent des Chat-Buttons (nach dem Schließen sichtbar)
        page.evaluate("() => { const b = [...window.__allmShadow.querySelectorAll('button')].find((x) => /schließen|close/i.test(x.getAttribute('aria-label') || '')); if (b) b.click(); }")
        page.wait_for_timeout(500)
        b = page.evaluate("() => { const b = window.__q('#anything-llm-embed-chat-button'); return b ? getComputedStyle(b).backgroundColor : null; }")
        record(f"{label} W62: Akzent (Gruppe A) am Chat-Button trotz @property --allmi-accent ({scheme})",
               rgb(b) == ACCENT, {"button": b}, assert_on)
        errs = [t for (k, t) in page.console_log if k in ("error", "pageerror")]
        record(f"{label} keine Fehler in der Konsole ({scheme})", not errs, errs, assert_on)
    finally:
        ctx.close()


def case_inline(browser, dist, out, label, assert_on):
    text_hex = "#57534e"
    config = {**SERVER, "displayMode": "inline"}
    attrs = {"greeting-style": "text", "assistant-bg-color": text_hex}
    ctx, page = open_page(browser, dist, config, attrs, page_css(text_hex), inline=True)
    try:
        wait(page, "#anything-llm-inline-input")
        page.wait_for_timeout(600)
        send = page.evaluate("() => { const b = window.__q('#anything-llm-inline-send'); return b ? getComputedStyle(b).backgroundColor : null; }")
        record(f"{label} W62: Akzent (Gruppe A) am Senden-Button der Leiste trotz @property --allmi-accent",
               rgb(send) == ACCENT, {"senden": send}, assert_on)
        page.screenshot(path=str(out / f"{label}-seite-leiste.png"))
        # aufklappen: Klick ins Feld (inlineOpenOn focus vom Server)
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        box = page.evaluate("() => { const r = window.__q('#anything-llm-inline-input').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; }")
        page.mouse.click(box[0], box[1])
        wait(page, "#anything-llm-ai-disclaimer")
        page.wait_for_timeout(1200)
        check(page, label, "hell", assert_on, " In der Seite")
        page.screenshot(path=str(out / f"{label}-seite-hell.png"))
    finally:
        ctx.close()


def case_text(browser, dist, out, label, assert_on):
    # Gegenprobe: Datenschutz aus -> data-greeting-style=text wirkt, Text mit
    # dem Begrüßungsstandard der Sprache (W61)
    config = {**SERVER, "privacyNotice": "none"}
    ctx, page = open_page(browser, dist, config, {"greeting-style": "text", "open-on-load": "on"}, page_css("#57534e"))
    try:
        wait(page, "#anything-llm-ai-disclaimer")
        page.wait_for_timeout(600)
        st = page.evaluate(PROBE)
        record(f"{label} Gegenprobe E26/W61: Datenschutz aus, Text mittig mit Begrüßungsstandard",
               st["privacy"] is None and st["greeting"] is None and st["centered"] == GREETING_DE,
               {"mittig": st["centered"], "datenschutz": st["privacy"]}, assert_on)
        page.screenshot(path=str(out / f"{label}-text-ohne-datenschutz.png"))
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / ".test-storage" / "rc18"))
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--label", default="nachher")
    ap.add_argument("--no-assert", action="store_true", help="nur messen (Vorher-Stand)")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    dist = pathlib.Path(args.dist)
    if not (dist / "anythingllm-chat-widget.min.js").exists():
        sys.exit(f"{dist} ohne Build: zuerst npm run build")
    assert_on = not args.no_assert
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            case_privacy_only(browser, dist, out, args.label, dark=False, assert_on=assert_on)
            case_privacy_only(browser, dist, out, args.label, dark=True, assert_on=assert_on)
            case_bubble(browser, dist, out, args.label, dark=False, assert_on=assert_on)
            case_bubble(browser, dist, out, args.label, dark=True, assert_on=assert_on)
            case_inline(browser, dist, out, args.label, assert_on)
            case_text(browser, dist, out, args.label, assert_on)
        finally:
            browser.close()
    (out / f"{args.label}-farben.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2),
                                                  encoding="utf-8")
    failed = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} bestanden")
    sys.exit(1 if failed and assert_on else 0)


if __name__ == "__main__":
    main()
