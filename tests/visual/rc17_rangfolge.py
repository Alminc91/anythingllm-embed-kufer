#!/usr/bin/env python3
"""Playwright-Beleg Fixliste 7.22-rc17 (E23, E24): Rangfolge der Einbau-Angaben.

Testseite per page.set_content mit Einbau-Angaben und CSS-Variablen, die nach
E23 nicht wirken (data-theme, data-default-messages, data-button-color,
--allm-accent, --allm-on-accent, auch --allmi-* mit !important), einer
Entwickler-Angabe der Gruppe B (data-inline-effect) und Angriffen auf den
KI-Hinweis (data-disclaimer, data-disclaimer-text, --allm-text-muted,
--allm-surface). Widget aus dist/ (npm run build vorher), alle Aufrufe an
den Server gemockt. Einrichtung wie tests/visual/theme_visual.py.

Aufruf (aus dem Repo-Wurzelverzeichnis):

  python3 tests/visual/rc17_rangfolge.py [--out .test-storage/rc17]

Ergebnis: Zeilen PASS/FAIL, Bildschirmfotos und summary.json im Ausgabeordner.
"""

import argparse
import json
import pathlib
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
BRAND = (ROOT / "tests" / "visual" / "fixtures" / "brand.png").read_bytes()
WIDGET = "https://widget.test"
# Seite der Kundin: eigene Herkunft (about:blank sperrt den Speicher)
SITE = "https://kunde.test/"
API = "https://praesentation.ki.kufer.de/api/embed"
EMBED_ID = "78eda2c6-5bd0-44b5-b097-30d694a56677"
NOTICE_DE = "Unsere KI kann Fehler machen. Bitte prüfen Sie die Antworten."
# Liste eines Servers mit defaultMessagesStandard: die Beispiele bis 7.22-rc22.
# Seit E42 (7.22-rc23) liefert der Fork [] (tests/e42-startvorschlaege.test.jsx);
# die Probe zeigt, dass das Widget eine Serverliste so zeigt, wie sie kommt.
STANDARD_SUGGESTIONS = ["Ich suche einen Deutschkurs.", "Gibt es Excel-Kurse am Abend?"]
# Antwort eines Servers ab 7.22 (feste Standards wie embedStandards.js)
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
    "courseCardsPosition": "above",
    "welcomeBubblesDesktop": "first",
    "welcomeBubblesMobile": "first",
    "defaultMessages": STANDARD_SUGGESTIONS,
    "defaultMessagesStandard": True,
}
# Seiten-CSS: Gruppe A (wirkt nicht), Angriffe auf den KI-Hinweis, und eine
# Variable der Gruppe B (wirkt: --allm-radius)
PAGE_CSS = """
#anythingllm-embed-widget {
  --allm-accent: #ff0000;
  --allm-on-accent: #00ff00;
  --allm-user-bg: #ff0000;
  --allm-link: #ff0000;
  --allm-text-muted: transparent;
  --allm-surface: #6b7280;
  --allm-radius: 12px;
  --allmi-accent: #ff00ff !important;
  --allmi-ai-notice-text: transparent !important;
  --allmi-ai-notice-bg: #6b7280 !important;
}
body { margin: 0; font-family: sans-serif; }
main { max-width: 760px; margin: 40px auto; }
"""
ATTRS = {
    "embed-id": EMBED_ID,
    "base-api-url": API,
    "theme": "dark",
    "default-messages": "Spanisch A1,Yoga",
    "button-color": "#ff0000",
    "inline-effect": "grow",
    "disclaimer": "none",
    "disclaimer-text": "Kein Hinweis",
}
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


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {key}: {detail}")


def page_html(inline):
    attrs = " ".join(f'data-{k}="{v}"' for k, v in ATTRS.items())
    mount = '<div id="kufer-assistent"></div>' if inline else ""
    return (
        f"<!doctype html><html lang=de><head><meta charset=utf-8><style>{PAGE_CSS}</style></head>"
        f"<body><main><h1>Testseite rc17</h1>{mount}<p>Inhalt darunter.</p></main>"
        f'<script {attrs} src="{WIDGET}/anythingllm-chat-widget.min.js"></script></body></html>'
    )


def open_page(browser, server_config):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="de-DE",
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
            return route.fulfill(body=(DIST / name).read_bytes(), content_type=ctype)
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
    return ctx, page


def wait(page, sel, timeout=15000):
    page.wait_for_function("(s) => !!(window.__q && window.__q(s))", arg=sel, timeout=timeout)


def warnings(page):
    return [t for (k, t) in page.console_log if k in ("warning", "warn")]


def rgb(s):
    import re
    m = re.findall(r"[\d.]+", s or "")
    return tuple(float(x) for x in m[:3]) if len(m) >= 3 else None


def contrast(a, b):
    def lum(c):
        def ch(v):
            v /= 255
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


NOTICE_PROBE = """() => {
  const p = window.__q('#anything-llm-ai-disclaimer');
  if (!p) return null;
  const s = p.querySelector('span');
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p), ss = getComputedStyle(s);
  return { text: p.textContent, w: r.width, h: r.height, color: cs.color,
           bg: ss.backgroundColor, opacity: cs.opacity, visibility: cs.visibility,
           display: cs.display, fontSize: cs.fontSize };
}"""


def check_notice(page, key, want_text, want_bg):
    n = page.evaluate(NOTICE_PROBE)
    ok = (n is not None and n["text"] == NOTICE_DE and n["w"] > 100 and n["h"] > 8
          and n["display"] != "none" and n["visibility"] == "visible" and n["opacity"] == "1"
          and rgb(n["color"]) == want_text and rgb(n["bg"]) == want_bg
          and contrast(rgb(n["color"]), rgb(n["bg"])) >= 4.5)
    record(key, ok, n)


