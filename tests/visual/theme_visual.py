#!/usr/bin/env python3
"""Visuelle und DOM-Tests für CSS-Variablen / Theme des Embed-Widgets.

Einrichtung: pip install -r tests/visual/requirements.txt && playwright install chromium

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenz-Screenshots vom UNVERÄNDERTEN Build erzeugen (einmalig, z. B. main)
  python3 tests/visual/theme_visual.py --baseline --dist /pfad/zum/alten/dist

  #    Ausnahme NEW_STATES (Zustände, die es auf main nicht gab): Referenz aus
  #    diesem Branch, nur gezielt: --baseline --only <zustand> …
  #    Bestehende Referenzen nie überschreiben.

  # 2) Neuen Build prüfen (npm run build vorher)
  python3 tests/visual/theme_visual.py

  # optional: zusätzlich ein Live-Lauf gegen den Container praesentation
  # (eine echte Testfrage, dunkles Theme)
  python3 tests/visual/theme_visual.py --live

Das Widget wird aus <dist>/ über einen lokalen HTTP-Server in die Testseite
tests/visual/fixtures/widget.html eingebunden. Alle Aufrufe an
https://praesentation.ki.kufer.de/api/embed werden (außer mit --live) gemockt
(Config, Status, Verlauf), damit die Screenshots deterministisch sind; externe
Bilder werden durch fixtures/brand.png ersetzt.

Prüfungen:
  AK-1 / AK-8   Pixel-Vergleich gegen tests/visual/baseline/*.png (<= 0,1 %)
  REG           Pixel-Vergleich neuer Zustände (Review-Funde: Hover dunkel,
                Markenheader dunkel, Header-Linie per Seiten-CSS) gegen ihre
                eigene Referenz aus diesem Branch (NEW_STATES)
  AK-2 .. AK-7, AK-11, AK-12, NAK-1 .. NAK-5   computed styles / Konsole / Größe
Ergebnis-Screenshots (und Diff-Bilder) landen in tests/visual/results/.
"""

import argparse
import base64
import io
import functools
import http.server
import json
import pathlib
import socketserver
import sys
import threading
import time
import urllib.parse

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
VIS = ROOT / "tests" / "visual"
BASELINE_DIR = VIS / "baseline"
RESULTS_DIR = VIS / "results"
FIXTURES = VIS / "fixtures"

API = "https://praesentation.ki.kufer.de/api/embed"
EMBED_ID = "78eda2c6-5bd0-44b5-b097-30d694a56677"
VIEWPORT = {"width": 1000, "height": 700}
MOBILE = {"width": 390, "height": 700}
MAX_DIFF_RATIO = 0.001  # 0,1 %
# Basis = main nach Kurskarten v1/Overlay (Build von origin/main, 2026-10-05)
BASE_JS_SIZE = 758_606
BASE_CSS_SIZE = 19_529

# Stand der visual_config von praesentation (05.10.2026), damit der Test nicht
# von späteren Design-Center-Änderungen abhängt.
PRAES_CONFIG = {
    "buttonColor": "#FFA102",
    "userBgColor": "#FFA102",
    "linkColor": "#FFA102",
    "userTextColor": "#222628",
    "chatIcon": "chatBubble",
    "position": "bottom-left",
    "greeting": "Dieser Chatbot nutzt künstliche Intelligenz (KI). Ihre Nachrichten werden nicht an Dritte weitergegeben, können aber zur Qualitätssicherung von uns eingesehen werden. Bitte geben Sie keine sensiblen personenbezogenen Daten ein.",
    "defaultMessages": "Haben wir Integrationskurse?,Voraussetzungen für die Teilnahme an einem Integrationskurs?",
}

SENT_AT = 1759651200  # 05.10.2025 10:00 Uhr (Europe/Berlin)
HISTORY_ANSWER = [
    {"role": "user", "content": "Gibt es Integrationskurse?", "sentAt": SENT_AT},
    {
        "role": "assistant",
        "content": "Ja, wir bieten Integrationskurse an. Alle Termine finden Sie [auf unserer Kursseite](https://example.org/kurse).\n\nDie Anmeldung erfolgt im **Kundenbüro**.",
        "sentAt": SENT_AT + 5,
        "chatId": 4711,
        "feedbackScore": None,
    },
]

BASE_ATTRS = {"embed-id": EMBED_ID, "base-api-url": API}

# Zustände, die es auf main nicht gab (dunkles Theme, Seiten-CSS): Referenz
# stammt aus diesem Branch (Regressionsschutz), nicht vom alten Build.
NEW_STATES = {"dark-input-hover", "dark-bubble-brand-header", "header-border-page-css"}
BRAND_DARK = "#0b3d6b"
CONVERSATIONS = [
    {"conversationId": "c-1", "title": "Integrationskurse", "lastMessageAt": None, "messageCount": 2},
    {"conversationId": "c-2", "title": "Anmeldung Sprachkurs Englisch", "lastMessageAt": None, "messageCount": 1},
]


# ---------------------------------------------------------------------------
# Infrastruktur
# ---------------------------------------------------------------------------
class _Handler(http.server.SimpleHTTPRequestHandler):
    dist_dir = None

    def translate_path(self, path):
        p = urllib.parse.urlparse(path).path
        if p.startswith("/widget/"):
            return str(pathlib.Path(self.dist_dir) / p[len("/widget/") :])
        return str(ROOT / p.lstrip("/"))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def start_server(dist_dir):
    handler = type("H", (_Handler,), {"dist_dir": dist_dir})
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


# Init-Script: erfasst den (geschlossenen!) Shadow-Root NUR für den Test, ohne
# den Modus zu ändern, und protokolliert jeden Frame nach dem Mount (NAK-4).
INIT_JS = r"""
(() => {
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = orig.call(this, init);
    if (this.id === "anythingllm-embed-widget") {
      window.__allmShadow = root;
      window.__allmMode = init && init.mode;
    }
    return root;
  };
  window.__q = (sel) => window.__allmShadow && window.__allmShadow.querySelector(sel);
  window.__cs = (sel, prop) => {
    const el = typeof sel === "string" ? window.__q(sel) : sel;
    return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;
  };
  window.__hostVar = (name) => {
    const h = document.getElementById("anythingllm-embed-widget");
    return h ? getComputedStyle(h).getPropertyValue(name).trim() : null;
  };
  window.__frames = [];
  const tick = () => {
    const win = window.__q && window.__q("#anything-llm-chat");
    if (win && window.__frames.length < 120) {
      const r = win.getBoundingClientRect();
      window.__frames.push({
        t: performance.now(),
        bg: getComputedStyle(win).backgroundColor,
        visible: r.width > 0 && r.height > 0,
      });
    }
    if (window.__frames.length < 120) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
"""


