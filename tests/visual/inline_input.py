#!/usr/bin/env python3
"""Playwright-Tests: Inline-Leiste als Eingabefeld mit Wunschfragen-Chips
(data-inline-input / visual_config.inlineInput).

Einrichtung wie tests/visual/theme_visual.py (requirements.txt + chromium).

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenzen der Bestandszustände vom UNVERÄNDERTEN Build (main 02f1d87),
  #    nur fehlende Dateien, bestehende werden nie überschrieben
  python3 tests/visual/inline_input.py --baseline --dist /pfad/zum/alten/dist

  # 2) Referenzen der NEUEN Zustände (gibt es auf main nicht) aus diesem Branch
  python3 tests/visual/inline_input.py --baseline --new-states

  # 3) Prüfen (npm run build vorher)
  python3 tests/visual/inline_input.py

  # optional: AK-3 live auf der Vorschau-Website (eine echte Frage). Erzeugt
  # einen ECHTEN Chat auf dem Demo-Container (Kontingent, Verlauf) und läuft
  # daher nur mit ausdrücklicher Freigabe per Umgebungsvariable:
  EMBED_LIVE_TESTS=1 python3 tests/visual/inline_input.py --live-demo

Alle Aufrufe an praesentation werden gemockt (Config, Status, Verlauf,
stream-chat); stream-chat-Anfragen werden gezählt (genau 1 / 0 Anfragen).
Ergebnisse: tests/visual/results/inline-input-*.png, summary-inline-input.json.
"""

import argparse
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402  (Infrastruktur: Server, Mock, Shadow-Zugriff)
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BASELINE_DIR = tv.BASELINE_DIR
RESULTS_DIR = tv.RESULTS_DIR
record = tv.record

INLINE = {**tv.BASE_ATTRS, "display-mode": "inline"}
INPUT = {
    **INLINE,
    "inline-input": "true",
    "inline-input-placeholder": "Stellen Sie hier Ihre Frage …",
    "inline-send-text": "Chatten",
    "default-messages": "Spanisch A1,Yoga,KI-Basics,Töpfern",
}
CHIPS_4 = ["Spanisch A1", "Yoga", "KI-Basics", "Töpfern"]
TEN = ",".join(f"Wunschfrage Nummer {i + 1}" for i in range(10))
SMALL = {"width": 360, "height": 740}
QUESTION = "Gibt es Yogakurse am Abend?"
CHUNK = "Ja, wir haben Yogakurse am Abend."
STREAM = [
    {"uuid": "u-1", "type": "textResponseChunk", "close": False, "sources": [], "textResponse": CHUNK},
    {"uuid": "u-1", "type": "finalizeResponseStream", "close": True, "sources": [], "textResponse": "",
     "chatId": 4712},
]
# Mockup "vhs Rhein" (README): Pille 999px, Archivo -> System-Schrift im Test
MOCKUP_CSS = (
    "#anythingllm-embed-widget { --allm-bar-radius: 999px; --allm-radius: 12px; "
    "--allm-accent: #B45309; --allm-bar-bg: rgba(255, 255, 255, .82); --allm-bar-border: rgba(23, 24, 27, .14); }"
)
# Konfiguration ohne defaultMessages vom Server (Chips kommen aus dem Script)
CFG_NO_MSGS = {k: v for k, v in tv.PRAES_CONFIG.items() if k != "defaultMessages"}


