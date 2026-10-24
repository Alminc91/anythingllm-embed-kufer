#!/usr/bin/env python3
"""Browser-Messung der Kursanzahl im Kopf (KIE-576 Paket 3, AK-K5;
Spezifikation issues/KIE-576/KIE-576-kursanzahl.md, Abschnitt „Widget“).

Gebautes dist, lokale Testseite und gemockter Server wie
tests/visual/n3_header.py. Der gemockte Server liefert courseCount
(Beispielwerte des Vertrags, stand = vor zwei Stunden bzw. vor 25 Stunden).

Aufruf (aus dem Repo-Wurzelverzeichnis, Bundle vorher bauen):

  python3 tests/visual/kursanzahl.py [--dist DIR] [--out DIR] [--no-assert]

Ergebnis: DIR/kursanzahl.json (Standard DIR = .test-storage/kursanzahl) und je
Fall ein Bildschirmfoto. Fälle: Chatfenster 1440 x 900 (de, en), mobil
390 x 780 (de), mobil mit Bildschirmtastatur (kompakt), veraltet (25 h).
Prüfungen: Kopf 77 px (76 px plus Unterlinie, ±0,5 px), Kursanzahl eine
Zeile, Info-Knopf 24 x 24 px und oben auf (elementFromPoint), Karte öffnet
per Klick unter dem Kopf und innerhalb des Fensters, Escape schließt sie und
gibt den Fokus an den Knopf zurück; kompakt und veraltet keine Zahl.
"""

import argparse
import datetime
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402

KEYBOARD_HEIGHT = 420


def iso(hours_ago):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours_ago)
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


MEASURE = r"""() => {
  const h = window.__q('#anything-llm-header');
  const line = window.__q('#anything-llm-header-course-count');
  const btn = window.__q('#anything-llm-course-count-button');
  const sub = window.__q('#anything-llm-header-subtitle');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), left: +b.left.toFixed(1), width: +b.width.toFixed(1),
             height: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1) }; };
  let onTop = null;
  if (btn) { const b = btn.getBoundingClientRect();
    const hit = window.__allmShadow.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    onTop = !!hit && (hit === btn || btn.contains(hit)); }
  return { header: r(h), line: r(line), lineText: line ? line.textContent : null,
           lineHeight: line ? parseFloat(getComputedStyle(line).lineHeight) : null,
           button: r(btn), buttonOnTop: onTop, subtitle: sub ? sub.textContent : null,
           window: r(window.__q('#anything-llm-chat')) };
}"""

CARD = r"""() => {
  const c = window.__q('[role="dialog"][aria-label]');
  const btn = window.__q('#anything-llm-course-count-button');
  if (!c) return null; const b = c.getBoundingClientRect();
  const w = window.__q('#anything-llm-chat').getBoundingClientRect();
  const h = window.__q('#anything-llm-header').getBoundingClientRect();
  return { lines: [...c.children].map((e) => e.textContent), top: +b.top.toFixed(1),
           headerBottom: +h.bottom.toFixed(1), inside: b.left >= w.left && b.right <= w.right + 0.5,
           expanded: btn.getAttribute('aria-expanded'),
           focusInCard: window.__allmShadow.activeElement === c,
           bg: getComputedStyle(c).backgroundColor, color: getComputedStyle(c).color };
}"""