class Mock:
    """Gemocktes Backend (Config/Status/Verlauf) für API."""

    def __init__(self, config=None, history=None, conversations=None, stream=None):
        self.config = PRAES_CONFIG if config is None else config
        self.history = history or []
        self.conversations = conversations or []
        # stream: None = 404, "hang" = Antwort bleibt aus (Tipp-Animation),
        # Liste = SSE-Ereignisse von /stream-chat
        self.stream = stream
        self.pending = []

    def release(self):
        while self.pending:
            try:
                self.pending.pop().abort()
            except Exception:
                pass

    def handle(self, route):
        url = urllib.parse.urlparse(route.request.url)
        path = url.path
        prefix = f"/api/embed/{EMBED_ID}"
        rest = path[len(prefix) :] if path.startswith(prefix) else path
        if rest == "/config":
            return route.fulfill(json=self.config)
        if rest == "/status":
            return route.fulfill(json={"enabled": True})
        if rest == "/audio/status":
            return route.fulfill(json={"stt": False, "tts": False})
        if rest == "/stream-chat":
            if self.stream == "hang":
                self.pending.append(route)  # bleibt offen -> "denkt nach"
                return None
            if isinstance(self.stream, list):
                body = "".join(f"data: {json.dumps(ev)}\n\n" for ev in self.stream)
                return route.fulfill(status=200, body=body, headers={"Content-Type": "text/event-stream"})
            return route.fulfill(status=404, body="")
        if rest.endswith("/conversations"):
            return route.fulfill(json={"conversations": self.conversations})
        if route.request.method == "GET":
            return route.fulfill(json={"history": self.history})
        return route.fulfill(status=404, body="")


def open_page(browser, base_url, cfg, mock=None, live=False, color_scheme="light",
              reduced_motion="no-preference", before_goto=None, viewport=None, context_options=None):
    ctx = browser.new_context(
        viewport=viewport or VIEWPORT,
        device_scale_factor=1,
        locale="de-DE",
        timezone_id="Europe/Berlin",
        color_scheme=color_scheme,
        reduced_motion=reduced_motion,
        **(context_options or {}),
    )
    ctx.add_init_script(INIT_JS)
    brand = (FIXTURES / "brand.png").read_bytes()

    def route_all(route):
        u = route.request.url
        if u.startswith(base_url):
            return route.continue_()
        if u.startswith(API):
            if live:
                return route.continue_()
            return (mock or Mock()).handle(route)
        if route.request.resource_type == "image":
            return route.fulfill(body=brand, content_type="image/png")
        if live:
            return route.continue_()
        return route.abort()

    ctx.route("**/*", route_all)
    page = ctx.new_page()
    page.console_log = []
    page.on(
        "console",
        lambda m: page.console_log.append((m.type, m.text)),
    )
    page.on("pageerror", lambda e: page.console_log.append(("pageerror", str(e))))
    if before_goto:
        before_goto(ctx, page)
    q = urllib.parse.quote(json.dumps(cfg))
    page.goto(f"{base_url}/tests/visual/fixtures/widget.html?c={q}")
    return ctx, page


def wait_shadow(page, selector, timeout=15000):
    page.wait_for_function(
        "(s) => !!(window.__q && window.__q(s))", arg=selector, timeout=timeout
    )


def settle(page, ms=700):
    page.evaluate("() => document.fonts && document.fonts.ready")
    page.wait_for_timeout(ms)


def errors_of(page):
    return [
        t
        for (k, t) in page.console_log
        if k in ("error", "pageerror") and "favicon" not in t
    ]