class CountingMock(tv.Mock):
    """Mock wie in theme_visual, zählt zusätzlich stream-chat-Anfragen."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.stream_requests = []

    def handle(self, route):
        if route.request.url.split("?")[0].endswith("/stream-chat"):
            try:
                body = json.loads(route.request.post_data or "{}")
            except Exception:
                body = {"raw": route.request.post_data}
            self.stream_requests.append(body)
        return super().handle(route)


def mock(**k):
    k.setdefault("config", CFG_NO_MSGS)
    k.setdefault("stream", STREAM)
    return CountingMock(**k)


class HeldHistoryMock(CountingMock):
    """Wie mock(), hält aber das Laden des Verlaufs an, bis release_history()
    aufgerufen wird: der Chat ist aufgeklappt, der ChatContainer aber noch nicht
    bereit -> die Frage aus der Leiste ist noch nicht verbraucht."""

    def __init__(self, *a, **k):
        k.setdefault("config", CFG_NO_MSGS)
        k.setdefault("stream", STREAM)
        super().__init__(*a, **k)
        self.held = []
        self.holding = True

    def handle(self, route):
        path = route.request.url.split("?")[0]
        is_history = (route.request.method == "GET" and not path.endswith(("/config", "/status", "/audio/status",
                                                                            "/conversations")))
        if self.holding and is_history:
            self.held.append(route)
            return None
        return super().handle(route)

    def release_history(self):
        self.holding = False
        while self.held:
            route = self.held.pop(0)
            route.fulfill(json={"history": self.history})


# Touch-Telefon (pointer: coarse, hover: none)
TOUCH = {"has_touch": True, "is_mobile": True}


# ---------------------------------------------------------------------------
# Pixel-Zustände
# ---------------------------------------------------------------------------
# (name, cfg, mock, wait-selector, viewport, Referenz-Herkunft)
#   "main": Referenz vom unveränderten Build (AK-1 / NAK-3)
#   "new":  neuer Zustand, Referenz aus diesem Branch (Regressionsschutz)
def pixel_cases():
    return [
        # AK-1: Bestandsreferenzen aus theme_visual (main d3e6646-Linie)
        ("inline-collapsed", {"attrs": INLINE, "inline": True}, tv.Mock(), "#anything-llm-inline-bar", None, "main"),
        ("inline-dark-collapsed", {"attrs": {**INLINE, "inline-theme": "dark"}, "inline": True}, tv.Mock(),
         "#anything-llm-inline-bar", None, "main"),
        ("mobile-inline-collapsed", {"attrs": INLINE, "inline": True}, tv.Mock(), "#anything-llm-inline-bar",
         tv.MOBILE, "main"),
        # AK-1: weitere Bestandszustände, Referenz von main 02f1d87
        ("ii-default-360-10msgs", {"attrs": {**INLINE, "default-messages": TEN}, "inline": True},
         tv.Mock(config=CFG_NO_MSGS), "#anything-llm-inline-bar", SMALL, "main"),
        ("ii-default-theme-dark", {"attrs": {**INLINE, "theme": "dark"}, "inline": True}, tv.Mock(),
         "#anything-llm-inline-bar", None, "main"),
        ("ii-default-mockup-css", {"attrs": INLINE, "inline": True, "css": MOCKUP_CSS}, tv.Mock(),
         "#anything-llm-inline-bar", None, "main"),
        # NAK-3: Blase mit data-inline-input="true" = Blase ohne (Referenz main)
        ("ii-bubble-closed-with-input-attr", {"attrs": {**tv.BASE_ATTRS, "inline-input": "true"}}, tv.Mock(),
         "#anything-llm-embed-chat-button", None, "main"),
        ("ii-bubble-open-with-input-attr",
         {"attrs": {**tv.BASE_ATTRS, "open-on-load": "on", "inline-input": "true"}}, tv.Mock(),
         "#message-input", None, "main"),
        # neue Zustände
        ("ii-input-light", {"attrs": INPUT, "inline": True}, mock(), "#anything-llm-inline-input", None, "new"),
        ("ii-input-dark", {"attrs": {**INPUT, "theme": "dark"}, "inline": True}, mock(),
         "#anything-llm-inline-input", None, "new"),
        ("ii-input-mockup-css", {"attrs": INPUT, "inline": True, "css": MOCKUP_CSS}, mock(),
         "#anything-llm-inline-input", None, "new"),
        ("ii-input-mobile", {"attrs": INPUT, "inline": True}, mock(), "#anything-llm-inline-input", tv.MOBILE,
         "new"),
        ("ii-input-360-10chips", {"attrs": {**INPUT, "default-messages": TEN}, "inline": True}, mock(),
         "#anything-llm-inline-input", SMALL, "new"),
    ]


# Referenz für die Bubble-Fälle: dieselbe Seite OHNE Attribut -> Bestandsreferenz
REF_ALIAS = {
    "ii-bubble-closed-with-input-attr": "bubble-closed",
    "ii-bubble-open-with-input-attr": "bubble-open-empty",
}


def shoot(browser, base_url, case, out_path):
    name, cfg, m, sel, viewport, _ = case
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport)
    try:
        tv.wait_shadow(page, sel)
        tv.settle(page)
        page.mouse.move(0, 0)
        page.wait_for_timeout(100)
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return tv.errors_of(page), page.console_log
    finally:
        ctx.close()


def run_pixel(browser, base_url, baseline, new_states, only=None):
    for case in pixel_cases():
        name, origin = case[0], case[5]
        if only and name not in only:
            continue
        if baseline:
            # --baseline: alter Build -> nur "main"; --new-states -> nur "new"
            if (origin == "new") != new_states or name in REF_ALIAS:
                continue
            out = BASELINE_DIR / f"{name}.png"
            if out.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            errs, _ = shoot(browser, base_url, case, out)
            print(f"[BASE] {name} -> {out.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        out = RESULTS_DIR / f"inline-input-{name}.png"
        errs, log = shoot(browser, base_url, case, out)
        ref = BASELINE_DIR / f"{REF_ALIAS.get(name, name)}.png"
        if not ref.exists():
            record(f"PIX {name}", False, "keine Referenz (erst --baseline laufen lassen)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"inline-input-{name}.diff.png")
        if name in REF_ALIAS:
            key = "NAK-3"
            warns = [t for (k, t) in log if k == "warning" and "inlineInput" in t]
            ok = ratio <= tv.MAX_DIFF_RATIO and not errs and len(warns) == 1
            detail = f"Pixel-Diff zu {ref.name} {ratio * 100:.4f} %, inlineInput-Warnungen={len(warns)}"
        else:
            key = "AK-1 default-unchanged" if origin == "main" else "REG"
            ok = ratio <= tv.MAX_DIFF_RATIO and not errs
            detail = f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})"
        record(f"{key} {name}", ok, detail + (f", Konsole: {errs}" if errs else ""))


# ---------------------------------------------------------------------------
# Hilfen
# ---------------------------------------------------------------------------
def active_id(page):
    return page.evaluate(
        "() => { const a = window.__allmShadow && window.__allmShadow.activeElement; return a ? a.id || a.className : null; }")


def collapsed(page):
    """Leiste sichtbar, Chat nicht gemountet oder (nach dem ersten Öffnen) ausgeblendet."""
    return page.evaluate(
        "() => { const c = window.__q('#anything-llm-chat'); return !!window.__q('#anything-llm-inline-bar') && (!c || c.getBoundingClientRect().height === 0); }")


def expanded_state(page):
    return page.evaluate(
        """() => {
      const win = window.__q('#anything-llm-chat');
      const host = document.getElementById('anythingllm-embed-widget');
      if (!win) return { open: false };
      const r = win.getBoundingClientRect();
      return {
        open: r.width > 0 && r.height > 0 && !window.__q('#anything-llm-inline-bar'),
        overlay: getComputedStyle(win).position === 'fixed',
        hostParent: host.parentElement && (host.parentElement.id || host.parentElement.tagName),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    }""")


def type_in_bar(page, text):
    page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
    page.keyboard.type(text)


def wait_user_and_token(page, question, token=CHUNK, timeout=10000):
    t0 = time.time()
    page.wait_for_function(
        """([q, tok]) => {
      const users = [...window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message')].map(e => e.textContent);
      const all = window.__allmShadow.textContent;
      return users.some(u => u.includes(q)) && all.includes(tok);
    }""",
        arg=[question, token], timeout=timeout)
    return time.time() - t0


def bar_value(page):
    return page.evaluate("() => { const i = window.__q('#anything-llm-inline-input'); return i ? i.value : null; }")


def user_messages(page):
    return page.evaluate(
        "() => [...window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message')].map(e => e.textContent.trim())")


def click_collapse(page):
    """Header-Knopf „Einklappen“ (bzw. „Close“ im Overlay) — braucht keinen Fokus im Widget."""
    page.evaluate(
        "() => window.__q('button[aria-label=\"Einklappen\"], button[aria-label=\"Close\"]').click()")


def bar_center_left(page):
    """Koordinaten im linken Innenabstand der Leiste (links neben dem Feld)."""
    return page.evaluate(
        "() => { const b = window.__q('#anything-llm-inline-bar').getBoundingClientRect(); const f = window.__q('#anything-llm-inline-input').getBoundingClientRect(); return [b.x + (f.x - b.x) / 2, b.y + b.height / 2]; }")


# ---------------------------------------------------------------------------
# Funktionsprüfungen
# ---------------------------------------------------------------------------
def check_ak2(browser, base_url):
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        st = page.evaluate(
            """() => ({
          form: window.__q('#anything-llm-inline-bar').tagName,
          placeholder: window.__q('#anything-llm-inline-input').placeholder,
          type: window.__q('#anything-llm-inline-input').type,
          button: window.__q('#anything-llm-inline-send').textContent,
          buttonType: window.__q('#anything-llm-inline-send').type,
        })""")
        ok = (st["form"] == "FORM" and st["placeholder"] == "Stellen Sie hier Ihre Frage …"
              and st["button"] == "Chatten" and st["buttonType"] == "submit" and collapsed(page)
              and not m.stream_requests)
        record("AK-2 Eingabe in der Leiste", ok, f"{json.dumps(st, ensure_ascii=False)}, eingeklappt={collapsed(page)}")
    finally:
        ctx.close()


def check_send(browser, base_url, how, viewport=None, key="AK-3"):
    """Enter / Knopf / Chip: aufgeklappt, Nutzer-Nachricht, Token, genau 1 Anfrage."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m, viewport=viewport)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        q = QUESTION
        if how == "enter":
            type_in_bar(page, q)
            page.keyboard.press("Enter")
        elif how == "button":
            type_in_bar(page, q)
            page.evaluate("() => window.__q('#anything-llm-inline-send').click()")
        elif how == "button-mouse":
            type_in_bar(page, q)
            box = page.evaluate(
                "() => { const r = window.__q('#anything-llm-inline-send').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
            page.mouse.click(*box)
        elif how.startswith("chip"):
            q = CHIPS_4[int(how[-1])]
            box = page.evaluate(
                "(i) => { const r = window.__allmShadow.querySelectorAll('.allm-inline-chip')[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }",
                int(how[-1]))
            page.mouse.click(*box)
        dt = wait_user_and_token(page, q)
        page.wait_for_timeout(400)
        st = expanded_state(page)
        reqs = m.stream_requests
        body = reqs[0] if reqs else {}
        ok = st.get("open") and len(reqs) == 1 and body.get("message") == q and dt < 10
        if viewport:
            ok = ok and st.get("overlay") and st.get("hostParent") == "BODY"
        detail = (f"Zustand={json.dumps(st)}, Anfragen={len(reqs)}, message={body.get('message')!r}, "
                  f"sessionId={'ja' if body.get('sessionId') else 'nein'}, conversationId={body.get('conversationId')!r}, "
                  f"Nachricht+Token nach {dt:.2f} s")
        record(f"{key} ({how}{', ' + str(viewport['width']) + 'px' if viewport else ''})", ok, detail)
        if how == "enter" and not viewport:
            page.screenshot(path=str(RESULTS_DIR / "inline-input-after-enter.png"), animations="disabled", caret="hide")
        if viewport and how == "enter":
            page.screenshot(path=str(RESULTS_DIR / "inline-input-mobile-overlay.png"), animations="disabled",
                            caret="hide")
        return body
    finally:
        ctx.close()


def check_empty(browser, base_url):
    for label, text, action in (("Enter leer", "", "enter"), ("Knopf Leerzeichen", "   ", "button"),
                                ("Enter Leerzeichen", "   ", "enter")):
        m = mock()
        ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
        try:
            tv.wait_shadow(page, "#anything-llm-inline-input")
            type_in_bar(page, text)
            if action == "enter":
                page.keyboard.press("Enter")
            else:
                page.evaluate("() => window.__q('#anything-llm-inline-send').click()")
            tv.wait_shadow(page, "#message-input")
            page.wait_for_timeout(1200)
            st = expanded_state(page)
            focus = active_id(page)
            ok = st.get("open") and not m.stream_requests and focus == "message-input"
            record(f"AK-5 leeres Feld sendet nicht ({label})", ok,
                   f"offen={st.get('open')}, Anfragen={len(m.stream_requests)}, Fokus={focus}")
        finally:
            ctx.close()


def check_chips(browser, base_url):
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        texts = page.evaluate(
            "() => [...window.__allmShadow.querySelectorAll('.allm-inline-chip')].map(c => c.textContent)")
        below = page.evaluate(
            "() => window.__q('#anything-llm-inline-chips').getBoundingClientRect().top >= window.__q('#anything-llm-inline-bar').getBoundingClientRect().bottom")
        record("AK-6 Chips aus defaultMessages", texts == CHIPS_4 and below,
               f"Chips={texts}, unter der Leiste={below}")
    finally:
        ctx.close()
    # Klick auf einen Chip = wie Enter
    check_send(browser, base_url, "chip1", key="AK-6 Chip-Klick")
    # leerer Verlauf nach Aufklappen: Chips weg, Chat-Vorschläge nur einmal
    m = mock(config=tv.PRAES_CONFIG)
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**INPUT}, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        page.keyboard.press("Tab")
        page.keyboard.press("Enter")
        tv.wait_shadow(page, ".msg-suggestion")
        page.wait_for_timeout(500)
        st = page.evaluate(
            """() => ({
          chips: window.__allmShadow.querySelectorAll('.allm-inline-chip').length,
          suggestions: [...window.__allmShadow.querySelectorAll('.msg-suggestion')].map(b => b.textContent),
        })""")
        ok = st["chips"] == 0 and len(st["suggestions"]) == len(set(st["suggestions"])) > 0
        record("AK-6 keine doppelten Vorschläge (aufgeklappt, leerer Verlauf)", ok, json.dumps(st, ensure_ascii=False))
    finally:
        ctx.close()


def check_chips_small(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**INPUT, "default-messages": TEN}, "inline": True},
                             mock(), viewport=SMALL)
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        tv.settle(page, 300)
        st = page.evaluate(
            """() => {
          const chips = [...window.__allmShadow.querySelectorAll('.allm-inline-chip')];
          const rows = new Set(chips.map(c => Math.round(c.getBoundingClientRect().top)));
          const right = Math.max(...chips.map(c => c.getBoundingClientRect().right));
          return { chips: chips.length, rows: rows.size, maxRight: Math.round(right),
                   scrollWidth: document.documentElement.scrollWidth, inner: window.innerWidth };
        }""")
        ok = st["chips"] <= 6 and st["rows"] >= 2 and st["scrollWidth"] <= 360 and st["maxRight"] <= 360
        record("AK-7 höchstens 6 Chips, Umbruch, kein Querscrollen (360 px)", ok, json.dumps(st))
    finally:
        ctx.close()