def run(b, base, out, name, viewport, server, attrs_extra=None, compact=False):
    attrs = {**tv.BASE_ATTRS, "open-on-load": "on", **(attrs_extra or {})}
    ctx, page = tv.open_page(b, base, {"attrs": attrs}, tv.Mock(config=server), viewport=viewport)
    tv.wait_shadow(page, "#anything-llm-header")
    tv.wait_shadow(page, 'button[aria-label="Optionen"], button[aria-label="Options"]')
    tv.settle(page, 800)
    if compact:
        page.set_viewport_size({"width": viewport["width"], "height": KEYBOARD_HEIGHT})
        page.wait_for_function(
            "() => { const t = window.__q('#anything-llm-header'); "
            "return !!t && t.firstElementChild.className.includes('allm-min-h-[56px]'); }",
            timeout=5000,
        )
        tv.settle(page, 600)
    m = page.evaluate(MEASURE)
    m["card"] = None
    if m["button"]:
        btn = m["button"]
        page.mouse.click(btn["left"] + btn["width"] / 2, btn["top"] + btn["height"] / 2)
        tv.settle(page, 300)
        m["card"] = page.evaluate(CARD)
        page.screenshot(path=str(out / f"kursanzahl-{name}-offen.png"))
        page.keyboard.press("Escape")
        tv.settle(page, 300)
        m["afterEscape"] = page.evaluate(
            """() => ({ card: !!window.__q('[role="dialog"][aria-label]'),
                 chatOpen: !!window.__q('#anything-llm-chat'),
                 focusOnButton: window.__allmShadow.activeElement === window.__q('#anything-llm-course-count-button') })"""
        )
    else:
        page.screenshot(path=str(out / f"kursanzahl-{name}.png"))
    m["errors"] = [t for k, t in page.console_log if k in ("error", "pageerror")]
    ctx.close()
    return m


def verdict(name, m):
    p = []
    if name in ("kompakt", "veraltet"):
        if m["line"]:
            p.append("Zahl sichtbar")
        if name == "veraltet" and not m["subtitle"]:
            p.append("kein Untertitel")
        return p
    if not m["line"]:
        return ["keine Kursanzahl"]
    if abs(m["header"]["height"] - 77) > 0.5:
        p.append(f"Kopf {m['header']['height']} statt 77 px")
    if m["line"]["height"] > m["lineHeight"] * 1.5:
        p.append("Kursanzahl mehr als eine Zeile")
    if (m["button"]["width"], m["button"]["height"]) != (24.0, 24.0):
        p.append(f"Knopf {m['button']['width']} x {m['button']['height']}")
    if not m["buttonOnTop"]:
        p.append("Knopf verdeckt")
    c = m["card"]
    if not c:
        p.append("Karte öffnet nicht")
    else:
        if c["top"] < c["headerBottom"]:
            p.append("Karte überdeckt den Kopf")
        if not c["inside"]:
            p.append("Karte ragt aus dem Fenster")
        if c["expanded"] != "true":
            p.append("aria-expanded nicht true")
    a = m.get("afterEscape") or {}
    if a.get("card"):
        p.append("Escape schließt die Karte nicht")
    if not a.get("chatOpen"):
        p.append("Escape schließt das Fenster statt der Karte")
    if not a.get("focusOnButton"):
        p.append("Fokus nach Escape nicht auf dem Knopf")
    if m["errors"]:
        p.append(f"Fehler: {m['errors']}")
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(tv.ROOT / "dist"))
    ap.add_argument("--out", default=str(tv.ROOT / ".test-storage" / "kursanzahl"))
    ap.add_argument("--no-assert", action="store_true")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

    fresh = {"count": 812, "offered": 837, "stand": iso(2), "word": "Kurse"}
    stale = {**fresh, "stand": iso(25)}
    gap = {**fresh, "count": 612}
    desktop = {"width": 1440, "height": 900}
    phone = {"width": 390, "height": 780}
    cases = [
        ("desktop-de", desktop, {"courseCount": fresh}, None, False),
        ("desktop-en", desktop, {"courseCount": {**gap, "word": "courses"}}, {"language": "en"}, False),
        ("mobil-de", phone, {"courseCount": gap}, None, False),
        ("kompakt", phone, {"courseCount": fresh}, None, True),
        ("veraltet", desktop, {"courseCount": stale}, None, False),
    ]
    srv, base = tv.start_server(args.dist)
    res = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for name, vp, server, extra, compact in cases:
            m = run(b, base, out, name, vp, server, extra, compact)
            m["probleme"] = verdict(name, m)
            res[name] = m
        b.close()
    srv.shutdown()
    (out / "kursanzahl.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    bad = 0
    for k, m in res.items():
        bad += bool(m["probleme"])
        print(f"{k:12s} kopf={m['header']['height']} zeile={m['lineText']!r} "
              f"untertitel={m['subtitle']!r} karte={(m['card'] or {}).get('lines')} "
              f"probleme={m['probleme'] or 'keine'}")
    if bad and not args.no_assert:
        sys.exit(1)


if __name__ == "__main__":
    main()