# ---------------------------------------------------------------------------
# Farben / Kontrast
# ---------------------------------------------------------------------------
def parse_rgb(s):
    s = s.strip()
    if s.startswith("#"):
        h = s[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    inner = s[s.index("(") + 1 : s.rindex(")")].replace("/", " ").replace(",", " ")
    parts = [p for p in inner.split() if p]
    r, g, b = (float(x) for x in parts[:3])
    a = float(parts[3]) if len(parts) > 3 else 1.0
    return (r, g, b, a)


def over(fg, bg):
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def lum(c):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ---------------------------------------------------------------------------
# Ergebnis-Sammlung
# ---------------------------------------------------------------------------
RESULTS = []


def record(key, ok, detail):
    RESULTS.append((key, bool(ok), detail))
    print(f"[{'OK ' if ok else 'FAIL'}] {key}: {detail}", flush=True)


# ---------------------------------------------------------------------------
# AK-1 / AK-8: Pixel-Vergleich
# ---------------------------------------------------------------------------
def pixel_cases():
    inline = {**BASE_ATTRS, "display-mode": "inline"}
    return [
        # (name, cfg, mock, wait-selector, aktion)
        ("bubble-closed", {"attrs": BASE_ATTRS}, Mock(), "#anything-llm-embed-chat-button", None),
        ("bubble-open-empty", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}}, Mock(), "#message-input", None),
        ("bubble-open-answer", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}}, Mock(history=HISTORY_ANSWER),
         ".allm-anything-llm-assistant-message a", None),
        ("bubble-menu", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}}, Mock(history=HISTORY_ANSWER),
         ".allm-anything-llm-assistant-message", "menu"),
        ("bubble-history", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}},
         Mock(history=HISTORY_ANSWER, conversations=CONVERSATIONS), ".allm-anything-llm-assistant-message", "history"),
        ("bubble-brand-header", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}},
         Mock(config={**PRAES_CONFIG, "headerBgColor": "#0b5f8a", "headerTextColor": "#FFFFFF",
                      "iconStyle": "circle", "assistantBgColor": "#f1f5f9"}, history=HISTORY_ANSWER),
         ".allm-anything-llm-assistant-message a", None),
        ("bubble-legacy-colors",
         {"attrs": {**BASE_ATTRS, "open-on-load": "on", "button-color": "#ff0000", "link-color": "#00ff00"}},
         Mock(config={}, history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None),
        ("bubble-text-size-16", {"attrs": {**BASE_ATTRS, "open-on-load": "on", "text-size": "16"}},
         Mock(config={}, history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None),
        ("inline-collapsed", {"attrs": inline, "inline": True}, Mock(), "#anything-llm-inline-bar", None),
        ("inline-expanded", {"attrs": {**inline, "inline-start-state": "expanded"}, "inline": True},
         Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None),
        # AK-8: dunkle Leiste (Legacy inlineTheme), geöffnetes Fenster bleibt hell
        ("inline-dark-collapsed", {"attrs": {**inline, "inline-theme": "dark"}, "inline": True}, Mock(),
         "#anything-llm-inline-bar", None),
        ("inline-dark-expanded",
         {"attrs": {**inline, "inline-theme": "dark", "inline-start-state": "expanded"}, "inline": True},
         Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None),
        # Mobil (<768px): Blase im Vollbild ohne Rundung, Inline-Leiste kompakt
        ("mobile-bubble-open-answer", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}},
         Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None, MOBILE),
        ("mobile-inline-collapsed", {"attrs": inline, "inline": True}, Mock(), "#anything-llm-inline-bar", None,
         MOBILE),
        # Live-Antwort (PromptReply): wartend (Tipp-Punkte) und gestreamt
        ("bubble-pending", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}}, Mock(stream="hang"),
         "#message-input", "send"),
        ("bubble-streamed", {"attrs": {**BASE_ATTRS, "open-on-load": "on"}},
         Mock(stream=[{"uuid": "u-1", "type": "textResponseChunk", "close": False, "sources": [],
                       "textResponse": "Ja. Termine finden Sie [auf der Kursseite](https://example.org/kurse)."}]),
         "#message-input", "send"),
        # --- NEW_STATES (Review-Funde) ---
        # Senden-Icon im dunklen Theme mit Maus darüber
        ("dark-input-hover", {"attrs": {**BASE_ATTRS, "open-on-load": "on", "theme": "dark"}},
         Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", "hover-send"),
        # Markenheader (headerBgColor ohne headerTextColor) im dunklen Theme
        ("dark-bubble-brand-header", {"attrs": {**BASE_ATTRS, "open-on-load": "on", "theme": "dark"}},
         Mock(config={**PRAES_CONFIG, "headerBgColor": BRAND_DARK}, history=HISTORY_ANSWER),
         ".allm-anything-llm-assistant-message a", None),
        # Header-Farbe nur per Seiten-CSS -> keine sichtbare Unterlinie
        ("header-border-page-css",
         {"attrs": {**BASE_ATTRS, "open-on-load": "on"},
          "css": f"#anythingllm-embed-widget {{ --allm-header-bg: {BRAND_DARK}; --allm-header-text: #FFFFFF; --allm-header-icon: #FFFFFF; }}"},
         Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a", None),
    ]


def hover_shadow(page, selector):
    """Maus auf die Mitte eines Elements im (geschlossenen) Shadow-Root."""
    box = page.evaluate(
        "(s) => { const r = window.__q(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }",
        selector)
    page.mouse.move(*box)
    page.wait_for_timeout(150)


def run_action(page, action):
    if action == "send":
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.type("Gibt es Integrationskurse?")
        page.keyboard.press("Enter")
        page.wait_for_function(
            "() => !!window.__q('.allm-dot-falling') || !!window.__q('.allm-reply a')", timeout=10000)
    if action in ("menu", "history"):
        page.evaluate("() => window.__q('button[aria-label=Options]').click()")
        page.wait_for_timeout(200)
    if action == "history":
        page.evaluate(
            "() => [...window.__allmShadow.querySelectorAll('button')].find(b => b.textContent.includes('Frühere Chats')).click()"
        )
        page.wait_for_function(
            "() => [...window.__allmShadow.querySelectorAll('button')].some(b => b.textContent.includes('Konversation') || b.textContent.includes('Integrationskurse'))"
        )


def screenshot_case(browser, base_url, case, out_path):
    name, cfg, mock, sel, action = case[:5]
    viewport = case[5] if len(case) > 5 else None
    # feste Uhrzeit, damit der Zeitstempel einer neu gesendeten Nachricht gleich bleibt
    freeze = (lambda c, p: p.clock.set_fixed_time(SENT_AT)) if action == "send" else None
    ctx, page = open_page(browser, base_url, cfg, mock, viewport=viewport, before_goto=freeze)
    try:
        wait_shadow(page, sel)
        run_action(page, action)
        settle(page)
        page.mouse.move(0, 0)
        page.wait_for_timeout(100)
        if action == "hover-send":
            # Fokus raus: der blinkende Cursor im (geschlossenen) Shadow-Root
            # wird von caret="hide" nicht erfasst -> sonst nicht deterministisch
            page.evaluate("() => window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur()")
            hover_shadow(page, "#send-message-button")
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return errors_of(page)
    finally:
        if mock:
            mock.release()
        ctx.close()


def diff_ratio(a_path, b_path, diff_path):
    a = np.asarray(Image.open(a_path).convert("RGB")).astype(np.int16)
    b = np.asarray(Image.open(b_path).convert("RGB")).astype(np.int16)
    if a.shape != b.shape:
        return 1.0, -1
    d = np.abs(a - b).max(axis=2)
    mask = d > 0
    ratio = mask.mean()
    if mask.any():
        vis = np.asarray(Image.open(b_path).convert("RGB")).copy()
        vis[mask] = [255, 0, 255]
        Image.fromarray(vis).save(diff_path)
    return float(ratio), int(d.max())


def run_pixel(browser, base_url, baseline_mode, only=None):
    target = BASELINE_DIR if baseline_mode else RESULTS_DIR
    target.mkdir(parents=True, exist_ok=True)
    for case in pixel_cases():
        name = case[0]
        if only and name not in only:
            continue
        out = target / f"{name}.png"
        errs = screenshot_case(browser, base_url, case, out)
        if baseline_mode:
            print(f"[BASE] {name} -> {out.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        ref = BASELINE_DIR / f"{name}.png"
        if not ref.exists():
            record(f"AK-1 {name}", False, "keine Referenz (erst --baseline laufen lassen)")
            continue
        ratio, maxd = diff_ratio(ref, out, RESULTS_DIR / f"{name}.diff.png")
        key = "REG" if name in NEW_STATES else "AK-8" if name.startswith("inline-dark") else "AK-1"
        record(
            f"{key} {name}",
            ratio <= MAX_DIFF_RATIO and not errs,
            f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""),
        )


# ---------------------------------------------------------------------------
# Funktionsprüfungen (nur neuer Build)
# ---------------------------------------------------------------------------
OPEN = {**BASE_ATTRS, "open-on-load": "on"}


def check_host_css_wins(browser, base_url):
    for label, css in (
        ("Host", "#anythingllm-embed-widget { --allm-assistant-bg: #123456; --allm-radius: 0px; }"),
        ("Vorfahre body", "body { --allm-assistant-bg: #123456; --allm-radius: 0px; }"),
    ):
        ctx, page = open_page(browser, base_url, {"attrs": OPEN, "css": css}, Mock(history=HISTORY_ANSWER))
        try:
            wait_shadow(page, ".allm-anything-llm-assistant-message")
            settle(page, 300)
            bg = page.evaluate("() => __cs('.allm-anything-llm-assistant-message', 'background-color')")
            rad = page.evaluate("() => __cs('.allm-anything-llm-assistant-message', 'border-radius')")
            win = page.evaluate("() => __cs('#anything-llm-chat', 'border-radius')")
            # Server-visual_config (assistantBgColor) darf Seiten-CSS NICHT schlagen
            ok = bg == "rgb(18, 52, 86)" and rad == "0px" and win == "0px"
            record(f"AK-2 host-css-wins ({label})", ok, f"Blase bg={bg}, radius={rad}, Fenster radius={win}")
        finally:
            ctx.close()
    # gegen eine Server-Einstellung
    ctx, page = open_page(
        browser, base_url,
        {"attrs": OPEN, "css": "#anythingllm-embed-widget { --allm-assistant-bg: #123456; }"},
        Mock(config={**PRAES_CONFIG, "assistantBgColor": "#abcdef"}, history=HISTORY_ANSWER),
    )
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message")
        bg = page.evaluate("() => __cs('.allm-anything-llm-assistant-message', 'background-color')")
        record("AK-2 Seiten-CSS > visual_config", bg == "rgb(18, 52, 86)", f"Blase bg={bg} (visual_config #abcdef)")
    finally:
        ctx.close()


def check_precedence(browser, base_url):
    ctx, page = open_page(
        browser, base_url, {"attrs": {**OPEN, "user-bg-color": "#111111"}},
        Mock(config={**PRAES_CONFIG, "userBgColor": "#222222"}, history=HISTORY_ANSWER),
    )
    try:
        wait_shadow(page, ".allm-anything-llm-user-message")
        v = page.evaluate("() => __hostVar('--allmi-user-bg')")
        bg = page.evaluate("() => __cs('.allm-anything-llm-user-message', 'background-color')")
        record("AK-3 precedence-server-over-script", v == "#222222" and bg == "rgb(34, 34, 34)",
               f"wirksames --allm-user-bg={v}, Blase bg={bg}")
    finally:
        ctx.close()


def dark_probe(page):
    return page.evaluate(
        """() => {
      const s = (el, p) => el ? getComputedStyle(el).getPropertyValue(p).trim() : null;
      const q = window.__q;
      const input = q('#message-input');
      const box = input && input.parentElement;
      const header = q('#anything-llm-header');
      const brand = header && header.querySelector('span');
      const bubble = q('.allm-anything-llm-assistant-message');
      const bubbleText = bubble && bubble.querySelector('span');
      const link = q('.allm-anything-llm-assistant-message a');
      const muted = [...window.__allmShadow.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === 'Ihr Online-Berater');
      return {
        window: s(q('#anything-llm-chat'), 'background-color'),
        headerBorder: s(header, 'border-bottom-color'),
        header: s(header, 'background-color'),
        headerText: s(brand, 'color'),
        inputBox: s(box, 'background-color'),
        inputBorder: s(box, 'border-top-color'),
        inputText: s(input, 'color'),
        bubble: s(bubble, 'background-color'),
        bubbleText: s(bubbleText, 'color'),
        link: s(link, 'color'),
        muted: muted ? s(muted, 'color') : null,
        hostBg: window.__hostVar('--allmi-bg'),
        hostSurface: window.__hostVar('--allmi-surface'),
      };
    }"""
    )


def check_dark(browser, base_url):
    ctx, page = open_page(browser, base_url, {"attrs": {**OPEN, "theme": "dark"}}, Mock(history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message a")
        settle(page)
        page.screenshot(path=str(RESULTS_DIR / "dark-open-answer.png"), animations="disabled", caret="hide")
        p = dark_probe(page)
        win = parse_rgb(p["window"])
        hdr_raw = parse_rgb(p["header"])
        hdr = over(hdr_raw, win) if hdr_raw[3] < 1 else hdr_raw
        box_raw = parse_rgb(p["inputBox"])
        box = over(box_raw, win) if box_raw[3] < 1 else box_raw
        bub = parse_rgb(p["bubble"])
        pairs = {
            "Header-Text/Header": contrast(parse_rgb(p["headerText"]), hdr),
            "Eingabe-Text/Eingabefeld": contrast(parse_rgb(p["inputText"]), box),
            "Antwort-Text/Blase": contrast(parse_rgb(p["bubbleText"]), bub),
            "Link/Blase": contrast(parse_rgb(p["link"]), bub),
            "Muted/Fenster": contrast(over(parse_rgb(p["muted"]), win), win) if p["muted"] else 0,
        }
        borders = {
            "Header-Linie/Fenster": contrast(over(parse_rgb(p["headerBorder"]), win), win),
            "Eingaberahmen/Fenster": contrast(over(parse_rgb(p["inputBorder"]), win), win),
            "Eingaberahmen/Eingabefeld": contrast(over(parse_rgb(p["inputBorder"]), box), box),
        }
        dark = all(lum(c) < 0.05 for c in (win, hdr, box, bub))
        ok = dark and all(v >= 4.5 for v in pairs.values()) and all(v >= 3.0 for v in borders.values())
        detail = (
            f"Fenster={p['window']} Header={p['header']} Eingabe={p['inputBox']} Blase={p['bubble']}; "
            + ", ".join(f"{k} {v:.2f}:1" for k, v in {**pairs, **borders}.items())
        )
        record("AK-4 dunkles Theme + Kontrast", ok, detail)
        errs = errors_of(page)
        record("AK-4 Konsole sauber", not errs, errs or "keine Fehler")
    finally:
        ctx.close()
    # Inline-Box dunkel (Screenshot für Review)
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**BASE_ATTRS, "display-mode": "inline", "inline-start-state": "expanded", "theme": "dark"},
         "inline": True}, Mock(history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message a")
        settle(page)
        page.screenshot(path=str(RESULTS_DIR / "dark-inline-expanded.png"), animations="disabled", caret="hide")
    finally:
        ctx.close()
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**BASE_ATTRS, "display-mode": "inline", "theme": "dark"}, "inline": True}, Mock())
    try:
        wait_shadow(page, "#anything-llm-inline-bar")
        settle(page)
        page.screenshot(path=str(RESULTS_DIR / "dark-inline-collapsed.png"), animations="disabled", caret="hide")
    finally:
        ctx.close()