def check_theme_vars(browser, base_url):
    css = ("#anythingllm-embed-widget { --allm-bar-bg: rgb(1, 2, 3); --allm-accent: rgb(200, 100, 50); "
           "--allm-radius: 7px; --allm-bar-text: rgb(250, 250, 250); --allm-bar-border: rgb(9, 9, 9); }")
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True, "css": css}, mock())
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        st = page.evaluate(
            """() => {
          const s = (sel, p) => getComputedStyle(window.__q(sel)).getPropertyValue(p);
          return {
            barBg: s('#anything-llm-inline-bar', 'background-color'),
            barRadius: s('#anything-llm-inline-bar', 'border-top-left-radius'),
            barText: s('#anything-llm-inline-input', 'color'),
            buttonBg: s('#anything-llm-inline-send', 'background-color'),
            buttonRadius: s('#anything-llm-inline-send', 'border-top-left-radius'),
            hasIcon: !!window.__q('#anything-llm-inline-bar svg'),
            chipBg: s('.allm-inline-chip', 'background-color'),
            chipRadius: s('.allm-inline-chip', 'border-top-left-radius'),
            chipBorder: s('.allm-inline-chip', 'border-top-color'),
            chipText: s('.allm-inline-chip', 'color'),
          };
        }""")
        ok = (st["barBg"] == "rgb(1, 2, 3)" and st["barRadius"] == "7px" and st["buttonBg"] == "rgb(200, 100, 50)"
              and st["buttonRadius"] == "1px" and st["hasIcon"] is False
              and st["chipBg"] == "rgb(1, 2, 3)" and st["chipRadius"] == "7px"
              and st["chipBorder"] == "rgb(9, 9, 9)" and st["chipText"] == "rgb(250, 250, 250)"
              and st["barText"] == "rgb(250, 250, 250)")
        record("AK-10 Theme-Variablen (Leiste, Knopf, Chips)", ok, json.dumps(st))
    finally:
        ctx.close()
    # ohne Seiten-CSS: Standardwerte = bestehende Leisten-Variablen
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, mock())
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        st = page.evaluate(
            """() => ({
          barBg: getComputedStyle(window.__q('#anything-llm-inline-bar')).backgroundColor,
          buttonBg: getComputedStyle(window.__q('#anything-llm-inline-send')).backgroundColor,
          accentVar: getComputedStyle(document.getElementById('anythingllm-embed-widget')).getPropertyValue('--allmi-accent').trim(),
        })""")
        record("AK-10 Standard (praesentation buttonColor)", st["barBg"] == "rgb(255, 255, 255)"
               and st["buttonBg"] == "rgb(255, 161, 2)", json.dumps(st))
    finally:
        ctx.close()


