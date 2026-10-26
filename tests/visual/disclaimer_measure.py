#!/usr/bin/env python3
"""Messung des KI-Hinweises unter der Eingabe (Fixliste 7.22-rc8 R1), seit
7.23 mit dem Link „Datenschutz“ in derselben Zeile (Spezifikation
issues/datenschutz-fusszeile.md, AK-1, AK-2, AK-8).

Misst mit gebautem dist und Playwright (lokale Testseite, Server gemockt) je
Breite 360 / 390 / 1024 / 1280 / 1440 / 1920 px, hell / dunkel, Chatfenster
und In der Seite (aufgeklappt, mobil das Vollbild): wirksame Schriftgröße,
verfügbare Breite, Breite der ganzen Zeile bei 10 und 11 px, ob der KI-Satz
mit „…“ endet (scrollWidth > clientWidth), ob die Zeile eine Zeile bleibt,
und für den Link: ganz sichtbar, Trefferfläche (Breite × Höhe, Treffer per
elementFromPoint an Mitte und Rändern), Farbe, Fläche, Kontrast,
unterstrichen. Ergebnis je Zeile „ok“ nur, wenn alles zutrifft (eine Zeile,
kein „…“, Link ganz sichtbar und unterstrichen, Kontrast ≥ 4,5:1,
Trefferfläche ≥ 24 × 24 px bzw. mobil ≥ 44 px hoch).

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

WIDTHS = [360, 390, 1024, 1280, 1440, 1920]
MOBILE_MAX = 767
THEMES = ["light", "dark"]
DISPLAYS = ["bubble", "inline"]

MEASURE_JS = r"""
(extra) => {
  const el = window.__q("#anything-llm-ai-disclaimer");
  if (!el) return null;
  const root = window.__allmShadow;
  const textEl = window.__q("#anything-llm-ai-disclaimer-text") || el;
  const link = window.__q("#anything-llm-privacy-link");
  const cs = getComputedStyle(el);
  const box = el.parentElement;
  const probe = (px, text = el.textContent) => {
    const s = document.createElement("span");
    s.className = el.className;
    s.style.cssText = "position:absolute;white-space:pre;visibility:hidden;font-size:" + px + "px";
    s.textContent = text;
    box.appendChild(s);
    // Innenabstand des Links (2 px je Seite) gehört zur Zeile
    const w = s.getBoundingClientRect().width + (link ? 4 : 0);
    s.remove();
    return Math.round(w * 10) / 10;
  };
  const rect = (e) => {
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10,
      w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10,
      right: Math.round(b.right * 10) / 10, bottom: Math.round(b.bottom * 10) / 10 };
  };
  const lh = parseFloat(cs.lineHeight);
  const extraWidths = {};
  for (const t of extra || []) extraWidths[t] = { w10: probe(10, t), w11: probe(11, t) };
  const boxRect = rect(box);
  const textRect = rect(textEl);
  const out = {
    extraWidths,
    text: el.textContent,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    boxWidth: box.clientWidth,
    clientWidth: textEl.clientWidth,
    scrollWidth: textEl.scrollWidth,
    textWidth10: probe(10),
    textWidth11: probe(11),
    truncated: textEl.scrollWidth > textEl.clientWidth + 0.5,
    lineOverflow: el.scrollWidth > el.clientWidth + 0.5,
    lines: Math.round(textRect.h / lh),
    rowHeight: rect(el).h,
    window: rect(window.__q("#anything-llm-chat") || window.__q("#anything-llm-inline-chat-window") || box),
  };
  if (link) {
    const lr = rect(link);
    const lcs = getComputedStyle(link);
    const hit = (x, y) => {
      const t = root.elementFromPoint(x, y);
      return !!t && (t === link || link.contains(t));
    };
    const cx = lr.x + lr.w / 2;
    const cy = lr.y + lr.h / 2;
    out.link = {
      text: link.textContent,
      tag: link.tagName,
      rect: lr,
      inside: lr.x >= boxRect.x - 0.5 && lr.right <= boxRect.right + 0.5,
      sameRow: Math.abs((lr.y + lr.h / 2) - (textRect.y + textRect.h / 2)) <= 3,
      color: lcs.color,
      bg: lcs.backgroundColor,
      decoration: lcs.textDecorationLine,
      hitCenter: hit(cx, cy),
      hitTop: hit(cx, lr.y + 1),
      hitBottom: hit(cx, lr.bottom - 1),
      hitLeft: hit(lr.x + 1, cy),
      hitRight: hit(lr.right - 1, cy),
    };
  }
  return out;
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
        result.update(verdict(result, width))
        shot = OUT_DIR / f"disclaimer-{lang}-{display}-{width}-{theme}.png"
        el = page.evaluate_handle("() => window.__q('#anything-llm-ai-disclaimer').parentElement.parentElement")
        try:
            el.as_element().screenshot(path=str(shot))
            result["screenshot"] = str(shot)
        except Exception:
            pass
        return result
    finally:
        ctx.close()