def dark_review_shots(browser, base_url):
    """Alle Pixel-Zustände zusätzlich mit theme=dark (nur für das Review,
    kein Vergleich): results/dark-<zustand>.png"""
    for case in pixel_cases():
        name, cfg = case[0], case[1]
        if name.startswith("inline-dark") or name in NEW_STATES:
            continue
        cfg = {**cfg, "attrs": {**cfg["attrs"], "theme": "dark"}}
        errs = screenshot_case(browser, base_url, (name, cfg, *case[2:]),
                               RESULTS_DIR / f"dark-{name}.png")
        if errs:
            record(f"AK-4 Konsole dark-{name}", False, errs)


def mockup_shots(browser, base_url):
    """AK-9-Vorbereitung (Abnahme manuell durch Reviewer): Mockup-Tokens aus
    fixtures/mockup-theme.css, hell und dunkel -> results/mockup-*.png"""
    sheet = "/tests/visual/fixtures/mockup-theme.css"
    inline = {**BASE_ATTRS, "display-mode": "inline"}
    for theme in ("light", "dark"):
        extra = {"htmlClass": "dark"} if theme == "dark" else {}
        for name, cfg, mock, sel in (
            ("inline-collapsed", {"attrs": inline, "inline": True}, Mock(), "#anything-llm-inline-bar"),
            ("inline-expanded", {"attrs": {**inline, "inline-start-state": "expanded"}, "inline": True},
             Mock(history=HISTORY_ANSWER), ".allm-anything-llm-assistant-message a"),
        ):
            cfg = {**cfg, "sheets": [sheet], **extra}
            screenshot_case(browser, base_url, (name, cfg, mock, sel, None),
                            RESULTS_DIR / f"mockup-{theme}-{name}.png")