def check_keyboard(browser, base_url):
    ring = "3px solid rgb(10, 20, 30)"
    css = f"#anythingllm-embed-widget {{ --allm-focus-ring: {ring}; }}"
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True, "css": css}, m)
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        seen = []
        probe = """(sel) => {
          const a = window.__allmShadow.activeElement;
          const el = sel ? window.__q(sel) : a;
          const c = getComputedStyle(el);
          return { active: a ? (a.id || a.textContent) : null, style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor };
        }"""
        page.keyboard.press("Tab")
        seen.append(("Feld", page.evaluate(probe, "#anything-llm-inline-bar")))
        page.screenshot(path=str(RESULTS_DIR / "inline-input-focus-field.png"), animations="disabled", caret="hide")
        page.keyboard.press("Tab")
        seen.append(("Knopf", page.evaluate(probe, None)))
        for chip in CHIPS_4:
            page.keyboard.press("Tab")
            seen.append((chip, page.evaluate(probe, None)))
        exp = ["anything-llm-inline-input", "anything-llm-inline-send", *CHIPS_4]
        ok_focus = all(s[1]["style"] == "solid" and s[1]["width"] == "3px" and s[1]["color"] == "rgb(10, 20, 30)"
                       for s in seen)
        ok_order = [s[1]["active"] for s in seen] == exp
        record("AK-11 Tab-Reihenfolge Feld → Knopf → Chips", ok_order, json.dumps([s[1]["active"] for s in seen],
                                                                                    ensure_ascii=False))
        record("AK-11 Fokusring --allm-focus-ring", ok_focus,
               "; ".join(f"{n}: {s['style']} {s['width']} {s['color']}" for n, s in seen))
        # Enter auf dem letzten Chip (Töpfern) löst aus
        page.keyboard.press("Enter")
        wait_user_and_token(page, "Töpfern")
        record("AK-11 Chip per Enter", len(m.stream_requests) == 1 and m.stream_requests[0].get("message") == "Töpfern",
               f"Anfragen={len(m.stream_requests)}, message={m.stream_requests[0].get('message') if m.stream_requests else None!r}")
    finally:
        ctx.close()
    # Leertaste auf einem Chip
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        for _ in range(3):  # Feld, Knopf, erster Chip
            page.keyboard.press("Tab")
        page.keyboard.press("Space")
        wait_user_and_token(page, "Spanisch A1")
        record("AK-11 Chip per Leertaste", len(m.stream_requests) == 1
               and m.stream_requests[0].get("message") == "Spanisch A1", f"Anfragen={len(m.stream_requests)}")
    finally:
        ctx.close()
    # dunkles Theme ohne Seiten-CSS: Ring = 2px Akzent (wie Buttons)
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**INPUT, "theme": "dark"}, "inline": True}, mock())
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        page.keyboard.press("Tab")
        st = page.evaluate(
            "() => { const c = getComputedStyle(window.__q('#anything-llm-inline-bar')); return [c.outlineStyle, c.outlineWidth, c.outlineColor]; }")
        record("AK-11 Fokusring dunkel ohne Seiten-CSS", st == ["solid", "2px", "rgb(255, 161, 2)"], json.dumps(st))
        page.screenshot(path=str(RESULTS_DIR / "inline-input-focus-dark.png"), animations="disabled", caret="hide")
    finally:
        ctx.close()


