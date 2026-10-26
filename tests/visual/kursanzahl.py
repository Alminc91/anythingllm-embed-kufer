#!/usr/bin/env python3
"""Browser-Messung der Kursanzahl im Kopf (KIE-576 Paket 3, AK-K5,
Fixliste r4 Nr. 1; Spezifikation issues/KIE-576/KIE-576-kursanzahl.md,
Abschnitt „Widget“ und Nachträge 26.10.2026).

Gebautes dist, lokale Testseite und gemockter Server wie
tests/visual/n3_header.py. Der gemockte Server liefert courseCount nach dem
Vertrag ab r4 ({count, word}); ein Fall liefert zusätzlich offered, hidden
und einen 25 Stunden alten stand wie ein Server vor r4 (das Widget liest nur
count und word, die 24-h-Regel entscheidet der Server).

Aufruf (aus dem Repo-Wurzelverzeichnis, Bundle vorher bauen):

  python3 tests/visual/kursanzahl.py [--dist DIR] [--out DIR] [--no-assert]

Ergebnis: DIR/kursanzahl.json (Standard DIR = .test-storage/kursanzahl) und je
Fall ein Bildschirmfoto. Fälle: Chatfenster 1440 x 900 (de, en), mobil
390 x 780 (de, lange Bezeichnung), mobil mit Bildschirmtastatur (kompakt),
älterer Server, ohne courseCount. Prüfungen: Kopf 77 px (76 px plus
Unterlinie, ±0,5 px), Kursanzahl eine Zeile und links neben den Buttons des
Kopfes, Zahl fett, kein Info-Knopf, kein Symbol und keine Karte in der
Zeile; kompakt keine Zahl, ohne courseCount der Untertitel.
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
  const sub = window.__q('#anything-llm-header-subtitle');
  const opts = window.__q('button[aria-label="Optionen"], button[aria-label="Options"]');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), left: +b.left.toFixed(1), width: +b.width.toFixed(1),
             height: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1) }; };
  const bold = line ? [...line.querySelectorAll('span')].find((e) => /^[0-9.,]+$/.test(e.textContent)) : null;
  return { header: r(h), line: r(line), lineText: line ? line.textContent : null,
           lineHeight: line ? parseFloat(getComputedStyle(line).lineHeight) : null,
           boldWeight: bold ? getComputedStyle(bold).fontWeight : null,
           infoButton: !!window.__q('#anything-llm-course-count-button'),
           lineExtras: line ? line.querySelectorAll('button, svg, [role]').length : null,
           dialog: !!window.__q('[role="dialog"]'),
           options: r(opts), subtitle: sub ? sub.textContent : null,
           window: r(window.__q('#anything-llm-chat')) };
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
    page.screenshot(path=str(out / f"kursanzahl-{name}.png"))
    m["errors"] = [t for k, t in page.console_log if k in ("error", "pageerror")]
    ctx.close()
    return m


def verdict(name, m, expect_text=None):
    p = []
    if m["infoButton"] or m["dialog"]:
        p.append("Info-Knopf oder Karte vorhanden")
    if m["errors"]:
        p.append(f"Fehler: {m['errors']}")
    if name in ("kompakt", "ohne"):
        if m["line"]:
            p.append("Zahl sichtbar")
        if name == "ohne" and not m["subtitle"]:
            p.append("kein Untertitel")
        return p
    if not m["line"]:
        return p + ["keine Kursanzahl"]
    if expect_text and m["lineText"] != expect_text:
        p.append(f"Text {m['lineText']!r} statt {expect_text!r}")
    if m["subtitle"]:
        p.append("Untertitel zusätzlich sichtbar")
    if abs(m["header"]["height"] - 77) > 0.5:
        p.append(f"Kopf {m['header']['height']} statt 77 px")
    if m["line"]["height"] > m["lineHeight"] * 1.5:
        p.append("Kursanzahl mehr als eine Zeile")
    if m["lineExtras"]:
        p.append("Symbol oder Button in der Zeile")
    if str(m["boldWeight"]) not in ("600", "700"):
        p.append(f"Zahl nicht fett ({m['boldWeight']})")
    if m["options"] and m["line"]["right"] > m["options"]["left"] + 0.5:
        p.append("Zeile reicht unter die Buttons des Kopfes")
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

    cc = {"count": 812, "word": "Kurse"}
    older = {"count": 844, "offered": 900, "hidden": 14, "stand": iso(25), "word": "Kurse"}
    desktop = {"width": 1440, "height": 900}
    phone = {"width": 390, "height": 780}
    cases = [
        ("desktop-de", desktop, {"courseCount": cc}, None, False, "aktuell 812 Kurse"),
        ("desktop-en", desktop, {"courseCount": {"count": 1243, "word": "courses"}},
         {"language": "en"}, False, "currently 1,243 courses"),
        ("mobil-de", phone, {"courseCount": {"count": 1243, "word": None}}, None, False,
         "aktuell 1.243 Kurse"),
        ("mobil-lang", phone, {"courseCount": {"count": 12843, "word": "Weiterbildungskurse"}},
         None, False, "aktuell 12.843 Weiterbildungskurse"),
        ("kompakt", phone, {"courseCount": cc}, None, True, None),
        ("aelterer-server", desktop, {"courseCount": older}, None, False, "aktuell 844 Kurse"),
        ("ohne", desktop, {}, None, False, None),
    ]
    srv, base = tv.start_server(args.dist)
    res = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for name, vp, server, extra, compact, text in cases:
            m = run(b, base, out, name, vp, server, extra, compact)
            m["probleme"] = verdict(name, m, text)
            res[name] = m
        b.close()
    srv.shutdown()
    (out / "kursanzahl.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    bad = 0
    for k, m in res.items():
        bad += bool(m["probleme"])
        print(f"{k:16s} kopf={m['header']['height']} zeile={m['lineText']!r} "
              f"untertitel={m['subtitle']!r} probleme={m['probleme'] or 'keine'}")
    if bad and not args.no_assert:
        sys.exit(1)


if __name__ == "__main__":
    main()