def check_hover_icons(browser, base_url):
    """Fund 1: Senden-Icon beim Hover — hell bisheriger Wert (#22262899/90),
    dunkel sichtbar (Text des dunklen Satzes, Kontrast >= 3:1 zum Eingabefeld)."""
    for theme, expect in (("light", "rgba(34, 38, 40, 0.9)"), ("dark", "rgb(244, 242, 239)")):
        ctx, page = open_page(browser, base_url, {"attrs": {**OPEN, "theme": theme}}, Mock(history=HISTORY_ANSWER))
        try:
            wait_shadow(page, "#send-message-button svg")
            settle(page, 300)
            sel = "#send-message-button svg"
            rest = page.evaluate("(s) => __cs(s, 'color')", sel)
            hover_shadow(page, "#send-message-button")
            hov = page.evaluate("(s) => __cs(s, 'color')", sel)
            box = page.evaluate("() => __cs(window.__q('#message-input').parentElement, 'background-color')")
            win = parse_rgb(page.evaluate("() => __cs('#anything-llm-chat', 'background-color')"))
            box_c = parse_rgb(box)
            box_c = over(box_c, win) if box_c[3] < 1 else box_c
            c = contrast(over(parse_rgb(hov), box_c), box_c)
            ok = hov == expect and c >= 3.0
            record(f"Fund-1 Hover Eingabe-Icon ({theme})", ok,
                   f"Ruhe={rest}, Hover={hov} (erwartet {expect}), Kontrast zum Eingabefeld {c:.2f}:1")
        finally:
            ctx.close()


def header_probe(page):
    return page.evaluate(
        """() => {
      const h = window.__q('#anything-llm-header') || [...window.__allmShadow.querySelectorAll('div')].find(d => d.style.borderBottom);
      const c = getComputedStyle(h);
      return {style: c.borderBottomStyle, width: c.borderBottomWidth, color: c.borderBottomColor, bg: c.backgroundColor};
    }"""
    )


def history_header_probe(page):
    return page.evaluate(
        """() => {
      const back = window.__q('button[aria-label="Zurück zum Chat"]');
      let h = back; while (h && !(h.style && h.style.borderBottom)) h = h.parentElement;
      const c = getComputedStyle(h);
      return {style: c.borderBottomStyle, width: c.borderBottomWidth, color: c.borderBottomColor, bg: c.backgroundColor};
    }"""
    )


def check_header_border(browser, base_url):
    """Fund 5: Unterlinie nur über --allmi-header-border. Seiten-CSS
    --allm-header-bg -> keine sichtbare Linie (Linie = Header-Farbe); Setting
    headerBgColor -> keine Linie; dunkel ohne Setting -> Rahmen des dunklen Satzes."""
    def invisible(p):
        return p["style"] == "none" or p["width"] == "0px" or p["color"] == p["bg"]

    cases = (
        ("Seiten-CSS --allm-header-bg", {"attrs": OPEN, "css": f"#anythingllm-embed-widget {{ --allm-header-bg: {BRAND_DARK}; }}"},
         PRAES_CONFIG, invisible),
        ("Setting headerBgColor (dunkel)", {"attrs": {**OPEN, "theme": "dark"}}, {**PRAES_CONFIG, "headerBgColor": BRAND_DARK},
         lambda p: p["style"] == "none"),
        ("dunkel ohne Setting", {"attrs": {**OPEN, "theme": "dark"}}, PRAES_CONFIG,
         lambda p: p["style"] == "solid" and p["width"] == "1px" and p["color"] == "rgb(120, 123, 130)"),
        ("hell ohne Setting", {"attrs": OPEN}, PRAES_CONFIG,
         lambda p: p["style"] == "solid" and p["width"] == "1px" and p["color"] == "rgb(233, 233, 233)"),
    )
    for label, cfg, config, pred in cases:
        ctx, page = open_page(browser, base_url, cfg, Mock(config=config, history=HISTORY_ANSWER,
                                                          conversations=CONVERSATIONS))
        try:
            wait_shadow(page, ".allm-anything-llm-assistant-message")
            settle(page, 300)
            main_h = header_probe(page)
            run_action(page, "history")
            settle(page, 300)
            hist_h = history_header_probe(page)
            ok = pred(main_h) and pred(hist_h)
            record(f"Fund-5 Header-Linie ({label})", ok, f"Header={json.dumps(main_h)}, Frühere Chats={json.dumps(hist_h)}")
        finally:
            ctx.close()