def check_double_enter(browser, base_url):
    for label in ("Enter 2x", "Knopf Doppelklick", "Enter + Knopf"):
        m = mock(stream="hang")
        ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
        try:
            tv.wait_shadow(page, "#anything-llm-inline-input")
            type_in_bar(page, QUESTION)
            if label == "Enter 2x":
                page.keyboard.press("Enter")
                page.keyboard.press("Enter")
            elif label == "Knopf Doppelklick":
                box = page.evaluate(
                    "() => { const r = window.__q('#anything-llm-inline-send').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
                page.mouse.dblclick(*box)
            else:
                page.evaluate(
                    "() => { const f = window.__q('#anything-llm-inline-bar'); const b = window.__q('#anything-llm-inline-send'); f.requestSubmit(); b.click(); }")
            page.wait_for_timeout(2500)
            users = page.evaluate(
                "() => window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message').length")
            record(f"NAK-1 keine Doppelsendung ({label})", len(m.stream_requests) == 1 and users == 1,
                   f"Anfragen={len(m.stream_requests)}, Nutzer-Nachrichten={users}")
        finally:
            m.release()
            ctx.close()


def check_draft(browser, base_url):
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        type_in_bar(page, "Töpfern am Wochenende")
        page.mouse.click(*bar_center_left(page))
        tv.wait_shadow(page, "#message-input")
        page.wait_for_timeout(1200)
        st = page.evaluate(
            "() => ({ value: window.__q('#message-input').value, users: window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message').length })")
        focus = active_id(page)
        ok = (st["value"] == "Töpfern am Wochenende" and st["users"] == 0 and not m.stream_requests
              and expanded_state(page).get("open"))
        record("NAK-2 Text wandert ins Chat-Eingabefeld (Klick neben das Feld)", ok,
               f"{json.dumps(st, ensure_ascii=False)}, Anfragen={len(m.stream_requests)}, Fokus={focus}")
    finally:
        ctx.close()
    # Klick ins Feld selbst klappt nicht auf
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, mock())
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        box = page.evaluate(
            "() => { const r = window.__q('#anything-llm-inline-input').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; }")
        page.mouse.click(*box)
        page.wait_for_timeout(500)
        record("NAK-2 Klick ins Feld bleibt eingeklappt", collapsed(page) and active_id(page) == "anything-llm-inline-input",
               f"eingeklappt={collapsed(page)}, Fokus={active_id(page)}")
    finally:
        ctx.close()