def case_inline(browser, out):
    # Server: In der Seite, Akzentfarbe gespeichert; Seite: siehe ATTRS/PAGE_CSS
    ctx, page = open_page(browser, {**SERVER, "displayMode": "inline", "buttonColor": "#0b5f8a",
                                     "userBgColor": "#0b5f8a", "linkColor": "#0b5f8a"})
    try:
        page.set_content(page_html(inline=True))
        wait(page, "#anything-llm-inline-input")
        page.wait_for_timeout(600)
        page.screenshot(path=str(out / "inline-bar.png"))
        state = page.evaluate("""() => {
          const host = document.getElementById('anythingllm-embed-widget');
          const style = [...window.__allmShadow.querySelectorAll('style')].find((s) => s.id === 'allm-theme-vars');
          const send = window.__q('#anything-llm-inline-send');
          const chips = [...window.__allmShadow.querySelectorAll('#anything-llm-inline-chips button')].map((b) => b.textContent);
          return { mode: style && style.dataset.mode, accent: getComputedStyle(host).getPropertyValue('--allmi-accent').trim(),
                   radius: getComputedStyle(host).getPropertyValue('--allmi-radius').trim(),
                   sendBg: send && getComputedStyle(send).backgroundColor, chips,
                   parent: host.parentElement && host.parentElement.id };
        }""")
        record("A: data-theme=dark wirkt nicht (Farbschema hell)", state["mode"] == "light", state["mode"])
        record("A: data-default-messages wirkt nicht (Standard vom Server)", state["chips"] == STANDARD_SUGGESTIONS,
               state["chips"])
        record("A: gespeicherte Akzentfarbe gegen --allm-accent und --allmi-accent !important der Seite",
               state["accent"] == "#0b5f8a" and rgb(state["sendBg"]) == (11, 95, 138),
               {"--allmi-accent": state["accent"], "send": state["sendBg"]})
        record("B: --allm-radius der Seite wirkt (Variable der Gruppe B)", state["radius"] == "12px", state["radius"])
        # aufklappen: Klick ins Feld (inlineOpenOn focus vom Server)
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        box = page.evaluate("() => { const r = window.__q('#anything-llm-inline-input').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; }")
        page.mouse.click(box[0], box[1])
        wait(page, "#anything-llm-ai-disclaimer")
        effect = page.evaluate("() => !!window.__allmShadow.querySelector('.allm-effect-grow') && !window.__allmShadow.querySelector('.allm-morph')")
        page.wait_for_timeout(900)
        record("B: data-inline-effect=grow schlägt den festen Standard morph vom Server", effect, effect)
        check_notice(page, "E24: KI-Hinweis sichtbar und lesbar trotz data-disclaimer und CSS-Variablen (hell)",
                     (107, 114, 128), (255, 255, 255))
        page.screenshot(path=str(out / "inline-open.png"))
        w = warnings(page)
        counts = {a: sum(1 for t in w if f"Einbau-Angabe {a} wirkt nicht" in t)
                  for a in ("data-theme", "data-default-messages", "data-button-color", "data-disclaimer",
                            "data-disclaimer-text")}
        effect_warn = [t for t in w if "data-inline-effect" in t]
        record("Konsolenwarnung je wirkungsloser Einbau-Angabe genau einmal, keine für data-inline-effect",
               all(c == 1 for c in counts.values()) and not effect_warn and not any("–" in t or "—" in t for t in w),
               {"counts": counts, "inline-effect": effect_warn})
        errs = [t for (k, t) in page.console_log if k in ("error", "pageerror")]
        record("keine Fehler in der Konsole (inline)", not errs, errs)
    finally:
        ctx.close()


def case_bubble(browser, out, dark):
    # Server: nichts gespeichert (Akzent-Standard), Farbschema dunkel nur im zweiten Lauf
    config = {**SERVER, **({"theme": "dark"} if dark else {})}
    ctx, page = open_page(browser, config)
    try:
        page.set_content(page_html(inline=False))
        wait(page, "#anything-llm-embed-chat-button")
        page.wait_for_timeout(500)
        state = page.evaluate("""() => {
          const host = document.getElementById('anythingllm-embed-widget');
          const b = window.__q('#anything-llm-embed-chat-button');
          return { accent: getComputedStyle(host).getPropertyValue('--allmi-accent').trim(),
                   onAccent: getComputedStyle(host).getPropertyValue('--allmi-on-accent').trim(),
                   bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color };
        }""")
        tag = "dunkel" if dark else "hell"
        record(f"A: Akzent-Standard gegen --allm-accent/--allm-on-accent der Seite ({tag})",
               state["accent"] == "#01a5a9" and rgb(state["bg"]) == (1, 165, 169)
               and state["onAccent"] == "#222628" and rgb(state["color"]) == (34, 38, 40), state)
        page.evaluate("() => window.__q('#anything-llm-embed-chat-button').click()")
        wait(page, "#anything-llm-ai-disclaimer")
        page.wait_for_timeout(600)
        want = ((166, 168, 173), (29, 29, 33)) if dark else ((107, 114, 128), (255, 255, 255))
        check_notice(page, f"E24: KI-Hinweis im Chatfenster sichtbar und lesbar ({tag})", *want)
        page.screenshot(path=str(out / f"bubble-open-{tag}.png"))
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / ".test-storage" / "rc17"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if not (DIST / "anythingllm-chat-widget.min.js").exists():
        sys.exit("dist/ fehlt: zuerst npm run build")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            case_inline(browser, out)
            case_bubble(browser, out, dark=False)
            case_bubble(browser, out, dark=True)
        finally:
            browser.close()
    (out / "summary.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")
    failed = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} bestanden")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
