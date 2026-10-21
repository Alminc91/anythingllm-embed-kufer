#!/usr/bin/env python3
"""Browser-Messung der Titelleiste des Chats (Fixliste 7.22-rc13 N3,
Nutzerentscheidung 20.10.2026; Fixliste 7.22-rc16 W40, W46, E21).

Name und Untertitel werden nie gekürzt, sondern brechen um; der Kopf wird
dafür höher, ⋮ und ✕ bleiben frei (mindestens 8 px Abstand). Ohne Umbruch
bleibt die Höhe wie vor rc13: 76 px plus 1 px Unterlinie, kompakt (mobil bei
offener Bildschirmtastatur) 56 px plus 1 px (W40). Kompakt steht nur der
Name, der Untertitel ist ausgeblendet (E21).
Gebautes dist, lokale Testseite und gemockter Server wie
tests/visual/theme_visual.py (vorher in .test-storage/rc13/probe_n3.py).
Darstellung „In der Seite“ und Name kommen als Antwort des gemockten Servers
(Design Center, Gruppe A nach E23; ein data-display-mode am Skript wirkt
seit rc17 nicht, Fixliste 7.22-rc18 W65).

Aufruf (aus dem Repo-Wurzelverzeichnis, npm run build vorher):

  python3 tests/visual/n3_header.py [--label nachher] [--dist DIR] [--out DIR]
                                    [--no-assert] [--only kurz,eigen]

Ergebnis: DIR/n3-<label>.json (Standard DIR = .test-storage/n3), je Fall ein
Ausschnitt der Titelleiste DIR/n3-<label>-<modus>-<breite>-<text>-kopf.png
und für "eigen" ein Vollbild; Zusammenfassung auf stdout. Ohne --no-assert
endet das Skript mit Status 1, sobald ein Fall ein Problem hat.

Modi:
  chatfenster  Desktop 1440x900, Chatfenster mit windowWidth 360/390/420 px
  seite        In der Seite, aufgeklappt, Desktop 1280x900, Platzhalter
               360/390/420 px breit
  mobil        Vollbild, Viewport 360/390/420 x 780
  kompakt      wie mobil, danach Viewport-Höhe 420 px: der sichtbare Bereich
               schrumpft um mehr als 120 px wie bei einer Bildschirmtastatur
               (useMobileKeyboard), der Kopf wird kompakt
Texte (je Modus und Breite):
  kurz         Name „KI-Berater“, Standard-Untertitel deutsch (W40)
  kurz-ohne    Name „KI-Berater“, kein Untertitel (W40)
  standard     langer Kundenname, Standard-Untertitel deutsch
  standard-en  langer Kundenname, Standard-Untertitel englisch
  eigen        langer Kundenname, langer eigener Untertitel (59 Zeichen)
  kurz-rand    wie kurz, Kopffarbe und Icon-Stil border (2 px Rand, W64)
  kurz-glas    wie kurz, Kopffarbe und Icon-Stil glass (1 px Rand, W64)
Prüfungen je Fall: voller Text im Namen und (außer kompakt) im Untertitel,
kein text-overflow: ellipsis, kein waagerechter Überlauf (scrollWidth <=
clientWidth), Text vollständig innerhalb der Titelleiste, Abstand Text zu ⋮
>= 8 px, ⋮ und ✕ oben auf (elementFromPoint), Menü öffnet unter ⋮.
Kurzer Name: Kopf 77 px (kompakt 57 px, je ±0,5 px; mit Kopffarbe ohne
Unterlinie 76 bzw. 56 px), Menü 64 px unter der Oberkante. Kompakt: kein
Untertitel.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT = ROOT / ".test-storage" / "n3"

SHORT_NAME = "KI-Berater"
LONG_NAME = "KI-Berater der Volkshochschule Rhein-Sieg-Kreis und Umgebung"
LONG_SUBTITLE = "durchsucht über 1.243 Kurse in Bonn, Siegburg und Troisdorf"
NAME = {
    "kurz": SHORT_NAME,
    "kurz-ohne": SHORT_NAME,
    "standard": LONG_NAME,
    "standard-en": LONG_NAME,
    "eigen": LONG_NAME,
    "kurz-rand": SHORT_NAME,
    "kurz-glas": SHORT_NAME,
}
SUBTITLE = {
    "kurz": "Online-Berater mit künstlicher Intelligenz",
    "kurz-ohne": None,
    "standard": "Online-Berater mit künstlicher Intelligenz",
    "standard-en": "Online advisor powered by artificial intelligence",
    "eigen": LONG_SUBTITLE,
    "kurz-rand": "Online-Berater mit künstlicher Intelligenz",
    "kurz-glas": "Online-Berater mit künstlicher Intelligenz",
}
# Logo-Rahmen mit Rand (Gruppe B, Einbau-Angaben): Kopffarbe, damit der
# Icon-Stil wirkt; mit Kopffarbe entfällt die Unterlinie (W64)
ICON_STYLE = {"kurz-rand": "border", "kurz-glas": "glass"}
HEADER_BG = "#8B1A1A"
TEXTS = tuple(NAME)
MODES = ("chatfenster", "seite", "mobil", "kompakt")
WIDTHS = (360, 390, 420)
# Soll-Höhe mit kurzem Namen (76 bzw. 56 px plus 1 px Unterlinie), W40
SHORT_HEIGHT = {"normal": 77.0, "kompakt": 57.0}
MENU_TOP_SHORT = 64.0
TOL = 0.5
KEYBOARD_HEIGHT = 420

MEASURE = r"""(expect) => {
  const sh = window.__allmShadow;
  const header = sh.querySelector('#anything-llm-header');
  const title = header ? header.firstElementChild : null;
  const sub = sh.querySelector('#anything-llm-header-subtitle');
  const name = header
    ? [...header.querySelectorAll('span')].find((el) => el.textContent === expect.name) || null
    : null;
  const menu = sh.querySelector('button[aria-label="Optionen"]') || sh.querySelector('button[aria-label="Options"]');
  const close = menu ? menu.nextElementSibling : null;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1),
             bottom: +b.bottom.toFixed(1), width: +b.width.toFixed(1), height: +b.height.toFixed(1) }; };
  const textRect = (el) => { const rg = document.createRange(); rg.selectNodeContents(el);
    const rects = [...rg.getClientRects()];
    const b = rg.getBoundingClientRect();
    const tops = new Set(rects.map((x) => Math.round(x.top)));
    return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), lines: tops.size }; };
  const info = (el, full) => {
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const t = textRect(el);
    const h = header.getBoundingClientRect();
    return {
      text: el.textContent, full: el.textContent === full,
      title: el.getAttribute('title'),
      textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace, overflowWrap: cs.overflowWrap,
      wordBreak: cs.wordBreak,
      overflowX: el.scrollWidth > el.clientWidth + 0.5,
      box: r(el), textBox: t, lines: t.lines,
      insideHeader: t.top >= h.top - 0.5 && t.bottom <= h.bottom + 0.5 && t.left >= h.left - 0.5,
      gapToMenu: menu ? +(menu.getBoundingClientRect().left - t.right).toFixed(1) : null,
    };
  };
  const onTop = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    const hit = sh.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && (hit === el || el.contains(hit)); };
  const tcs = title ? getComputedStyle(title) : null;
  return {
    header: r(header),
    title: title ? { box: r(title), boxSizing: tcs.boxSizing, minHeight: tcs.minHeight,
                     paddingTop: tcs.paddingTop, paddingBottom: tcs.paddingBottom,
                     compact: title.className.includes('allm-min-h-[56px]') } : null,
    name: info(name, expect.name),
    subtitle: info(sub, expect.subtitle),
    menu: r(menu), close: r(close), menuOnTop: onTop(menu), closeOnTop: onTop(close),
  };
}"""

MENU = r"""() => {
  const sh = window.__allmShadow;
  const btn = sh.querySelector('button[aria-label="Optionen"]') || sh.querySelector('button[aria-label="Options"]');
  btn.click();
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const items = [...sh.querySelectorAll('button')].filter((b) => /Chat zurücksetzen|Reset chat/.test(b.textContent));
    const menu = items[0] ? items[0].parentElement : null;
    const b = btn.getBoundingClientRect();
    const m = menu ? menu.getBoundingClientRect() : null;
    const hdr = sh.querySelector('#anything-llm-header').getBoundingClientRect();
    res({ menuTop: m ? +(m.top - hdr.top).toFixed(1) : null, buttonBottom: +(b.bottom - hdr.top).toFixed(1),
          belowButton: m ? m.top >= b.bottom - 0.5 : null });
  })));
}"""


def crop_header(page, path):
    box = page.evaluate("""() => { const h = window.__q('#anything-llm-header').getBoundingClientRect();
      return { x: Math.max(0, h.left - 2), y: Math.max(0, h.top - 2), width: h.width + 4, height: h.height + 4 }; }""")
    page.screenshot(path=str(path), clip=box)


def case(b, base, out, label, mode, width, text):
    attrs = {**tv.BASE_ATTRS, "open-on-load": "on"}
    if text == "standard-en":
        attrs["language"] = "en"
    if text in ICON_STYLE:
        attrs.update({"icon-style": ICON_STYLE[text], "header-bg-color": HEADER_BG})
    cfg = {"brandText": NAME[text]}
    if text == "eigen":
        cfg["assistantSubtitle"] = LONG_SUBTITLE
    elif text == "kurz-ohne":
        cfg["assistantSubtitle"] = ""
    page_cfg = {"attrs": attrs}
    if mode == "chatfenster":
        cfg["windowWidth"] = f"{width}px"
        viewport = {"width": 1440, "height": 900}
    elif mode in ("mobil", "kompakt"):
        viewport = {"width": width, "height": 780}
    else:  # seite
        attrs.pop("open-on-load")
        attrs["inline-start-state"] = "expanded"
        cfg["displayMode"] = "inline"  # Gruppe A: nur vom Server (E23)
        page_cfg = {"attrs": attrs, "inline": True, "css": f"#kufer-assistent {{ width: {width}px; }}"}
        viewport = {"width": 1280, "height": 900}
    ctx, page = tv.open_page(b, base, page_cfg, tv.Mock(config=cfg), viewport=viewport)
    tv.wait_shadow(page, "#anything-llm-header")
    tv.wait_shadow(page, 'button[aria-label="Optionen"], button[aria-label="Options"]')
    if SUBTITLE[text]:
        tv.wait_shadow(page, "#anything-llm-header-subtitle")
    tv.settle(page, 800)
    if mode == "kompakt":
        # Bildschirmtastatur: sichtbarer Bereich schrumpft, Breite bleibt
        page.set_viewport_size({"width": width, "height": KEYBOARD_HEIGHT})
        page.wait_for_function(
            "() => { const t = window.__q('#anything-llm-header'); "
            "return !!t && t.firstElementChild.className.includes('allm-min-h-[56px]'); }",
            timeout=5000,
        )
        tv.settle(page, 600)
    m = page.evaluate(MEASURE, {"name": NAME[text], "subtitle": SUBTITLE[text]})
    m["box"] = page.evaluate("""() => { const w = window.__q('#anything-llm-chat');
      return w ? +w.getBoundingClientRect().width.toFixed(1) : null; }""")
    m["logo"] = page.evaluate("""() => { const h = window.__q('#anything-llm-header');
      const f = h && h.firstElementChild && h.firstElementChild.firstElementChild;
      if (!f) return null; const cs = getComputedStyle(f); const r = f.getBoundingClientRect();
      return { height: +r.height.toFixed(1), boxSizing: cs.boxSizing, border: cs.borderTopWidth }; }""")
    stem = f"n3-{label}-{mode}-{width}-{text}"
    crop_header(page, out / f"{stem}-kopf.png")
    if text == "eigen":
        page.screenshot(path=str(out / f"{stem}.png"))
    m["menuOpen"] = page.evaluate(MENU)
    m["warnings"] = [t for k, t in page.console_log if k in ("error", "pageerror")]
    ctx.close()
    return m


def verdict(m, mode, text):
    probs = []
    compact = mode == "kompakt"
    parts = ["name"] if compact or not SUBTITLE[text] else ["name", "subtitle"]
    for part in parts:
        p = m[part]
        if p.get("missing"):
            probs.append(f"{part} fehlt")
            continue
        if not p["full"]:
            probs.append(f"{part} nicht voll")
        if p["textOverflow"] == "ellipsis":
            probs.append(f"{part} ellipsis")
        if p["overflowX"]:
            probs.append(f"{part} überläuft")
        if not p["insideHeader"]:
            probs.append(f"{part} außerhalb des Kopfs")
        if p["gapToMenu"] is None or p["gapToMenu"] < 8:
            probs.append(f"{part} Abstand {p['gapToMenu']}")
    if (compact or not SUBTITLE[text]) and not m["subtitle"].get("missing"):
        probs.append("Untertitel sichtbar" + (" (kompakt, E21)" if compact else ""))
    if compact and not (m["title"] or {}).get("compact"):
        probs.append("Kopf nicht kompakt")
    if not m["menuOnTop"] or not m["closeOnTop"]:
        probs.append("⋮/✕ verdeckt")
    if not m["menuOpen"]["belowButton"]:
        probs.append("Menü über ⋮")
    if text.startswith("kurz"):
        soll = SHORT_HEIGHT["kompakt" if compact else "normal"] - (1 if text in ICON_STYLE else 0)
        ist = m["header"]["height"]
        if abs(ist - soll) > TOL:
            probs.append(f"Kopf {ist} px statt {soll} px (W40)")
        if not compact and abs((m["menuOpen"]["menuTop"] or 0) - MENU_TOP_SHORT) > TOL:
            probs.append(f"Menü bei {m['menuOpen']['menuTop']} px statt {MENU_TOP_SHORT} px")
    return probs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="nachher")
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--no-assert", action="store_true", help="nur messen (Vorher-Stand)")
    ap.add_argument("--only", default="", help="Texte, durch Komma getrennt (z. B. kurz,eigen)")
    ap.add_argument("--modes", default="", help="Modi, durch Komma getrennt")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    texts = [t for t in args.only.split(",") if t] or list(TEXTS)
    modes = [x for x in args.modes.split(",") if x] or list(MODES)
    for t in texts:
        if t not in NAME:
            ap.error(f"unbekannter Text: {t}")
    for x in modes:
        if x not in MODES:
            ap.error(f"unbekannter Modus: {x}")

    res = {}
    srv, base = tv.start_server(args.dist)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for mode in modes:
            for w in WIDTHS:
                for text in texts:
                    m = case(b, base, out, args.label, mode, w, text)
                    m["probleme"] = verdict(m, mode, text)
                    res[f"{mode}-{w}-{text}"] = m
        b.close()
    srv.shutdown()
    (out / f"n3-{args.label}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    bad = 0
    for k, m in res.items():
        n, s = m["name"], m["subtitle"]
        bad += bool(m["probleme"])
        print(f"{k:30s} box={m['box']} kopf={m['header']['height']} logo={(m.get('logo') or {}).get('height')} "
              f"name={n.get('lines')}Z abst={n.get('gapToMenu')} "
              f"unter={'-' if s.get('missing') else str(s.get('lines')) + 'Z'} abst={s.get('gapToMenu')} "
              f"menü={m['menuOpen']['menuTop']} -> {'OK' if not m['probleme'] else '; '.join(m['probleme'])}")
    print(f"{len(res)} Fälle, {bad} mit Problemen ({out / f'n3-{args.label}.json'})")
    sys.exit(1 if bad and not args.no_assert else 0)


if __name__ == "__main__":
    main()