def check_replace_after_close(browser, base_url):
    """Fund 1: B nach Escape bei noch nicht verbrauchter A -> Chat offen, B
    gesendet, A nicht. Die Leiste ist nie „tot“."""
    m = HeldHistoryMock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        type_in_bar(page, "Frage A")
        page.keyboard.press("Enter")
        tv.wait_shadow(page, "#anything-llm-chat")
        page.wait_for_timeout(300)
        # Fokus ins Widget (Header-Knopf), dann Escape
        page.evaluate("() => window.__q('button[aria-label=\"Einklappen\"]').focus()")
        page.keyboard.press("Escape")
        page.wait_for_function("() => !!window.__q('#anything-llm-inline-input')")
        restored = bar_value(page)
        page.evaluate("() => { const i = window.__q('#anything-llm-inline-input'); i.focus(); i.select(); }")
        page.keyboard.type("Frage B")
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        opened = expanded_state(page).get("open")
        m.release_history()
        try:
            wait_user_and_token(page, "Frage B")
        except Exception:
            pass  # B kam nicht an -> unten als Fehler erfasst
        page.wait_for_timeout(800)
        msgs = [r.get("message") for r in m.stream_requests]
        users = user_messages(page)
        ok = restored == "Frage A" and opened and msgs == ["Frage B"] and users == ["Frage B"]
        record("Fund 1 B nach Escape bei unverbrauchter A (B gesendet, A nicht)", ok,
               f"Text nach Escape={restored!r}, offen={opened}, Anfragen={msgs}, Nutzer-Nachrichten={users}")
    finally:
        ctx.close()


def check_close_discards(browser, base_url):
    """Fund 2: Enter -> Zuklappen vor Verbrauch -> 0 Anfragen, Text wieder im Feld."""
    for label, viewport in (("Box", None), ("Mobil-Overlay", tv.MOBILE)):
        m = HeldHistoryMock()
        ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m, viewport=viewport)
        try:
            tv.wait_shadow(page, "#anything-llm-inline-input")
            type_in_bar(page, QUESTION)
            page.keyboard.press("Enter")
            tv.wait_shadow(page, "#anything-llm-chat")
            page.wait_for_timeout(300)
            click_collapse(page)
            page.wait_for_function("() => !!window.__q('#anything-llm-inline-input')")
            value = bar_value(page)
            # Verlauf jetzt laden: der (ausgeblendete) Chat wird bereit, darf aber nichts senden
            m.release_history()
            page.wait_for_timeout(1500)
            ok = value == QUESTION and not m.stream_requests and collapsed(page) and not user_messages(page)
            record(f"Fund 2 Zuklappen vor Verbrauch verwirft die Frage ({label})", ok,
                   f"Feld={value!r}, Anfragen={len(m.stream_requests)}, eingeklappt={collapsed(page)}")
        finally:
            ctx.close()


def check_touch_no_keyboard(browser, base_url):
    """Fund 3: Touch-Telefon, Enter aus der Leiste -> während der laufenden
    Antwort liegt der Fokus NICHT im Chat-Eingabefeld (keine Tastatur)."""
    m = mock(stream="hang")
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m, viewport=tv.MOBILE,
                             context_options=TOUCH)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        coarse = page.evaluate("() => matchMedia('(pointer: coarse)').matches")
        # jeden Fokuswechsel im Widget mitschreiben: auch ein kurzer Fokus aufs
        # Chat-Feld (danach durch disabled wieder verloren) öffnet die Tastatur
        page.evaluate(
            "() => { window.__focusLog = []; window.__allmShadow.addEventListener('focusin', (e) => window.__focusLog.push(e.target.id || e.target.tagName)); }")
        type_in_bar(page, QUESTION)
        page.keyboard.press("Enter")
        page.wait_for_function(
            "(q) => [...window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message')].some(e => e.textContent.includes(q))",
            arg=QUESTION, timeout=10000)
        page.wait_for_timeout(1500)
        focus = active_id(page)
        log = page.evaluate("() => window.__focusLog")
        st = expanded_state(page)
        ok = (coarse and st.get("overlay") and len(m.stream_requests) == 1 and focus != "message-input"
              and "message-input" not in log)
        record("Fund 3 Touch: keine Tastatur über der laufenden Antwort", ok,
               f"pointer:coarse={coarse}, Overlay={st.get('overlay')}, Anfragen={len(m.stream_requests)}, "
               f"Fokus={focus}, Fokuswechsel={log}")
    finally:
        m.release()
        ctx.close()