def verdict(r, width):
    """Bewertung je Zeile: eine Zeile, kein „…“, Link ganz sichtbar und
    unterstrichen, Kontrast ≥ 4,5:1, Trefferfläche ≥ 24 × 24 px (mobil
    ≥ 44 px hoch)."""
    link = r.get("link")
    if not link:
        return {"ok": False, "why": ["kein Link"]}
    why = []
    if r.get("truncated"):
        why.append("…")
    if r.get("lineOverflow"):
        why.append("Zeile läuft über")
    if r.get("lines", 1) != 1:
        why.append(f"{r.get('lines')} Zeilen")
    if not link["inside"]:
        why.append("Link abgeschnitten")
    if not link["sameRow"]:
        why.append("Link nicht in derselben Zeile")
    if "underline" not in (link.get("decoration") or ""):
        why.append("nicht unterstrichen")
    fg = tv.parse_rgb(link["color"])
    bg = tv.parse_rgb(link["bg"])
    ratio = tv.contrast(tv.over(fg, bg), bg) if bg[3] == 1 else 0
    if ratio < 4.5:
        why.append(f"Kontrast {ratio:.2f}")
    min_h = 44 if width <= MOBILE_MAX else 24
    if link["rect"]["h"] < min_h - 0.5:
        why.append(f"Höhe {link['rect']['h']} < {min_h}")
    if link["rect"]["w"] < 24 - 0.5:
        why.append(f"Breite {link['rect']['w']} < 24")
    for k in ("hitCenter", "hitTop", "hitBottom", "hitLeft", "hitRight"):
        if not link[k]:
            why.append(f"kein Treffer {k}")
    return {"ok": not why, "why": why, "contrast": round(ratio, 2)}


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
    print(f"{'lang':4} {'display':7} {'width':>5} {'theme':5} {'font':>6} {'box':>5} {'w10':>6} {'w11':>6} {'trunc':5} {'lines':5} {'link w×h':>11} {'kontr':>5} ok")
    for r in rows:
        link = r.get("link") or {}
        lr = link.get("rect") or {}
        print(
            f"{r['lang']:4} {r['display']:7} {r['width']:>5} {r['theme']:5} {r.get('fontSize', '-'):>6} "
            f"{r.get('boxWidth', '-'):>5} {r.get('textWidth10', '-'):>6} "
            f"{r.get('textWidth11', '-'):>6} {str(r.get('truncated', '-')):5} {str(r.get('lines', '-')):5} "
            f"{(str(lr.get('w')) + '×' + str(lr.get('h'))) if lr else '-':>11} {str(r.get('contrast', '-')):>5} "
            f"{'ok' if r.get('ok') else 'NEIN ' + ', '.join(r.get('why') or [])}"
            + (f"  FEHLER {r['errors']}" if r.get("errors") else "")
            + (f"  TIMEOUT {r['error']} {r.get('console')}" if r.get("error") else "")
            + "".join(f"  | {t[:28]}…: {w['w10']}/{w['w11']}" for t, w in (r.get("extraWidths") or {}).items())
        )
    bad = [r for r in rows if not r.get("ok")]
    print(f"{len(rows) - len(bad)}/{len(rows)} ok -> {out}")
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
