#!/usr/bin/env python3
"""Breite des Chatfensters und Platzhalter im Eingabefeld (Fixliste
datenschutz-fusszeile rc2, W12; Nutzer 24.10.2026: „Ja, machen wir gerne
360px“).

Soll ab 768 px Bildschirmbreite: Chatfenster max(40 %, 360 px) bis 1279 px,
max(25 %, 360 px) ab 1280 px, nie breiter als die Seite minus Randabstand;
mobil (unter 768 px) Vollbild. Der Platzhalter („Stellen Sie hier Ihre
Frage …“ bzw. „Ask your question here …“) steht einzeilig und ganz im Feld
(Breite des Texts in der Schrift der textarea höchstens die Innenbreite,
scrollHeight == clientHeight), auch mit dem Mikrofon-Button daneben (der
Server meldet Spracheingabe, wie auf den Kundeninstanzen; ohne ihn ist das
Feld 24 px breiter), die Fußzeile bleibt eine Zeile
(disclaimer_measure.verdict, AK-8). Zusätzlich: eine Fenstergröße unter
360 px in der Konfiguration der Testseite (windowWidth; der Server liefert
sie seit dem vereinfachten Design Center nicht mehr aus, n3_header.py nutzt
den Weg für schmale Fenster) wird auf 360 px angehoben (layout.js
WINDOW_MIN_WIDTH_PX).

Gemessen mit gebautem dist und Playwright (lokale Testseite, Server
gemockt) bei 768, 1024, 1280, 1366, 1440, 1920 und mobil 390 px, hell und
dunkel, de und en.

Aufruf (aus dem Repo-Wurzelverzeichnis, npm run build vorher):

  python3 tests/visual/fensterbreite.py [--dist dist] [--tag neu] [--no-assert]

Ergebnis: .test-storage/fensterbreite-<tag>.json, Bilder
.test-storage/fensterbreite-<tag>-*.png und eine Tabelle auf stdout.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import disclaimer_measure as dm  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT_DIR = ROOT / ".test-storage"
WIDTHS = [768, 1024, 1280, 1366, 1440, 1920, 390]
HEIGHT = {390: 800, 768: 1024, 1024: 768}
MIN_WIDTH = 360
EDGE = 32  # Randabstand 16 px je Seite (allm-mr-4 bzw. allm-ml-4)
PLACEHOLDER = {"de": "Stellen Sie hier Ihre Frage …", "en": "Ask your question here …"}

class SttMock(tv.Mock):
    """Wie tv.Mock, der Server meldet Spracheingabe (Mikrofon-Button)."""

    def handle(self, route):
        if route.request.url.split("?")[0].endswith("/audio/status"):
            return route.fulfill(json={"stt": True, "tts": False})
        return super().handle(route)


PROBE_JS = r"""
() => {
  const win = window.__q('#anything-llm-chat');
  const ta = window.__q('#message-input');
  if (!win || !ta) return null;
  const cs = getComputedStyle(ta);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const inner = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const r = win.getBoundingClientRect();
  const round = (v) => Math.round(v * 10) / 10;
  return {
    window: { x: round(r.left), w: round(r.width), h: round(r.height), right: round(r.right) },
    viewport: window.innerWidth,
    placeholder: ta.placeholder,
    font: `${cs.fontSize} ${cs.fontFamily}`,
    textWidth: round(ctx.measureText(ta.placeholder).width),
    inner: round(inner),
    scrollHeight: ta.scrollHeight,
    clientHeight: ta.clientHeight,
    mic: !!window.__q('button[aria-label="Aufnahme starten"], button[aria-label="Start recording"]'),
  };
}
"""


def expected_width(vw, design_width=None):
    if vw < 768:
        return vw
    if design_width is not None:
        return min(max(MIN_WIDTH, design_width), vw - EDGE)
    pct = 0.40 if vw < 1280 else 0.25
    return min(max(pct * vw, MIN_WIDTH), vw - EDGE)


def measure(browser, base_url, width, theme, lang, tag, config=None, design_width=None):
    attrs = {**tv.BASE_ATTRS, "theme": theme, "language": lang, "open-on-load": "on"}
    viewport = {"width": width, "height": HEIGHT.get(width, 900)}
    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, mock=SttMock(config=config or {}),
                             viewport=viewport)
    try:
        tv.wait_shadow(page, "#message-input")
        tv.wait_shadow(page, "#anything-llm-ai-disclaimer")
        tv.settle(page, 500)
        st = page.evaluate(PROBE_JS)
        if not st["mic"]:
            page.wait_for_timeout(800)
            st = page.evaluate(PROBE_JS)
        footer = page.evaluate(dm.MEASURE_JS, [])
        foot = dm.verdict(footer, width)
        why = []
        want = expected_width(width, design_width)
        if abs(st["window"]["w"] - want) > 1:
            why.append(f"Fenster {st['window']['w']} statt {round(want, 1)}")
        if width >= 768 and st["window"]["w"] < MIN_WIDTH - 0.5:
            why.append(f"Fenster unter {MIN_WIDTH}")
        if width >= 768 and (st["window"]["x"] < EDGE / 2 - 0.5 or st["window"]["right"] > width - EDGE / 2 + 0.5):
            why.append("Fenster ragt in den Randabstand")
        if not st["mic"]:
            why.append("kein Mikrofon-Button")
        if st["placeholder"] != PLACEHOLDER[lang]:
            why.append(f"Platzhalter {st['placeholder']!r}")
        if st["textWidth"] > st["inner"] + 0.5:
            why.append(f"Platzhalter {st['textWidth']} > Feld {st['inner']}")
        if st["scrollHeight"] > st["clientHeight"]:
            why.append(f"textarea scrollHeight {st['scrollHeight']} > {st['clientHeight']}")
        if not foot["ok"]:
            why.append("Fußzeile: " + ", ".join(foot["why"]))
        errs = tv.errors_of(page)
        if errs:
            why.append(f"Konsole {errs[:2]}")
        suffix = f"-dc{design_width}" if design_width else ""
        shot = OUT_DIR / f"fensterbreite-{tag}-{lang}-{width}-{theme}{suffix}.png"
        page.screenshot(path=str(shot))
        return {**st, "want": round(want, 1), "footer": {k: footer.get(k) for k in ("fontSize", "lines", "truncated")},
                "ok": not why, "why": why, "screenshot": str(shot)}
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--tag", default="neu")
    ap.add_argument("--lang", nargs="+", default=["de", "en"])
    ap.add_argument("--themes", nargs="+", default=["light", "dark"])
    ap.add_argument("--widths", nargs="+", type=int, default=WIDTHS)
    ap.add_argument("--no-assert", action="store_true", help="nur messen (Vorher-Stand)")
    args = ap.parse_args()
    OUT_DIR.mkdir(exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in args.lang:
            for width in args.widths:
                for theme in args.themes:
                    r = measure(browser, base_url, width, theme, lang, args.tag)
                    rows.append({"case": "standard", "lang": lang, "width": width, "theme": theme, **r})
        # Fenstergröße unter 360 px in der Konfiguration der Testseite (nur
        # Testseiten, der Server liefert windowWidth nicht mehr aus)
        for width in (1024, 1280):
            r = measure(browser, base_url, width, "light", "de", args.tag,
                        config={"windowWidth": "300px"}, design_width=300)
            rows.append({"case": "Testseite 300px", "lang": "de", "width": width, "theme": "light", **r})
        browser.close()
    srv.shutdown()
    out = OUT_DIR / f"fensterbreite-{args.tag}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{'Fall':18} {'lang':4} {'Breite':>6} {'theme':5} {'Fenster':>7} {'Soll':>6} {'Text':>6} {'Feld':>6} {'sH/cH':>7} ok")
    for r in rows:
        print(f"{r['case']:18} {r['lang']:4} {r['width']:>6} {r['theme']:5} {r['window']['w']:>7} {r['want']:>6} "
              f"{r['textWidth']:>6} {r['inner']:>6} {str(r['scrollHeight']) + '/' + str(r['clientHeight']):>7} "
              f"{'ok' if r['ok'] else 'NEIN ' + '; '.join(r['why'])}")
    bad = [r for r in rows if not r["ok"]]
    print(f"{len(rows) - len(bad)}/{len(rows)} ok -> {out}")
    if bad and not args.no_assert:
        sys.exit(1)


if __name__ == "__main__":
    main()