def check_draft_append(browser, base_url):
    """Fund 4: Entwurf aus der Leiste überschreibt Getipptes im Chat-Feld nicht."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        page.keyboard.press("Enter")  # leer: nur aufklappen
        tv.wait_shadow(page, "#message-input")
        page.wait_for_timeout(500)
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.type("Ich suche")
        click_collapse(page)
        page.wait_for_function("() => !!window.__q('#anything-llm-inline-input')")
        type_in_bar(page, "Yoga am Abend")
        page.mouse.click(*bar_center_left(page))
        page.wait_for_timeout(800)
        value = page.evaluate("() => window.__q('#message-input').value")
        ok = value == "Ich suche Yoga am Abend" and not m.stream_requests and expanded_state(page).get("open")
        record("Fund 4 Entwurf an Getipptes im Chat-Feld angehängt", ok,
               f"Chat-Feld={value!r}, Anfragen={len(m.stream_requests)}")
    finally:
        ctx.close()


def check_escape_focus_narrow(browser, base_url):
    """Fund 5: Desktop 700 px breit (Maus/Tastatur) -> nach Escape Fokus im Leisten-Feld."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m,
                             viewport={"width": 700, "height": 900})
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        page.keyboard.press("Enter")  # leer: Overlay auf, Fokus im Chat-Feld
        tv.wait_shadow(page, "#message-input")
        page.wait_for_timeout(800)
        before = active_id(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        focus = active_id(page)
        ok = collapsed(page) and focus == "anything-llm-inline-input"
        record("Fund 5 Escape (700 px Desktop): Fokus im Leisten-Feld", ok,
               f"Fokus vorher={before}, nachher={focus}, eingeklappt={collapsed(page)}")
    finally:
        ctx.close()


def check_aria(browser, base_url):
    """Fund 6: role=search + aria-label am Formular, aria-expanded/-controls am Knopf."""
    probe = """() => {
      const f = window.__q('#anything-llm-inline-bar'), b = window.__q('#anything-llm-inline-send');
      const chat = window.__q('#anything-llm-chat');
      return {
        role: f && f.getAttribute('role'), label: f && f.getAttribute('aria-label'),
        expanded: b && b.getAttribute('aria-expanded'), controls: b && b.getAttribute('aria-controls'),
        chatVisible: !!chat && chat.getBoundingClientRect().height > 0,
      };
    }"""
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, mock())
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        before = page.evaluate(probe)
        page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
        page.keyboard.press("Enter")
        tv.wait_shadow(page, "#message-input")
        page.wait_for_timeout(300)
        opened = page.evaluate(probe)
        click_collapse(page)
        page.wait_for_function("() => !!window.__q('#anything-llm-inline-input')")
        after = page.evaluate(probe)
        ok = (before == {"role": "search", "label": "Stellen Sie hier Ihre Frage …", "expanded": "false",
                         "controls": "anything-llm-chat", "chatVisible": False}
              and opened["expanded"] is None and opened["chatVisible"]
              and after["expanded"] == "false" and after["controls"] == "anything-llm-chat")
        record("Fund 6 Barrierefreiheit (role=search, aria-expanded/-controls)", ok,
               f"eingeklappt={json.dumps(before, ensure_ascii=False)}, aufgeklappt={json.dumps(opened)}, "
               f"wieder eingeklappt={json.dumps(after, ensure_ascii=False)}")
    finally:
        ctx.close()


def check_chip_with_text(browser, base_url):
    """Fund 7: Chip bei Text im Feld hängt an und sendet nicht."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": INPUT, "inline": True}, m)
    try:
        tv.wait_shadow(page, ".allm-inline-chip")
        type_in_bar(page, "Ich suche")
        box = page.evaluate(
            "() => { const r = window.__allmShadow.querySelectorAll('.allm-inline-chip')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
        page.mouse.click(*box)
        page.wait_for_timeout(600)
        value, focus = bar_value(page), active_id(page)
        ok = value == "Ich suche Yoga" and collapsed(page) and not m.stream_requests and focus == "anything-llm-inline-input"
        record("Fund 7 Chip bei Text im Feld: angehängt, nicht gesendet", ok,
               f"Feld={value!r}, eingeklappt={collapsed(page)}, Anfragen={len(m.stream_requests)}, Fokus={focus}")
    finally:
        ctx.close()


def check_server_config(browser, base_url):
    """AK-9 im Browser: kein data-inline-input, visual_config.inlineInput = true."""
    cfg = {**CFG_NO_MSGS, "inlineInput": True, "inlineInputPlaceholder": "Was suchen Sie?",
           "inlineSendText": "Fragen", "defaultMessages": "Yoga,Töpfern"}
    ctx, page = tv.open_page(browser, base_url, {"attrs": INLINE, "inline": True}, mock(config=cfg))
    try:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        st = page.evaluate(
            "() => ({ placeholder: window.__q('#anything-llm-inline-input').placeholder, button: window.__q('#anything-llm-inline-send').textContent, chips: [...window.__allmShadow.querySelectorAll('.allm-inline-chip')].map(c => c.textContent) })")
        ok = st == {"placeholder": "Was suchen Sie?", "button": "Fragen", "chips": ["Yoga", "Töpfern"]}
        record("AK-9 visual_config.inlineInput (Browser)", ok, json.dumps(st, ensure_ascii=False))
    finally:
        ctx.close()


def check_bubble_dom(browser, base_url):
    """NAK-3: Blase mit data-inline-input: kein Feld, keine Chips, Bedienung wie bisher."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**tv.BASE_ATTRS, "inline-input": "true",
                                                           "default-messages": "Yoga,Töpfern"}}, m)
    try:
        tv.wait_shadow(page, "#anything-llm-embed-chat-button")
        st = page.evaluate(
            "() => ({ input: !!window.__q('#anything-llm-inline-input'), chips: window.__allmShadow.querySelectorAll('.allm-inline-chip').length })")
        page.evaluate("() => window.__q('#anything-llm-embed-chat-button').click()")
        tv.wait_shadow(page, "#message-input")
        warns = [t for (k, t) in page.console_log if k == "warning" and "inlineInput" in t]
        ok = not st["input"] and st["chips"] == 0 and len(warns) == 1 and not m.stream_requests
        record("NAK-3 Blase unverändert (DOM, Warnung)", ok, f"{json.dumps(st)}, Warnungen={warns}")
    finally:
        ctx.close()


def check_nak4_body(body):
    """NAK-4 (automatisierbarer Teil): gleicher Endpunkt/Body wie aus dem Chatfenster."""
    keys = sorted(body.keys())
    ok = bool(body.get("sessionId")) and bool(body.get("conversationId")) and body.get("message") == QUESTION
    record("NAK-4 Anfrage wie aus dem Chatfenster (sessionId + conversationId)", ok, f"Body-Schlüssel={keys}")


def check_window_body(browser, base_url):
    """Vergleich: Body einer Frage aus dem Chatfenster (gleiche Schlüssel)."""
    m = mock()
    ctx, page = tv.open_page(browser, base_url,
                             {"attrs": {**INLINE, "inline-start-state": "expanded"}, "inline": True}, m)
    try:
        tv.wait_shadow(page, "#message-input")
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.type(QUESTION)
        page.keyboard.press("Enter")
        wait_user_and_token(page, QUESTION)
        return m.stream_requests[0] if m.stream_requests else {}
    finally:
        ctx.close()


