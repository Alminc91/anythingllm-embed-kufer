#!/usr/bin/env python3
"""Browser-Messung Zeilen-Karten (courseCardsLayout "rows"): Uhrzeit-/Termin-
spalte (.allm-course-when) und Status-Marke (.allm-course-status) sitzen
vertikal auf der Mitte der GESAMTEN Karte (Titel + Meta + Teaser), der
Textblock bleibt oben ausgerichtet (Demo-Rückmeldung 06.10.2026, Nachfrage
20.10.2026). Gebautes dist, Server gemockt wie tests/visual/kie567_568.py,
1440 px Inline.

Fälle:
  mehrzeilig: drei Karten mit Meta-Zeile und KI-Teaser (2 bis 3 Zeilen)
  einzeilig:  drei Karten nur mit Zeit, Titel und Marke (kein Meta, kein
              Teaser): Marke und Zeit liegen ohnehin auf der Titelzeile, hier
              darf sich nichts ändern
  raster:     Rasterkarten (courseCardsLayout "grid") bei 1440 px Inline,
              unverändert (nur Screenshot, Vergleich vorher/nachher)
  mobil:      390 px Inline mit "rows": Rückfall auf die Rasterkarte
              (data-layout rows-narrow), unverändert (nur Screenshot)

Messung je Karte: Mitte der Uhrzeitspalte und Mitte der Marke gegen die
Kartenmitte (Toleranz ±2 px), Titel-Oberkante am oberen Polsterrand.

Aufruf (nach npm run build):
  python3 tests/visual/rows_center.py [--out DIR] [--label nachher] [--no-assert] [--dist DIR]
Screenshots: DIR/<label>-*.png (Standard .test-storage/rc12/), Messwerte
DIR/<label>-summary.json. --no-assert: nur messen (Vorher-Stand belegen).
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import course_cards as cc  # noqa: E402
import kie567_568 as k  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT = ROOT / ".test-storage" / "rc12"
TOL = 2.0
CONFIG = {
    "courseCards": "auto",
    "courseCardsPosition": "below",
    "courseCardsLayout": "rows",
    "displayMode": "inline",
}
# Einzeilige Karten: nur Wochentag + Uhrzeit (Lead), Titel, Buchbarkeit;
# ohne start_date/price/location/venue bleibt die Meta-Zeile leer
SINGLE = [
    {"url": c["url"], "title": c["title"], "weekdays": c["weekdays"],
     "start_minutes": c["start_minutes"], "bookable": c["bookable"]}
    for c in k.ANNOUNCED
]
RESULTS = []

MEASURE_JS = r"""
() => {
  const s = window.__allmShadow;
  const list = s.querySelector('.allm-course-list');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, mid: r.y + r.height / 2 };
  };
  const rows = [...s.querySelectorAll('[data-course-row]')].map((row) => {
    const card = box(row);
    const when = box(row.querySelector('.allm-course-when'));
    const badge = box(row.querySelector('.allm-course-status'));
    const title = box(row.querySelector('.allm-course-title'));
    const meta = box(row.querySelector('.allm-course-details'));
    const teaser = box(row.querySelector('.allm-course-teaser'));
    const cs = getComputedStyle(row);
    const padTop = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    return {
      title: row.getAttribute('aria-label'),
      card, when, badge, titleBox: title, meta, teaser,
      rows: cs.gridTemplateRows.split(' ').length,
      whenRow: when ? getComputedStyle(row.querySelector('.allm-course-when')).gridRow : null,
      badgeRow: badge ? getComputedStyle(row.querySelector('.allm-course-status')).gridRow : null,
      dWhen: when ? +(when.mid - card.mid).toFixed(2) : null,
      dBadge: badge ? +(badge.mid - card.mid).toFixed(2) : null,
      titleTop: title ? +(title.y - card.y - padTop).toFixed(2) : null,
      teaserLines: teaser ? Math.round(teaser.h / 18) : 0,
    };
  });
  const sec = s.querySelector('[data-course-cards]');
  const sr = sec ? sec.getBoundingClientRect() : null;
  return {
    layout: list ? list.getAttribute('data-layout') : null,
    listWidth: list ? list.getBoundingClientRect().width : null,
    section: sr ? { x: sr.x, y: sr.y, w: sr.width, h: sr.height } : null,
    rows,
  };
}
"""


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(("OK   " if ok else "FAIL ") + key + ": " + json.dumps(detail, ensure_ascii=False)[:400])


def events_single(uuid="u-1"):
    ev = [{"uuid": uuid, "type": "courseSources", "courseSources": SINGLE, "close": False, "error": False}]
    size = len(k.SHORT) // 3 + 1
    ev += [{"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": k.SHORT[i:i + size]}
           for i in range(0, len(k.SHORT), size)]
    ev[-1]["close"] = True
    ev.append({"uuid": uuid, "type": "followUps", "followUps": k.FU, "close": False, "error": False})
    ev.append({"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712,
               "courseCardsAnnounced": len(SINGLE)})
    return ev


def shoot_cards(page, path):
    page.evaluate("() => window.__q('[data-course-cards]').scrollIntoView({ block: 'center' })")
    page.wait_for_timeout(200)
    r = page.evaluate("() => { const r = window.__q('[data-course-cards]').getBoundingClientRect();"
                      " return { x: r.x, y: r.y, width: r.width, height: r.height }; }")
    clip = {"x": max(0, r["x"] - 16), "y": max(0, r["y"] - 16), "width": r["width"] + 32, "height": r["height"] + 32}
    page.screenshot(path=str(path), clip=clip, animations="disabled", caret="hide")


def run_case(browser, base_url, name, events, label, check, config=CONFIG, viewport=k.DESKTOP, layout="rows"):
    ctx, page = k.open_chat(browser, base_url, config, events, viewport, None, True)
    try:
        sel = "[data-course-row]" if layout == "rows" else ".allm-course-card"
        page.wait_for_function(f"() => window.__allmShadow.querySelectorAll('{sel}').length >= 3", timeout=10000)
        tv.settle(page, 600)
        d = page.evaluate(MEASURE_JS)
        page.screenshot(path=str(OUT / f"{label}-{name}-{viewport['width']}-inline.png"), full_page=True,
                        animations="disabled", caret="hide")
        shoot_cards(page, OUT / f"{label}-{name}-karten.png")
        errs = tv.errors_of(page)
        if layout != "rows":
            # Regressionsfälle: kein data-course-row, Layout wie erwartet, nur Screenshot
            n = page.evaluate("() => window.__allmShadow.querySelectorAll('.allm-course-card').length")
            ok = d["layout"] == layout and not d["rows"] and n == 3 and not errs
            record(f"{label} {name}", ok, {"layout": d["layout"], "listWidth": d["listWidth"], "karten": n,
                                           "zeilenKarten": len(d["rows"]), "errors": errs})
            return d
        rows = d["rows"]
        centered = all(abs(r["dWhen"]) <= TOL and abs(r["dBadge"]) <= TOL for r in rows)
        text_top = all(abs(r["titleTop"]) <= 0.5 for r in rows)
        multi = all(r["meta"] and r["teaser"] and r["rows"] == 3 for r in rows)
        single = all(not r["meta"] and not r["teaser"] and r["rows"] == 1 for r in rows)
        shape_ok = multi if name == "mehrzeilig" else single
        ok = (d["layout"] == "rows" and len(rows) == 3 and shape_ok and text_top and not errs
              and (centered or not check))
        record(f"{label} {name}", ok, {
            "layout": d["layout"], "listWidth": d["listWidth"], "errors": errs,
            "karten": [{"titel": r["title"], "kartenH": r["card"]["h"], "zeilen": r["rows"],
                        "teaserZeilen": r["teaserLines"], "gridRowZeit": r["whenRow"],
                        "gridRowMarke": r["badgeRow"], "dZeit": r["dWhen"], "dMarke": r["dBadge"],
                        "titelOben": r["titleTop"]} for r in rows],
            "zentriert": centered,
        })
        return d
    finally:
        ctx.close()


def main():
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--label", default="nachher")
    ap.add_argument("--no-assert", action="store_true", help="nur messen (Vorher-Stand)")
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    args = ap.parse_args()
    OUT = pathlib.Path(args.out)
    OUT.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            run_case(browser, base_url, "mehrzeilig", k.cards_events(), args.label, not args.no_assert)
            run_case(browser, base_url, "einzeilig", events_single(), args.label, not args.no_assert)
            run_case(browser, base_url, "raster", k.cards_events(), args.label, False,
                     config={**CONFIG, "courseCardsLayout": "grid"}, layout=None)
            run_case(browser, base_url, "mobil", k.cards_events(), args.label, False,
                     viewport=k.PHONE, layout="rows-narrow")
            browser.close()
    finally:
        srv.shutdown()
    (OUT / f"{args.label}-summary.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
    failed = [r["key"] for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} ok" + (f", FAIL: {failed}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
