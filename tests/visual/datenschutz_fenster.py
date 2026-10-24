#!/usr/bin/env python3
"""Browser-Prüfung Link „Datenschutz“ und Datenschutz-Fenster (7.23,
Spezifikation issues/datenschutz-fusszeile.md: AK-1 bis AK-5, AK-7,
NAK-2, NAK-4).

Gebautes dist, lokale Testseite (tests/visual/fixtures/widget.html), Server
gemockt (theme_visual.Mock). Je Ansicht (Chatfenster 1280 und 1440, In der
Seite aufgeklappt 1024, 1440, 1920, mobil 390 als Chatfenster und als
Vollbild In der Seite), hell und dunkel, deutsch und englisch:

  - Fenster öffnen per Mausklick auf „Datenschutz“; es deckt den ganzen Chat
    ab (Rechteck = Chatfenster), role dialog, aria-modal, aria-labelledby
    auf die Überschrift, Fokus auf der Überschrift, kein waagerechter
    Bildlauf, Kontrast Text/Fläche, Schließen-Button und -Symbol ≥ 44 px
  - Tab-Reihenfolge Text, Link, Schließen, Symbol, wieder Text
  - Escape schließt nur das Fenster (Chat bleibt offen), Fokus zurück auf
    den Link, angefangene Eingabe bleibt
  - Enter auf dem Link öffnet; „Schließen“ und Symbol schließen
  - Fokusrahmen jedes bedienbaren Elements im Fenster mindestens 3:1 zur
    Fensterfläche (rc2, W2)
Einmalig (deutsch, hell): langer Text scrollt im Fenster (die Seite nicht),
Fokus bleibt bei Tab und programmatischem Fokus im Fenster, kein Senden,
Klicks gehen nicht auf die Seite darunter, Einklappen In der Seite schließt
das Fenster, Seiten-CSS mit Fallen (NAK-2) macht Link und Fenster nicht
unsichtbar.
Korrekturen nach rc1 (issues/datenschutz-fusszeile/fixliste-rc1.md):
  - W2, W3 (R1-D1): Seiten-CSS mit Fallen in oklch() und color-mix()
    ändert Fläche, Schrift, Schriftgröße und Trennlinien des Fensters nicht
    (genau die festen Werte des Farbschemas); helle Linkfarben #FFA102 und
    #63b4e3: Link im Fenster mindestens 4,5:1, Fokusrahmen mindestens 3:1,
    hell und dunkel
  - W4: Fokus auf „Schließen“ im Fenster, die Antwort endet (Eingabefeld
    holt den Fokus): der Fokus bleibt auf „Schließen“, nichts wird gesendet
  - W5: langer Text (12 Punkte), Tab und Umschalt+Tab auf den Link
    „Datenschutzerklärung“: Link samt Fokusrahmen im sichtbaren Textbereich,
    die Seite bewegt sich nicht
  - W6 (R1-D2): In der Seite 1440 und 1920 Textspalte höchstens 70ch
    (linksbündig, wie die Vorschau im Design Center; gemessen rund 80 bis
    90 Zeichen je Zeile statt bis 150), Kopfzeile, Button-Zeile und
    Textbereich über die ganze Breite; Chatfenster und mobil ohne Grenze
  - W7 (R1-D3): Begrüßung als Text (data-greeting-style="text") in der
    normalen Schriftfarbe, mindestens 4,5:1 zur Fläche, hell und dunkel

Aufruf (aus dem Repo, npm run build vorher):

  python3 tests/visual/datenschutz_fenster.py [--dist dist] [--tag runde1] [--rc2-only [--only w2 w4 ...]]

Ergebnis: .test-storage/datenschutz-fenster-<tag>.json, Bilder
.test-storage/start-*.png (beim Start), fenster-*.png (Fenster offen) und
rc2-<tag>-*.png (Prüfungen der Korrekturen nach rc1),
Zeilen auf stdout, Ausstieg 1 bei Fehlern.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT_DIR = ROOT / ".test-storage"
RESULTS = []
# Kennung der Bilder der rc2-Prüfungen (--tag), damit Läufe gegen einen
# alten Stand die Bilder des neuen nicht überschreiben
SHOT_TAG = "neu"

VIEWS = [
    # (Name, Darstellung, Breite, Höhe)
    ("fenster-1280", "bubble", 1280, 800),
    ("fenster-1440", "bubble", 1440, 900),
    ("seite-1024", "inline", 1024, 800),
    ("seite-1440", "inline", 1440, 900),
    ("seite-1920", "inline", 1920, 1080),
    ("mobil-fenster-390", "bubble", 390, 800),
    ("mobil-seite-390", "inline", 390, 800),
]
CONFIG = {
    "privacyUrl": "https://vhs.example/datenschutz",
    "defaultMessages": ["Gibt es Yoga?", "Kurse am Abend?"],
}
# höchstens 12 Zeilen und 1000 Zeichen (sonst verwirft das Widget den Text)
LONG_TEXT = "\n".join(
    f"• Punkt {i + 1}: Ihre Anfragen werden sorgfältig und nur für die Antwort genutzt."
    for i in range(12)
)
assert len(LONG_TEXT) <= 1000
# Seiten-CSS mit Fallen (NAK-2): Variablen der Gruppe A und B, interne
# Variablen mit !important, Schrift 0 am Host
TRAP_CSS = """
#anythingllm-embed-widget {
  --allm-link: transparent;
  --allmi-link: transparent !important;
  --allm-assistant-text: transparent;
  --allm-assistant-bg: transparent;
  --allmi-assistant-text: rgba(0, 0, 0, 0) !important;
  --allm-font-size: 0px;
  --allm-text-muted: transparent;
  --allm-surface: #6b7280;
  --allmi-ai-notice-text: transparent !important;
  --allmi-ai-notice-bg: #6b7280 !important;
  font-size: 0;
}
"""


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(f"[{'OK ' if ok else 'FAIL'}] {key}: {detail}", flush=True)


STATE_JS = r"""
() => {
  const q = window.__q;
  const root = window.__allmShadow;
  const d = q('[role=dialog]');
  const win = q('#anything-llm-chat');
  const active = root.activeElement;
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const out = {
    open: !!d,
    active: active ? (active.id || active.getAttribute('aria-label') || active.textContent.trim().slice(0, 30) || active.tagName) : null,
    activeTag: active ? active.tagName : null,
    input: q('#message-input') ? q('#message-input').value : null,
    windowRect: r(win),
    windowVisible: !!win && win.getBoundingClientRect().height > 0 && getComputedStyle(win).display !== 'none',
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    link: (() => { const l = q('#anything-llm-privacy-link'); if (!l) return null;
      const cs = getComputedStyle(l); return { rect: r(l), color: cs.color, bg: cs.backgroundColor,
        decoration: cs.textDecorationLine, visibility: cs.visibility, opacity: cs.opacity, fontSize: cs.fontSize }; })(),
    notice: (() => { const t = q('#anything-llm-ai-disclaimer-text'); if (!t) return null;
      const cs = getComputedStyle(t); return { color: getComputedStyle(t.parentElement).color, bg: cs.backgroundColor, text: t.textContent }; })(),
  };
  if (d) {
    const cs = getComputedStyle(d);
    const title = root.getElementById(d.getAttribute('aria-labelledby'));
    const body = q('#anything-llm-privacy-dialog-body');
    const buttons = [...d.querySelectorAll('button')];
    const close = buttons.find((b) => !b.getAttribute('aria-label'));
    const icon = buttons.find((b) => b.getAttribute('aria-label'));
    const a = d.querySelector('a');
    out.dialog = {
      rect: r(d), role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'),
      title: title ? title.textContent : null, titleTag: title ? title.tagName : null,
      color: cs.color, bg: cs.backgroundColor, radius: getComputedStyle(win).borderRadius,
      bodyFont: body ? getComputedStyle(body).fontSize : null,
      bodyScroll: body ? { sh: body.scrollHeight, ch: body.clientHeight, top: body.scrollTop } : null,
      text: d.textContent,
      close: close ? { text: close.textContent, rect: r(close), color: getComputedStyle(close).color, bg: getComputedStyle(close).backgroundColor } : null,
      icon: icon ? { label: icon.getAttribute('aria-label'), rect: r(icon) } : null,
      link: a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), text: a.textContent,
        color: getComputedStyle(a).color, rect: r(a) } : null,
      lines: [...d.querySelectorAll('.allm-privacy-dialog-line')].map((e, i) => {
        const c = getComputedStyle(e);
        return i === 0 ? c.borderBottomColor : c.borderTopColor; }),
      bodyRect: body ? r(body) : null,
      ring: active && d.contains(active) ? (() => { const c = getComputedStyle(active);
        return { color: c.outlineColor, style: c.outlineStyle, width: c.outlineWidth }; })() : null,
    };
  }
  return out;
}
"""


def contrast_of(fg, bg):
    f, b = tv.parse_rgb(fg), tv.parse_rgb(bg)
    if b[3] < 1:
        return 0.0
    return round(tv.contrast(tv.over(f, b), b), 2)


def state(page):
    return page.evaluate(STATE_JS)


def click_link(page):
    r = state(page)["link"]["rect"]
    page.mouse.click(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2)
    page.wait_for_timeout(250)


def open_view(browser, base_url, display, width, height, theme, lang, config=None, css=None, mock=None):
    attrs = {**tv.BASE_ATTRS, "theme": theme, "language": lang}
    cfg = {"attrs": attrs}
    if css:
        cfg["css"] = css
    if display == "bubble":
        attrs["open-on-load"] = "on"
    else:
        attrs["display-mode"] = "inline"
        attrs["inline-start-state"] = "expanded"
        cfg["inline"] = True
    mock = mock or tv.Mock(config={**CONFIG, **(config or {})})
    ctx, page = tv.open_page(browser, base_url, cfg, mock=mock, viewport={"width": width, "height": height})
    page.stream_requests = []
    page.on("request", lambda req: page.stream_requests.append(req.url) if "stream-chat" in req.url else None)
    if display == "inline" and width < 768:
        tv.wait_shadow(page, "#anything-llm-inline-input")
        page.wait_for_timeout(300)
        x, y = page.evaluate(
            "() => { const r = window.__q('#anything-llm-inline-input').getBoundingClientRect();"
            " return [r.x + 20, r.y + r.height / 2]; }"
        )
        page.mouse.click(x, y)
    tv.wait_shadow(page, "#anything-llm-privacy-link")
    tv.settle(page, 600)
    return ctx, page


def type_draft(page, text):
    r = page.evaluate("() => { const b = window.__q('#message-input').getBoundingClientRect(); return [b.x + 30, b.y + b.height / 2]; }")
    page.mouse.click(*r)
    page.keyboard.type(text)


def check_view(browser, base_url, name, display, width, height, theme, lang):
    tag = f"{lang} {name} {theme}"
    ctx, page = open_view(browser, base_url, display, width, height, theme, lang)
    try:
        expect_line = "Unsere KI kann Fehler machen" if lang == "de" else "Our AI can make mistakes"
        st = state(page)
        page.screenshot(path=str(OUT_DIR / f"start-{lang}-{name}-{theme}.png"))
        record(f"AK-1 Zeile ohne Fenster beim Start ({tag})",
               not st["open"] and st["notice"]["text"] == expect_line and st["link"] is not None,
               {"notice": st["notice"]["text"], "open": st["open"]})
        type_draft(page, "Meine halbe Frage")
        click_link(page)
        st = state(page)
        d = st.get("dialog") or {}
        page.screenshot(path=str(OUT_DIR / f"fenster-{lang}-{name}-{theme}.png"))
        wr, dr = st["windowRect"], d.get("rect")
        covers = bool(wr and dr) and all(abs(wr[k] - dr[k]) <= 2.5 for k in ("x", "y", "w", "h"))
        record(f"AK-3 Fenster deckt den ganzen Chat ({tag})", st["open"] and covers, {"window": wr, "dialog": dr})
        title = ("Datenschutz" if lang == "de" else "Privacy")
        ai_title = "Hinweis zur KI" if lang == "de" else "About the AI"
        close_text = "Schließen" if lang == "de" else "Close"
        record(f"AK-3 Inhalt: Überschrift, KI-Punkt, Link, Schließen ({tag})",
               d.get("title") == title and ai_title in (d.get("text") or "")
               and (d.get("link") or {}).get("href") == CONFIG["privacyUrl"]
               and (d.get("link") or {}).get("target") == "_blank"
               and (d.get("link") or {}).get("rel") == "noopener noreferrer"
               and (d.get("close") or {}).get("text") == close_text,
               {"title": d.get("title"), "link": d.get("link"), "close": (d.get("close") or {}).get("text")})
        ratio = contrast_of(d.get("color", "rgb(0,0,0)"), d.get("bg", "rgb(0,0,0)"))
        link_ratio = contrast_of((d.get("link") or {}).get("color", "rgb(0,0,0)"), d.get("bg", "rgb(0,0,0)"))
        close_ratio = contrast_of((d.get("close") or {}).get("color", "rgb(0,0,0)"), (d.get("close") or {}).get("bg", "rgb(0,0,0)"))
        record(f"AK-5 role dialog, aria-modal, Fokus auf Überschrift; Kontrast ({tag})",
               d.get("role") == "dialog" and d.get("modal") == "true" and d.get("titleTag") == "H2"
               and st["activeTag"] == "H2" and ratio >= 4.5 and link_ratio >= 4.5 and close_ratio >= 4.5,
               {"active": st["active"], "text": ratio, "link": link_ratio, "close": close_ratio, "font": d.get("bodyFont")})
        icon = (d.get("icon") or {}).get("rect") or {}
        close_r = (d.get("close") or {}).get("rect") or {}
        record(f"Trefferflächen Schließen und Symbol ≥ 44 px, kein waagerechter Bildlauf ({tag})",
               icon.get("w", 0) >= 44 and icon.get("h", 0) >= 44 and close_r.get("h", 0) >= 44 and not st["hScroll"],
               {"icon": icon, "close": close_r, "hScroll": st["hScroll"]})
        order = []
        rings = []
        for _ in range(5):
            page.keyboard.press("Tab")
            st_tab = state(page)
            order.append(st_tab["active"])
            ring = (st_tab.get("dialog") or {}).get("ring") or {}
            rings.append({"aktiv": st_tab["active"], "stil": ring.get("style"), "breite": ring.get("width"),
                          "kontrast": contrast_of(ring.get("color", "rgba(0,0,0,0)"), d.get("bg", "rgb(0,0,0)"))})
        record(f"W2 Fokusrahmen im Fenster ≥ 3:1 zur Fläche ({tag})",
               all(x["stil"] == "solid" and x["breite"] == "2px" and x["kontrast"] >= 3 for x in rings), rings)
        want = ["anything-llm-privacy-dialog-body", "Datenschutzerklärung" if lang == "de" else "Privacy statement",
                close_text, "Datenschutz schließen" if lang == "de" else "Close privacy notice",
                "anything-llm-privacy-dialog-body"]
        record(f"AK-5 Tab-Reihenfolge Text, Link, Schließen, Symbol, Text ({tag})", order == want, order)
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        st = state(page)
        record(f"AK-4 Escape: nur das Fenster zu, Fokus auf dem Link, Eingabe bleibt ({tag})",
               not st["open"] and st["active"] == "anything-llm-privacy-link" and st["windowVisible"]
               and st["input"] == "Meine halbe Frage",
               {"open": st["open"], "active": st["active"], "window": st["windowVisible"], "input": st["input"]})
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        opened = state(page)["open"]
        page.evaluate("() => [...window.__q('[role=dialog]').querySelectorAll('button')].find((b) => !b.getAttribute('aria-label')).focus()")
        page.keyboard.press("Enter")
        page.wait_for_timeout(250)
        st = state(page)
        by_button = not st["open"] and st["active"] == "anything-llm-privacy-link"
        page.keyboard.press("Space")
        page.wait_for_timeout(250)
        opened2 = state(page)["open"]
        r = state(page)["dialog"]["icon"]["rect"]
        page.mouse.click(r["x"] + r["w"] / 2, r["y"] + r["h"] / 2)
        page.wait_for_timeout(250)
        st = state(page)
        by_icon = not st["open"] and st["active"] == "anything-llm-privacy-link" and st["input"] == "Meine halbe Frage"
        record(f"AK-3/AK-4 Enter und Leertaste öffnen, Schließen und Symbol schließen ({tag})",
               opened and by_button and opened2 and by_icon,
               {"enter": opened, "button": by_button, "space": opened2, "icon": by_icon})
        record(f"keine Fehler in der Konsole ({tag})", not tv.errors_of(page), tv.errors_of(page))
    finally:
        ctx.close()


def check_once(browser, base_url):
    # langer Text scrollt im Fenster, nicht die Seite
    ctx, page = open_view(browser, base_url, "bubble", 1280, 800, "light", "de", config={"privacyText": LONG_TEXT})
    try:
        click_link(page)
        st = state(page)
        sc = st["dialog"]["bodyScroll"]
        r = page.evaluate("() => { const b = window.__q('#anything-llm-privacy-dialog-body').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }")
        page.mouse.move(*r)
        page.mouse.wheel(0, 400)
        page.wait_for_timeout(300)
        after = state(page)["dialog"]["bodyScroll"]
        page_y = page.evaluate("() => window.scrollY")
        page.screenshot(path=str(OUT_DIR / "fenster-de-lang-light.png"))
        record("AK-4 langer Text scrollt im Fenster, die Seite nicht",
               sc["sh"] > sc["ch"] and after["top"] > 0 and page_y == 0, {"vorher": sc, "nachher": after, "seite": page_y})
        # NAK-4: Fokus bleibt im Fenster, kein Senden, Klick geht nicht durch
        inside = []
        for _ in range(12):
            page.keyboard.press("Tab")
            inside.append(page.evaluate("() => !!window.__q('[role=dialog]').contains(window.__allmShadow.activeElement)"))
        page.evaluate("() => window.__q('#message-input').focus()")
        page.wait_for_timeout(100)
        forced = page.evaluate("() => !!window.__q('[role=dialog]').contains(window.__allmShadow.activeElement)")
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        hit = page.evaluate("""() => { const d = window.__q('[role=dialog]').getBoundingClientRect();
          const t = document.elementFromPoint(d.x + d.width / 2, d.y + d.height / 2);
          return t ? t.id : null; }""")
        record("NAK-4 Fokus bleibt im Fenster (Tab, Fokus von außen), kein Senden, Klicks nicht auf die Seite",
               all(inside) and forced and not page.stream_requests and hit == "anythingllm-embed-widget",
               {"tab": inside.count(True), "fokus": forced, "senden": page.stream_requests, "ziel": hit})
    finally:
        ctx.close()
    # In der Seite: Einklappen (Klick neben die Box) schließt das Fenster
    ctx, page = open_view(browser, base_url, "inline", 1440, 900, "light", "de")
    try:
        click_link(page)
        opened = state(page)["open"]
        page.mouse.click(5, 5)
        page.wait_for_timeout(1200)
        collapsed = page.evaluate("() => !window.__q('#anything-llm-chat') || window.__q('#anything-llm-chat').getBoundingClientRect().height === 0")
        x, y = page.evaluate("() => { const b = (window.__q('#anything-llm-inline-input') || window.__q('#anything-llm-inline-bar')).getBoundingClientRect(); return [b.x + 30, b.y + b.height / 2]; }")
        page.mouse.click(x, y)
        page.wait_for_timeout(1200)
        st = state(page)
        record("In der Seite: Einklappen schließt ein offenes Fenster",
               opened and collapsed and st["windowVisible"] and not st["open"],
               {"offen": opened, "eingeklappt": collapsed, "wieder": st["windowVisible"], "fenster": st["open"]})
        # Escape In der Seite: nur das Fenster, die Box bleibt
        click_link(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        st = state(page)
        record("In der Seite: Escape schließt nur das Fenster, die Box bleibt aufgeklappt",
               not st["open"] and st["windowVisible"] and st["active"] == "anything-llm-privacy-link",
               {"fenster": st["open"], "box": st["windowVisible"], "aktiv": st["active"]})
    finally:
        ctx.close()
    # NAK-2: Seiten-CSS mit Fallen
    for display in ("bubble", "inline"):
        for theme in ("light", "dark"):
            ctx, page = open_view(browser, base_url, display, 1440, 900, theme, "de", css=TRAP_CSS)
            try:
                st = state(page)
                lk = st["link"]
                link_ratio = contrast_of(lk["color"], lk["bg"])
                notice_ratio = contrast_of(st["notice"]["color"], st["notice"]["bg"])
                click_link(page)
                st2 = state(page)
                d = st2.get("dialog") or {}
                ratio = contrast_of(d.get("color", "rgba(0,0,0,0)"), d.get("bg", "rgba(0,0,0,0)"))
                font = float((d.get("bodyFont") or "0px").replace("px", ""))
                page.screenshot(path=str(OUT_DIR / f"fenster-fallen-{display}-{theme}.png"))
                record(f"NAK-2 Seiten-CSS mit Fallen: Link, KI-Hinweis und Fenster lesbar ({display}, {theme})",
                       lk["rect"]["w"] > 20 and lk["rect"]["h"] >= 24 and link_ratio >= 4.5 and notice_ratio >= 4.5
                       and "underline" in lk["decoration"] and st2["open"] and ratio >= 4.5 and font >= 12,
                       {"link": link_ratio, "hinweis": notice_ratio, "fenster": ratio, "schrift": font,
                        "linkRect": lk["rect"]})
            finally:
                ctx.close()


# Fallen in modernen Farbformaten (W2, R1-D1): Variablen der Antwortblasen,
# Text, Rahmen, Kopf, Fokusring, Hover und Schriftgröße der Seite
TRAP_CSS_MODERN = """
#anythingllm-embed-widget {
  --allm-assistant-bg: oklch(0.98 0 0);
  --allm-assistant-text: oklch(0.97 0 0);
  --allm-text: color-mix(in srgb, white 95%, black);
  --allm-border: oklch(1 0 0 / 0);
  --allm-header-bg: color-mix(in oklch, red 50%, blue);
  --allm-focus-ring: none;
  --allm-hover-bg: oklch(0.5 0.2 30);
  --allm-font-size: 0px;
  --allm-link: oklch(1 0 0);
}
"""
FIXED = {
    # Fläche, Schrift, Trennlinien je Farbschema (utils/theme.js PRIVACY_DIALOG_COLORS)
    "light": ("rgb(34, 38, 40)", "rgb(255, 255, 255)", "rgb(233, 233, 233)"),
    "dark": ("rgb(244, 242, 239)", "rgb(42, 42, 47)", "rgb(120, 123, 130)"),
}


def tab_rings(page, n=4):
    out = []
    for _ in range(n):
        page.keyboard.press("Tab")
        st = state(page)
        d = st.get("dialog") or {}
        ring = d.get("ring") or {}
        out.append({"aktiv": st["active"], "stil": ring.get("style"),
                    "kontrast": contrast_of(ring.get("color", "rgba(0,0,0,0)"), d.get("bg", "rgb(0,0,0)"))})
    return out


def check_rc2(browser, base_url):
    # W2, W3: Fallen in oklch() und color-mix() ändern nichts am Fenster
    for display in ("bubble", "inline"):
        for theme in ("light", "dark"):
            ctx, page = open_view(browser, base_url, display, 1440, 900, theme, "de", css=TRAP_CSS_MODERN)
            try:
                click_link(page)
                d = state(page).get("dialog") or {}
                text, bg, line = FIXED[theme]
                link_ratio = contrast_of((d.get("link") or {}).get("color", "rgb(0,0,0)"), d.get("bg", "rgb(0,0,0)"))
                rings = tab_rings(page)
                page.screenshot(path=str(OUT_DIR / f"rc2-{SHOT_TAG}-fenster-fallen-modern-{display}-{theme}.png"))
                record(f"W2/W3 Fallen in oklch() und color-mix(): Fenster fest ({display}, {theme})",
                       d.get("color") == text and d.get("bg") == bg and d.get("lines") == [line, line]
                       and d.get("bodyFont") == "14px" and link_ratio >= 4.5
                       and all(x["stil"] == "solid" and x["kontrast"] >= 3 for x in rings),
                       {"schrift": d.get("color"), "flaeche": d.get("bg"), "linien": d.get("lines"),
                        "groesse": d.get("bodyFont"), "link": link_ratio, "fokus": rings})
            finally:
                ctx.close()
    # W2: helle Linkfarben aus dem Design Center
    for link_color in ("#FFA102", "#63b4e3"):
        for theme in ("light", "dark"):
            ctx, page = open_view(browser, base_url, "bubble", 1280, 800, theme, "de", config={"linkColor": link_color})
            try:
                st = state(page)
                foot = contrast_of(st["link"]["color"], st["link"]["bg"])
                click_link(page)
                d = state(page).get("dialog") or {}
                link_ratio = contrast_of((d.get("link") or {}).get("color", "rgb(0,0,0)"), d.get("bg", "rgb(0,0,0)"))
                rings = tab_rings(page)
                record(f"W2 Linkfarbe {link_color}: Link im Fenster ≥ 4,5:1, Fokusrahmen ≥ 3:1 ({theme})",
                       link_ratio >= 4.5 and foot >= 4.5 and all(x["stil"] == "solid" and x["kontrast"] >= 3 for x in rings),
                       {"fusszeile": foot, "fensterlink": link_ratio, "farbe": (d.get("link") or {}).get("color"), "fokus": rings})
            finally:
                ctx.close()


def check_w4(browser, base_url):
    # W4: Antwort endet, während der Fokus auf „Schließen“ im Fenster liegt
    for display, width, height in (("bubble", 1280, 800), ("inline", 1440, 900)):
        mock = tv.Mock(config=dict(CONFIG), stream="hang")
        ctx, page = open_view(browser, base_url, display, width, height, "light", "de", mock=mock)
        try:
            type_draft(page, "Gibt es Yoga?")
            page.keyboard.press("Enter")
            page.wait_for_timeout(500)
            sent = len(page.stream_requests)
            click_link(page)
            for _ in range(3):
                page.keyboard.press("Tab")
            before = state(page)["active"]
            body = "".join(f"data: {json.dumps(ev)}\n\n" for ev in [
                {"uuid": "u-1", "type": "textResponseChunk", "close": False, "sources": [], "textResponse": "Ja, montags."},
                {"uuid": "u-1", "type": "textResponseChunk", "close": True, "sources": [], "textResponse": ""}])
            while mock.pending:
                mock.pending.pop().fulfill(status=200, body=body, headers={"Content-Type": "text/event-stream"})
            page.wait_for_timeout(1200)
            st = state(page)
            record(f"W4 Antwort endet: Fokus bleibt auf „Schließen“ im Fenster ({display})",
                   sent == 1 and before == "Schließen" and st["open"] and st["active"] == "Schließen"
                   and len(page.stream_requests) == 1,
                   {"gesendet": sent, "vorher": before, "nachher": st["active"], "offen": st["open"],
                    "anfragen": len(page.stream_requests)})
        finally:
            mock.release()
            ctx.close()


LINK_VIEW_JS = r"""
() => {
  const a = window.__q('[role=dialog] a');
  const b = window.__q('#anything-llm-privacy-dialog-body');
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  return { link: [Math.round(ra.top), Math.round(ra.bottom)], body: [Math.round(rb.top), Math.round(rb.bottom)],
    scrollTop: Math.round(b.scrollTop), pageY: window.scrollY,
    // Link samt Fokusrahmen (2 px mit 2 px Abstand) im sichtbaren Textbereich
    ring: ra.top - 4 >= rb.top - 0.5 && ra.bottom + 4 <= rb.bottom + 0.5,
    viewport: ra.top >= 0 && ra.bottom <= innerHeight };
}
"""


def check_w5(browser, base_url):
    # W5: Tab und Umschalt+Tab im langen Text machen den Link sichtbar, die
    # Seite bewegt sich nicht (Fenster passt in den Bildschirm)
    for display, width, height in (("bubble", 1280, 800), ("inline", 1440, 900), ("inline", 1920, 1080),
                                   ("bubble", 390, 800)):
        for theme in ("light", "dark"):
            ctx, page = open_view(browser, base_url, display, width, height, theme, "de",
                                  config={"privacyText": LONG_TEXT})
            try:
                y0 = page.evaluate("() => window.scrollY")
                click_link(page)
                page.keyboard.press("Tab")
                page.keyboard.press("Tab")
                act1 = state(page)["active"]
                v1 = page.evaluate(LINK_VIEW_JS)
                page.screenshot(path=str(OUT_DIR / f"rc2-{SHOT_TAG}-w5-tab-{display}-{width}-{theme}.png"))
                # zurück an den Anfang des Textes, dann Umschalt+Tab von „Schließen“
                page.evaluate("() => { window.__q('#anything-llm-privacy-dialog-body').scrollTop = 0; }")
                page.keyboard.press("Tab")
                page.keyboard.press("Shift+Tab")
                act2 = state(page)["active"]
                v2 = page.evaluate(LINK_VIEW_JS)
                ok = (act1 == act2 == "Datenschutzerklärung" and v1["ring"] and v2["ring"] and v1["viewport"]
                      and v1["scrollTop"] > 0 and v1["pageY"] == y0 and v2["pageY"] == y0)
                record(f"W5 Tab und Umschalt+Tab im langen Text: Link sichtbar, Seite bleibt ({display} {width}, {theme})",
                       ok, {"tab": v1, "umschalt_tab": v2, "seite_vorher": y0, "aktiv": [act1, act2]})
            finally:
                ctx.close()


TEXT_WIDTH_JS = r"""
() => {
  const d = window.__q('[role=dialog]');
  const body = window.__q('#anything-llm-privacy-dialog-body');
  const col = d.querySelector('.allm-privacy-dialog-text');
  const lines = [...d.querySelectorAll('.allm-privacy-dialog-line')];
  const w = (e) => e ? Math.round(e.getBoundingClientRect().width) : null;
  // Zeichen je Zeile im KI-Punkt (längster Absatz), Zeichen für Zeichen gemessen
  const p = [...(col || d).querySelectorAll('p')].sort((a, b) => b.textContent.length - a.textContent.length)[0];
  const node = p.firstChild;
  const range = document.createRange();
  const tops = new Map();
  for (let i = 0; i < node.textContent.length; i++) {
    range.setStart(node, i); range.setEnd(node, i + 1);
    const r = range.getClientRects()[0];
    if (!r) continue;
    const t = Math.round(r.top);
    tops.set(t, (tops.get(t) || 0) + 1);
  }
  // 70ch in der Schrift des Fensters (Breite der Ziffer 0)
  const probe = document.createElement('span');
  probe.textContent = '0'.repeat(70);
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
  (col || d).appendChild(probe);
  const ch70 = probe.getBoundingClientRect().width;
  probe.remove();
  const cs = body ? getComputedStyle(body) : null;
  const inner = body ? body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : null;
  const cr = col ? col.getBoundingClientRect() : null, br = body ? body.getBoundingClientRect() : null;
  return { dialog: w(d), body: w(body), bodyInner: inner ? Math.round(inner) : null, column: w(col),
    maxWidth: col ? getComputedStyle(col).maxWidth : null, ch70: `${Math.round(ch70 * 1000) / 1000}px`,
    left: cr && br ? Math.round(cr.left - br.left) : null,
    lines: lines.map(w), maxChars: Math.max(...tops.values()), rows: tops.size };
}
"""


def check_w6(browser, base_url):
    # W6 (R1-D2): In der Seite höchstens etwa 70 Zeichen je Zeile, linksbündig;
    # Kopfzeile, Button-Zeile und Textbereich über die ganze Breite; im
    # Chatfenster und mobil keine Grenze
    # breit: Platzhalter über die ganze Seite (wie auf vielen Kundenseiten,
    # Browser-Erstabnahme rc1: 1060 px Fenster, rund 150 Zeichen je Zeile);
    # sonst die Testseite mit 760 px Inhaltsbreite
    wide = "main { max-width: none !important; }"
    views = (("inline", 1440, 900, True, wide), ("inline", 1920, 1080, True, wide),
             ("inline", 1440, 900, True, None), ("bubble", 1280, 800, False, None),
             ("bubble", 1440, 900, False, None), ("inline", 390, 800, False, None), ("bubble", 390, 800, False, None))
    for display, width, height, limited, css in views:
        for theme in ("light", "dark"):
            for lang in ("de", "en"):
                ctx, page = open_view(browser, base_url, display, width, height, theme, lang, css=css)
                name = f"{lang}-{display}-{width}{'-breit' if css else ''}-{theme}"
                try:
                    click_link(page)
                    m = page.evaluate(TEXT_WIDTH_JS)
                    page.screenshot(path=str(OUT_DIR / f"rc2-{SHOT_TAG}-w6-{name}.png"))
                    full = all(abs(x - m["dialog"]) <= 1 for x in m["lines"]) and abs(m["body"] - m["dialog"]) <= 1
                    if m["column"] is None:
                        ok = False  # keine eigene Textspalte (Stand vor W6)
                    elif limited:
                        # 70ch = 70 Breiten der Ziffer 0; Buchstaben sind im
                        # Mittel schmaler, gemessen werden daher rund 80 bis
                        # 90 Zeichen je Zeile (vorher bis 150)
                        px = lambda v: float(v.replace("px", "")) if v.endswith("px") else -1.0  # noqa: E731
                        ok = (abs(px(m["maxWidth"]) - px(m["ch70"])) <= 0.5 and m["column"] < m["bodyInner"] and m["left"] <= 21
                              and m["maxChars"] <= 92 and full)
                    else:
                        ok = m["maxWidth"] == "none" and abs(m["column"] - m["bodyInner"]) <= 1 and full
                    record(f"W6 Textspalte {'höchstens 70ch' if limited else 'ohne Grenze'} "
                           f"({lang} {display} {width}{' breit' if css else ''}, {theme})", ok, m)
                finally:
                    ctx.close()


GREETING_JS = r"""
() => {
  const p = window.__q('#anything-llm-greeting-text')
    || [...window.__allmShadow.querySelectorAll('p')].find((e) => /^(Hallo|Hello)/.test(e.textContent.trim()));
  if (!p) return null;
  // Fläche: erster Vorfahr mit deckender Hintergrundfarbe
  let e = p, bg = 'rgba(0, 0, 0, 0)';
  while (e && e.nodeType === 1) {
    const c = getComputedStyle(e).backgroundColor;
    if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; }
    e = e.parentElement || (e.getRootNode() && e.getRootNode().host);
  }
  return { text: p.textContent.trim().slice(0, 40), color: getComputedStyle(p).color, bg,
    size: getComputedStyle(p).fontSize };
}
"""


def check_w7(browser, base_url):
    # W7 (R1-D3): Begrüßung als Text (data-greeting-style="text") in der
    # normalen Schriftfarbe, mindestens 4,5:1 hell und dunkel
    for display, width, height in (("bubble", 1280, 800), ("bubble", 1440, 900), ("inline", 1440, 900),
                                   ("inline", 1920, 1080), ("bubble", 390, 800)):
        for theme in ("light", "dark"):
            for lang in ("de", "en"):
                attrs_ctx = tv.BASE_ATTRS
                tv.BASE_ATTRS = {**attrs_ctx, "greeting-style": "text"}
                try:
                    ctx, page = open_view(browser, base_url, display, width, height, theme, lang)
                finally:
                    tv.BASE_ATTRS = attrs_ctx
                try:
                    g = page.evaluate(GREETING_JS)
                    page.screenshot(path=str(OUT_DIR / f"rc2-{SHOT_TAG}-w7-{lang}-{display}-{width}-{theme}.png"))
                    ratio = contrast_of(g["color"], g["bg"]) if g else 0
                    record(f"W7 Begrüßung als Text mindestens 4,5:1 ({lang} {display} {width}, {theme})",
                           bool(g) and ratio >= 4.5, {**(g or {}), "kontrast": ratio})
                finally:
                    ctx.close()


# Prüfungen der Korrekturen nach rc1 (Fixliste), einzeln wählbar mit --only
RC2_CHECKS = {
    "w2": check_rc2,
    "w4": check_w4,
    "w5": check_w5,
    "w6": check_w6,
    "w7": check_w7,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--tag", default="neu")
    ap.add_argument("--lang", nargs="+", default=["de", "en"])
    ap.add_argument("--themes", nargs="+", default=["light", "dark"])
    ap.add_argument("--views", nargs="+", default=[v[0] for v in VIEWS])
    ap.add_argument("--skip-once", action="store_true")
    ap.add_argument("--rc2-only", action="store_true", help="nur die Prüfungen der Korrekturen nach rc1")
    ap.add_argument("--only", nargs="+", choices=sorted(RC2_CHECKS),
                    help="nur diese Prüfungen der Korrekturen nach rc1 (mit --rc2-only)")
    args = ap.parse_args()
    global SHOT_TAG
    SHOT_TAG = args.tag
    OUT_DIR.mkdir(exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in args.lang:
            for name, display, width, height in VIEWS:
                if args.rc2_only or name not in args.views:
                    continue
                for theme in args.themes:
                    try:
                        check_view(browser, base_url, name, display, width, height, theme, lang)
                    except Exception as e:  # weiter prüfen, Fehler festhalten
                        record(f"Ablauf {lang} {name} {theme}", False, str(e).splitlines()[0])
        if not args.rc2_only and not args.skip_once:
            check_once(browser, base_url)
        if args.rc2_only or not args.skip_once:
            for key, check in RC2_CHECKS.items():
                if not args.only or key in args.only:
                    check(browser, base_url)
        browser.close()
    srv.shutdown()
    out = OUT_DIR / f"datenschutz-fenster-{args.tag}.json"
    out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(bad)}/{len(RESULTS)} ok -> {out}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