def check_live_demo(browser):
    """AK-3 live auf demo.ki.kufer.de (eine echte Frage) + NAK-4 über den
    Verlauf: die Frage steht danach genau einmal im serverseitigen Verlauf
    (embed_chats) derselben Konversation."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="de-DE")
    ctx.add_init_script(tv.INIT_JS)
    page = ctx.new_page()
    reqs = []
    page.on("request", lambda r: reqs.append(r) if "stream-chat" in r.url else None)
    try:
        page.goto("https://demo.ki.kufer.de/", wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        tv.wait_shadow(page, "#anything-llm-inline-input", timeout=30000)
        type_in_bar(page, QUESTION)
        t0 = time.time()
        page.keyboard.press("Enter")
        page.wait_for_function(
            "() => { const r = window.__q('.allm-reply'); return !!r && r.textContent.trim().length > 0; }",
            timeout=30000)
        dt = time.time() - t0
        st = expanded_state(page)
        users = page.evaluate(
            "() => [...window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message')].map(e => e.textContent)")
        # Antwort fertig (Text 3 s unverändert)
        last, since, deadline = None, time.time(), time.time() + 120
        while time.time() < deadline:
            txt = page.evaluate("() => window.__allmShadow.textContent")
            if txt != last:
                last, since = txt, time.time()
            elif time.time() - since > 3:
                break
            page.wait_for_timeout(500)
        page.screenshot(path=str(RESULTS_DIR / "inline-input-live-demo.png"))
        ok = st.get("open") and len(reqs) == 1 and dt < 10 and any(QUESTION in u for u in users)
        record("AK-3 LIVE demo.ki.kufer.de", ok,
               f"erstes Token nach {dt:.2f} s, stream-chat-Anfragen={len(reqs)}, offen={st.get('open')}")
        body = json.loads(reqs[0].post_data or "{}") if reqs else {}
        base = reqs[0].url.rsplit("/stream-chat", 1)[0] if reqs else ""
        hist = page.request.get(
            f"{base}/{body.get('sessionId')}?conversationId={body.get('conversationId')}").json().get("history", [])
        asked = [h for h in hist if h.get("role") == "user" and h.get("content") == QUESTION]
        answered = [h for h in hist if h.get("role") == "assistant" and h.get("content")]
        record("NAK-4 LIVE Verlauf/Konversation (embed_chats)",
               len(asked) == 1 and len(answered) >= 1 and bool(body.get("conversationId")),
               f"conversationId={body.get('conversationId')}, Verlauf: {len(hist)} Einträge, Frage {len(asked)}x, "
               f"Antworten {len(answered)}")
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="fehlende Referenz-Screenshots erzeugen")
    ap.add_argument("--new-states", action="store_true", help="mit --baseline: Referenzen der neuen Zustände")
    ap.add_argument("--dist", default=str(ROOT / "dist"), help="Verzeichnis mit dem gebauten Widget")
    ap.add_argument("--only", nargs="*", help="nur diese Pixel-Zustände")
    ap.add_argument("--live-demo", action="store_true",
                    help="zusätzlich AK-3 live auf demo.ki.kufer.de (nur mit EMBED_LIVE_TESTS=1)")
    args = ap.parse_args()
    if args.live_demo and os.environ.get("EMBED_LIVE_TESTS") != "1":
        print("Abbruch: --live-demo stellt eine ECHTE Frage auf dem Demo-Container (demo.ki.kufer.de) — "
              "es entsteht ein echter Chat (Kontingent, Verlauf). Nur mit ausdrücklicher Freigabe starten: "
              "EMBED_LIVE_TESTS=1 python3 tests/visual/inline_input.py --live-demo", file=sys.stderr)
        return 2

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            run_pixel(browser, base_url, args.baseline, args.new_states, args.only)
            if not args.baseline:
                check_ak2(browser, base_url)
                body = check_send(browser, base_url, "enter")
                check_send(browser, base_url, "button", key="AK-4")
                check_send(browser, base_url, "button-mouse", key="AK-4")
                check_empty(browser, base_url)
                check_chips(browser, base_url)
                check_chips_small(browser, base_url)
                check_send(browser, base_url, "enter", viewport=tv.MOBILE, key="AK-8")
                check_send(browser, base_url, "chip2", viewport=tv.MOBILE, key="AK-8")
                check_server_config(browser, base_url)
                check_theme_vars(browser, base_url)
                check_keyboard(browser, base_url)
                check_double_enter(browser, base_url)
                check_draft(browser, base_url)
                check_replace_after_close(browser, base_url)
                check_close_discards(browser, base_url)
                check_touch_no_keyboard(browser, base_url)
                check_draft_append(browser, base_url)
                check_escape_focus_narrow(browser, base_url)
                check_aria(browser, base_url)
                check_chip_with_text(browser, base_url)
                check_bubble_dom(browser, base_url)
                check_nak4_body(body)
                wbody = check_window_body(browser, base_url)
                record("NAK-4 gleiche Body-Schlüssel wie Chatfenster", sorted(wbody) == sorted(body),
                       f"Fenster={sorted(wbody)}, Leiste={sorted(body)}")
                if args.live_demo:
                    check_live_demo(browser)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    failed = [r for r in tv.RESULTS if not r[1]]
    print(f"\n{len(tv.RESULTS) - len(failed)}/{len(tv.RESULTS)} Prüfungen bestanden.")
    (RESULTS_DIR / "summary-inline-input.json").write_text(
        json.dumps([{"check": k, "ok": ok, "detail": d} for k, ok, d in tv.RESULTS], ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
