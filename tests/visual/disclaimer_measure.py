#!/usr/bin/env python3
"""Messung des KI-Hinweises unter der Eingabe (Fixliste 7.22-rc8 R1).

Misst mit gebautem dist und Playwright (lokale Testseite, Server gemockt) je
Breite 360 / 390 / 1280 / 1440 px, hell / dunkel, Chatfenster und In der
Seite: wirksame Schriftgröße, verfügbare Breite, Breite des Textes bei 10
und 11 px und ob die Zeile mit „…“ endet (Ein-Zeilen-Regel: scrollWidth >
clientWidth).

Aufruf (aus dem Repo-Wurzelverzeichnis, npm run build vorher):

  python3 tests/visual/disclaimer_measure.py [--dist dist] [--tag neu] [--lang de en]

Ergebnis: .test-storage/disclaimer-<tag>.json und eine Tabelle auf stdout.
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

WIDTHS = [360, 390, 1280, 1440]
THEMES = ["light", "dark"]
DISPLAYS = ["bubble", "inline"]

MEASURE_JS = r"""
(extra) => {
  const el = window.__q("#anything-llm-ai-disclaimer");
  if (!el) return null;
  const cs = getComputedStyle(el);
  const box = el.parentElement;
  const probe = (px, text = el.textContent) => {
    const s = document.createElement("span");
    s.className = el.className;
    s.style.cssText = "position:absolute;white-space:nowrap;visibility:hidden;font-size:" + px + "px";
    s.textContent = text;
    box.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return Math.round(w * 10) / 10;
  };
  const lh = parseFloat(cs.lineHeight);
  const extraWidths = {};
  for (const t of extra || []) extraWidths[t] = { w10: probe(10, t), w11: probe(11, t) };
  return {
    extraWidths,
    text: el.textContent,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    boxWidth: box.clientWidth,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    textWidth10: probe(10),
    textWidth11: probe(11),
    truncated: el.scrollWidth > el.clientWidth,
    lines: Math.round(el.getBoundingClientRect().height / lh),
  };
}
"""


def measure(browser, base_url, width, theme, display, lang, extra=(), page_font=None):
    attrs = {**tv.BASE_ATTRS, "theme": theme, "language": lang}
    cfg = {"attrs": attrs}
    if page_font:
        cfg["css"] = "html, body { font-family: %s; }" % page_font
    if display == "bubble":
        attrs["open-on-load"] = "on"
    else:
        attrs["display-mode"] = "inline"
        attrs["inline-start-state"] = "expanded"
        cfg["inline"] = True
    viewport = {"width": width, "height": 800}
    ctx, page = tv.open_page(
        browser, base_url, cfg, mock=tv.Mock(config={}), viewport=viewport
    )
    try:
        if display == "inline" and width < 768:
            # mobil gibt es keine Box: Tippen in die Leiste öffnet das Vollbild
            tv.wait_shadow(page, "#anything-llm-inline-input")
            page.wait_for_timeout(300)
            x, y = page.evaluate(
                "() => { const r = window.__q('#anything-llm-inline-input').getBoundingClientRect();"
                " return [r.x + 20, r.y + r.height / 2]; }"
            )
            page.mouse.click(x, y)
        try:
            tv.wait_shadow(page, "#anything-llm-ai-disclaimer")
        except Exception as e:  # Zustand festhalten, weiter messen
            shot = OUT_DIR / f"disclaimer-fail-{lang}-{display}-{width}-{theme}.png"
            page.screenshot(path=str(shot))
            return {"error": str(e).splitlines()[0], "console": page.console_log[-10:], "screenshot": str(shot)}
        tv.settle(page, 500)
        result = page.evaluate(MEASURE_JS, list(extra))
        result["errors"] = tv.errors_of(page)
        return result
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--tag", default="neu")
    ap.add_argument("--lang", nargs="+", default=["de", "en"])
    ap.add_argument("--texts", nargs="*", default=[], help="weitere Texte: Breite bei 10/11 px je Kombination")
    ap.add_argument("--page-font", default=None, help="Schrift der Testseite (Inline erbt sie)")
    ap.add_argument("--themes", nargs="+", default=THEMES)
    ap.add_argument("--displays", nargs="+", default=DISPLAYS)
    ap.add_argument("--widths", nargs="+", type=int, default=WIDTHS)
    args = ap.parse_args()
    OUT_DIR.mkdir(exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in args.lang:
            for display in args.displays:
                for width in args.widths:
                    for theme in args.themes:
                        print(f"... {lang} {display} {width} {theme}", flush=True)
                        r = measure(browser, base_url, width, theme, display, lang, args.texts, args.page_font)
                        rows.append({"lang": lang, "display": display, "width": width, "theme": theme, **(r or {})})
        browser.close()
    srv.shutdown()
    out = OUT_DIR / f"disclaimer-{args.tag}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{'lang':4} {'display':7} {'width':>5} {'theme':5} {'font':>6} {'box':>5} {'avail':>5} {'w10':>6} {'w11':>6} {'trunc':5} lines")
    for r in rows:
        print(
            f"{r['lang']:4} {r['display']:7} {r['width']:>5} {r['theme']:5} {r.get('fontSize', '-'):>6} "
            f"{r.get('boxWidth', '-'):>5} {r.get('clientWidth', '-'):>5} {r.get('textWidth10', '-'):>6} "
            f"{r.get('textWidth11', '-'):>6} {str(r.get('truncated', '-')):5} {r.get('lines', '-')}"
            + (f"  FEHLER {r['errors']}" if r.get("errors") else "")
            + (f"  TIMEOUT {r['error']} {r.get('console')}" if r.get("error") else "")
            + "".join(f"  | {t[:28]}…: {w['w10']}/{w['w11']}" for t, w in (r.get("extraWidths") or {}).items())
        )
    print(f"-> {out}")


if __name__ == "__main__":
    main()