def check_brand_header_dark(browser, base_url):
    """Fund 3: theme=dark + headerBgColor ohne headerTextColor -> Kontrast."""
    ctx, page = open_page(browser, base_url, {"attrs": {**OPEN, "theme": "dark"}},
                          Mock(config={**PRAES_CONFIG, "headerBgColor": BRAND_DARK}, history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message")
        settle(page, 300)
        p = page.evaluate(
            """() => {
          const h = window.__q('#anything-llm-header');
          const brand = h.querySelector('span');
          const icon = h.querySelector('button[aria-label=Options]');
          return {bg: getComputedStyle(h).backgroundColor, text: getComputedStyle(brand).color,
                  icon: getComputedStyle(icon).color};
        }"""
        )
        bg = parse_rgb(p["bg"])
        ct = contrast(parse_rgb(p["text"]), bg)
        ci = contrast(parse_rgb(p["icon"]), bg)
        record("Fund-3 Markenheader dunkel Kontrast", ct >= 4.5 and ci >= 4.5,
               f"Header={p['bg']}, Text={p['text']} {ct:.2f}:1, Icons={p['icon']} {ci:.2f}:1")
    finally:
        ctx.close()


def check_stream_font_size(browser, base_url):
    """Fund 4: textSize=16 -> streamende Antwort und Verlaufseintrag gleich groß."""
    mock = Mock(history=HISTORY_ANSWER, stream=[
        {"uuid": "u-1", "type": "textResponseChunk", "close": False, "sources": [],
         "textResponse": "Ja. Termine finden Sie [auf der Kursseite](https://example.org/kurse)."}])
    for size in ("16", None):
        attrs = {**OPEN, "text-size": size} if size else OPEN
        ctx, page = open_page(browser, base_url, {"attrs": attrs}, mock,
                              before_goto=lambda c, p: p.clock.set_fixed_time(SENT_AT))
        try:
            wait_shadow(page, ".allm-anything-llm-assistant-message a")
            run_action(page, "send")
            page.wait_for_function("() => !!window.__q('.allm-reply a')", timeout=10000)
            res = page.evaluate(
                """() => {
              const hist = window.__q('.allm-anything-llm-assistant-message span');
              const live = window.__q('.allm-reply');
              const f = (el) => ({size: getComputedStyle(el).fontSize, line: getComputedStyle(el).lineHeight});
              return {hist: f(hist), live: f(live)};
            }"""
            )
            want = f"{size or 14}px"
            ok = res["hist"] == res["live"] and res["live"]["size"] == want
            record(f"Fund-4 Schriftgröße Stream = Verlauf (textSize={size or 'Standard'})", ok, json.dumps(res))
        finally:
            mock.release()
            ctx.close()


def check_inline_theme_explicit(browser, base_url):
    """Fund 9: inlineTheme explizit gewinnt, ohne Angabe folgt die Leiste dem Theme."""
    inline = {**BASE_ATTRS, "display-mode": "inline"}
    for label, attrs, want in (
        ('theme=dark, ohne inline-theme', {**inline, "theme": "dark"}, "dark"),
        ('theme=dark + inline-theme=light', {**inline, "theme": "dark", "inline-theme": "light"}, "light"),
        ('ohne theme + inline-theme=dark (AK-8)', {**inline, "inline-theme": "dark"}, "dark"),
        ('ohne theme, ohne inline-theme', inline, "light"),
    ):
        ctx, page = open_page(browser, base_url, {"attrs": attrs, "inline": True}, Mock(config={}))
        try:
            wait_shadow(page, "#anything-llm-inline-bar")
            settle(page, 200)
            bg = page.evaluate("() => __cs('#anything-llm-inline-bar', 'background-color')")
            got = "light" if bg == "rgb(255, 255, 255)" else "dark"
            record(f"Fund-9 Leiste ({label})", got == want, f"Leiste bg={bg} -> {got}, erwartet {want}")
        finally:
            ctx.close()


def check_auto(browser, base_url):
    ctx, page = open_page(browser, base_url, {"attrs": {**OPEN, "theme": "auto"}}, Mock(history=HISTORY_ANSWER),
                          color_scheme="dark")
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message")
        settle(page, 300)
        d_bg = page.evaluate("() => __hostVar('--allmi-bg')")
        d_win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
        page.evaluate("() => { window.__marker = 42; }")
        page.emulate_media(color_scheme="light")
        page.wait_for_timeout(300)
        l_bg = page.evaluate("() => __hostVar('--allmi-bg')")
        l_win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
        same_doc = page.evaluate("() => window.__marker === 42")
        page.emulate_media(color_scheme="dark")
        page.wait_for_timeout(300)
        d2_win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
        ok = same_doc and d_bg != l_bg and d_win != l_win and l_win == "rgb(255, 255, 255)" and d2_win == d_win
        record("AK-5 auto-follows-system", ok,
               f"dunkel --allm-bg={d_bg} Fenster={d_win} -> hell --allm-bg={l_bg or '(leer=Altwerte)'} Fenster={l_win} -> dunkel {d2_win}; ohne Reload={same_doc}")
    finally:
        ctx.close()


def check_server_theme(browser, base_url):
    ctx, page = open_page(browser, base_url, {"attrs": OPEN}, Mock(config={**PRAES_CONFIG, "theme": "dark"},
                                                                   history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message")
        win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
        record("AK-6 theme aus visual_config (Browser)", lum(parse_rgb(win)) < 0.05, f"Fenster={win}")
    finally:
        ctx.close()


def check_legacy(browser, base_url):
    ctx, page = open_page(
        browser, base_url, {"attrs": {**BASE_ATTRS, "button-color": "#ff0000", "link-color": "#00ff00"}},
        Mock(config={}, history=HISTORY_ANSWER))
    try:
        wait_shadow(page, "#anything-llm-embed-chat-button")
        btn = page.evaluate("() => __cs('#anything-llm-embed-chat-button', 'background-color')")
        acc = page.evaluate("() => __hostVar('--allmi-accent')")
        lnk_v = page.evaluate("() => __hostVar('--allmi-link')")
        page.evaluate("() => window.__q('#anything-llm-embed-chat-button').click()")
        wait_shadow(page, ".allm-anything-llm-assistant-message a")
        lnk = page.evaluate("() => __cs('.allm-anything-llm-assistant-message a', 'color')")
        ok = acc == "#ff0000" and lnk_v == "#00ff00" and btn == "rgb(255, 0, 0)" and lnk == "rgb(0, 255, 0)"
        record("AK-7 legacy-settings-map (Browser)", ok,
               f"--allm-accent={acc}, --allm-link={lnk_v}, Button={btn}, Link={lnk}")
    finally:
        ctx.close()


def check_reduced_motion(browser, base_url):
    for mode, expect in (("reduce", "0s"), ("no-preference", "0.2s")):
        ctx, page = open_page(browser, base_url, {"attrs": BASE_ATTRS}, Mock(), reduced_motion=mode)
        try:
            wait_shadow(page, "#anything-llm-embed-chat-button")
            dur = page.evaluate("() => __cs('#anything-llm-embed-chat-button', 'transition-duration')")
            var = page.evaluate("() => __hostVar('--allmi-transition')")
            record(f"AK-11 reduced-motion ({mode})", dur == expect, f"--allm-transition={var}, Button transition-duration={dur}")
        finally:
            ctx.close()
    # Inline-Leiste + Seiten-CSS, das eine lange Dauer setzt: reduce gewinnt trotzdem
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**BASE_ATTRS, "display-mode": "inline"}, "inline": True,
         "css": "#anythingllm-embed-widget { --allm-transition: 500ms; }"},
        Mock(), reduced_motion="reduce")
    try:
        wait_shadow(page, "#anything-llm-inline-bar")
        dur = page.evaluate("() => __cs('#anything-llm-inline-bar', 'transition-duration')")
        record("AK-11 reduced-motion schlägt Seiten-CSS", dur == "0s", f"Leiste transition-duration={dur}")
    finally:
        ctx.close()


def check_focus_ring(browser, base_url):
    """--allm-focus-ring: hell ungesetzt = Browser-Standard (revert), dunkel = 2px Akzent."""
    for theme, expect_style in (("light", "auto"), ("dark", "solid")):
        ctx, page = open_page(
            browser, base_url,
            {"attrs": {**BASE_ATTRS, "display-mode": "inline", "theme": theme}, "inline": True}, Mock())
        try:
            wait_shadow(page, "#anything-llm-inline-bar")
            page.keyboard.press("Tab")
            page.wait_for_timeout(100)
            st = page.evaluate(
                "() => { const a = window.__allmShadow.activeElement; if (!a) return null; const c = getComputedStyle(a); return {id: a.id, style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor}; }")
            ok = bool(st) and st["id"] == "anything-llm-inline-bar" and st["style"] == expect_style
            record(f"Fokus-Ring ({theme})", ok, json.dumps(st))
        finally:
            ctx.close()


def check_invalid_theme(browser, base_url):
    for label, attrs, cfg in (
        ('data-theme="blau"', {**OPEN, "theme": "blau"}, PRAES_CONFIG),
        ("visual_config.theme = 7", OPEN, {**PRAES_CONFIG, "theme": 7}),
    ):
        ctx, page = open_page(browser, base_url, {"attrs": attrs}, Mock(config=cfg, history=HISTORY_ANSWER))
        try:
            wait_shadow(page, ".allm-anything-llm-assistant-message")
            win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
            warns = [t for (k, t) in page.console_log if k == "warning" and "theme" in t]
            errs = errors_of(page)
            ok = win == "rgb(255, 255, 255)" and len(warns) == 1 and not errs
            record(f"NAK-1 invalid-theme-falls-back ({label})", ok, f"Fenster={win}, warn={warns}, Fehler={errs}")
        finally:
            ctx.close()


def check_foreign_styles(browser, base_url):
    ctx, page = open_page(
        browser, base_url,
        {"attrs": OPEN, "link": True, "css": "#anythingllm-embed-widget * { color: red !important }"},
        Mock(history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message a")
        settle(page, 300)
        txt = page.evaluate("() => __cs(window.__q('.allm-anything-llm-assistant-message span'), 'color')")
        bg = page.evaluate("() => __cs('.allm-anything-llm-assistant-message', 'background-color')")
        rad = page.evaluate("() => __cs('#anything-llm-chat', 'border-top-left-radius')")
        mode = page.evaluate("() => window.__allmMode")
        ok = txt == "rgb(34, 38, 40)" and bg == "rgb(255, 255, 255)" and rad == "16px" and mode == "closed"
        record("NAK-2 keine Fremd-Styles im Shadow DOM", ok,
               f"Antwort-Text={txt}, Blase={bg}, Fenster-Radius={rad}, shadow mode={mode}")
    finally:
        ctx.close()


def check_sibling_vars(browser, base_url):
    ctx, page = open_page(
        browser, base_url,
        {"attrs": OPEN, "css": "#sibling { --allm-bg: red; --allm-surface: red; --allm-assistant-bg: red; --allm-radius: 0px; }"},
        Mock(history=HISTORY_ANSWER))
    try:
        wait_shadow(page, ".allm-anything-llm-assistant-message")
        settle(page, 300)
        win = page.evaluate("() => __cs('#anything-llm-chat', 'background-color')")
        bub = page.evaluate("() => __cs('.allm-anything-llm-assistant-message', 'background-color')")
        rad = page.evaluate("() => __cs('#anything-llm-chat', 'border-top-left-radius')")
        errs = errors_of(page)
        ok = win == "rgb(255, 255, 255)" and bub == "rgb(255, 255, 255)" and rad == "16px" and not errs
        record("NAK-3 Variablen auf Geschwister wirkungslos", ok, f"Fenster={win}, Blase={bub}, Radius={rad}, Fehler={errs}")
    finally:
        ctx.close()


def check_no_flash(browser, base_url):
    """NAK-4: CDP-Screencast zeichnet JEDEN gemalten Frame ab Seitenstart auf
    (mit Zeitstempel). Geprüft wird jeder Frame ab dem ersten sichtbaren
    Fenster (Mount, per rAF im Init-Script erfasst): Fensterfläche dunkel,
    insbesondere der erste Frame <= 50 ms nach Mount."""
    for label, cfg, mock in (
        ("Blase open-on-load", {"attrs": {**OPEN, "theme": "dark"}}, Mock(history=HISTORY_ANSWER)),
        ("Inline expanded", {"attrs": {**BASE_ATTRS, "display-mode": "inline", "inline-start-state": "expanded",
                                       "theme": "dark"}, "inline": True}, Mock(history=HISTORY_ANSWER)),
    ):
        shots = []

        def start_cast(ctx, page):
            cdp = ctx.new_cdp_session(page)

            def on_frame(ev):
                shots.append((ev["metadata"]["timestamp"] * 1000.0, ev["data"]))
                cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

            cdp.on("Page.screencastFrame", on_frame)
            cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1})

        ctx, page = open_page(browser, base_url, cfg, mock, before_goto=start_cast)
        try:
            page.wait_for_function("() => window.__frames.some(f => f.visible)", polling="raf", timeout=15000)
            page.wait_for_timeout(800)
            frames = page.evaluate("() => window.__frames.filter(f => f.visible)")
            mount = page.evaluate(
                "() => performance.timeOrigin + window.__frames.find(f => f.visible).t")
            rect = page.evaluate(
                "() => { const r = window.__q('#anything-llm-chat').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
            light_raf = [f for f in frames if lum(parse_rgb(f["bg"])) > 0.2 or parse_rgb(f["bg"])[3] == 0]
            x, y, w, h = (int(v) for v in rect)
            after = []
            for ts, data in sorted(shots):
                if ts < mount - 1:
                    continue
                im = Image.open(io.BytesIO(base64.b64decode(data))).convert("L")
                arr = np.asarray(im).astype(float)
                region = arr[max(y + 8, 0): y + h - 8, max(x + 8, 0): x + w - 8]
                after.append((ts - mount, float(region.mean()), im))
            name = "inline" if "Inline" in label else "bubble"
            if after:
                after[0][2].save(RESULTS_DIR / f"nak4-first-frame-{name}.png")
            light_cast = [a for a in after if a[1] > 90]
            first = after[0][0] if after else None
            ok = not light_raf and not light_cast and first is not None and first <= 50
            record(f"NAK-4 kein heller Frame ({label})", ok,
                   f"rAF: {len(frames)} Frames ab Mount, helle={len(light_raf)}, erster bg={frames[0]['bg'] if frames else None}; "
                   f"Screencast: {len(after)} Frames ab Mount, erster {first:.0f} ms nach Mount, "
                   f"Helligkeit Fenster max {max(a[1] for a in after):.0f}/255, helle={len(light_cast)}" if after else
                   f"keine Screencast-Frames nach Mount")
        finally:
            ctx.close()


def check_snippet(browser, base_url):
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**OPEN, "position": "top-right", "greeting": "Hallo Snippet-Test", "no-header": "true"}},
        Mock(config={}))
    try:
        wait_shadow(page, "#message-input")
        settle(page, 300)
        res = page.evaluate(
            """() => ({
          greeting: [...window.__allmShadow.querySelectorAll('p')].some(p => p.textContent.includes('Hallo Snippet-Test')),
          header: !!window.__q('#anything-llm-header'),
          win: (() => { const r = window.__q('#anything-llm-chat').getBoundingClientRect(); return {top: r.top, right: innerWidth - r.right}; })(),
        })"""
        )
        ok = res["greeting"] and not res["header"] and res["win"]["top"] < 40 and res["win"]["right"] < 40
        record("NAK-5 Snippet (position/greeting/no-header)", ok, json.dumps(res))
    finally:
        ctx.close()
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**BASE_ATTRS, "display-mode": "inline", "inherit-font": "true"}, "inline": True}, Mock(config={}))
    try:
        wait_shadow(page, "#anything-llm-inline-bar")
        ff = page.evaluate("() => __cs('#anything-llm-inline-bar', 'font-family')")
        record("NAK-5 Snippet (data-inherit-font)", "Georgia" in ff, f"Leiste font-family={ff}")
    finally:
        ctx.close()
    # --allm-font auf dem Host wirkt (ohne inheritFont)
    ctx, page = open_page(
        browser, base_url,
        {"attrs": {**BASE_ATTRS, "display-mode": "inline"}, "inline": True,
         "css": "#kufer-assistent { --allm-font: 'Courier New', monospace; --allm-bar-radius: 999px; }"},
        Mock(config={}))
    try:
        wait_shadow(page, "#anything-llm-inline-bar")
        ff = page.evaluate("() => __cs('#anything-llm-inline-bar', 'font-family')")
        rad = page.evaluate("() => __cs('#anything-llm-inline-bar', 'border-top-left-radius')")
        record("--allm-font / --allm-bar-radius über Vorfahre #kufer-assistent", "Courier" in ff and rad == "999px",
               f"font-family={ff}, radius={rad}")
    finally:
        ctx.close()


def check_size(dist_dir):
    js = (pathlib.Path(dist_dir) / "anythingllm-chat-widget.min.js").stat().st_size
    css = (pathlib.Path(dist_dir) / "anythingllm-chat-widget.min.css").stat().st_size
    record("AK-12 Build-Größe", js <= BASE_JS_SIZE * 1.05 and css <= BASE_CSS_SIZE * 1.05,
           f"JS {BASE_JS_SIZE} -> {js} B ({(js / BASE_JS_SIZE - 1) * 100:+.2f} %), "
           f"CSS {BASE_CSS_SIZE} -> {css} B ({(css / BASE_CSS_SIZE - 1) * 100:+.2f} %)")


def check_live(browser, base_url):
    """Echter Container praesentation: dunkles Theme, eine Testfrage."""
    ctx, page = open_page(browser, base_url, {"attrs": {**OPEN, "theme": "dark"}}, live=True)
    try:
        wait_shadow(page, "#message-input", timeout=30000)
        page.evaluate("() => { const t = window.__q('#message-input'); t.focus(); }")
        page.keyboard.type("Gibt es Integrationskurse?")
        page.keyboard.press("Enter")
        page.wait_for_function(
            "() => !!window.__q('.allm-reply') || !!window.__q('.allm-anything-llm-assistant-message')",
            timeout=90000)
        # warten, bis der Antworttext 3 s lang unverändert ist (Stream fertig)
        last, stable_since = None, time.time()
        deadline = time.time() + 120
        while time.time() < deadline:
            txt = page.evaluate(
                "() => { const els = window.__allmShadow.querySelectorAll('.allm-reply, .allm-anything-llm-assistant-message'); return els.length ? els[els.length - 1].textContent : ''; }")
            if txt != last:
                last, stable_since = txt, time.time()
            elif txt and time.time() - stable_since > 3:
                break
            page.wait_for_timeout(500)
        settle(page, 300)
        page.screenshot(path=str(RESULTS_DIR / "live-dark-answer.png"), animations="disabled", caret="hide")
        bub = page.evaluate(
            "() => { const b = window.__q('.allm-anything-llm-assistant-message') || window.__q('.allm-reply').closest('div[style]'); return getComputedStyle(b).backgroundColor; }")
        record("LIVE praesentation dunkel", lum(parse_rgb(bub)) < 0.05, f"Antwortblase={bub}, Fehler={errors_of(page)}")
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="Referenz-Screenshots erzeugen")
    ap.add_argument("--dist", default=str(ROOT / "dist"), help="Verzeichnis mit dem gebauten Widget")
    ap.add_argument("--live", action="store_true", help="zusätzlich Live-Lauf gegen praesentation")
    ap.add_argument("--only", nargs="*", help="nur diese Pixel-Zustände (z. B. für --baseline)")
    args = ap.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    srv, base_url = start_server(args.dist)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            run_pixel(browser, base_url, args.baseline, args.only)
            if not args.baseline:
                check_host_css_wins(browser, base_url)
                check_precedence(browser, base_url)
                check_dark(browser, base_url)
                dark_review_shots(browser, base_url)
                mockup_shots(browser, base_url)
                check_auto(browser, base_url)
                check_hover_icons(browser, base_url)
                check_header_border(browser, base_url)
                check_brand_header_dark(browser, base_url)
                check_stream_font_size(browser, base_url)
                check_inline_theme_explicit(browser, base_url)
                check_server_theme(browser, base_url)
                check_legacy(browser, base_url)
                check_reduced_motion(browser, base_url)
                check_invalid_theme(browser, base_url)
                check_focus_ring(browser, base_url)
                check_foreign_styles(browser, base_url)
                check_sibling_vars(browser, base_url)
                check_no_flash(browser, base_url)
                check_snippet(browser, base_url)
                check_size(args.dist)
                if args.live:
                    check_live(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} Prüfungen bestanden.")
    (RESULTS_DIR / "summary.json").write_text(
        json.dumps([{"check": k, "ok": ok, "detail": d} for k, ok, d in RESULTS], ensure_ascii=False, indent=2)
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
