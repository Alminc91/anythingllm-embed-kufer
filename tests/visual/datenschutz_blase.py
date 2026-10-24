#!/usr/bin/env python3
"""Browser-Prüfung Datenschutz-Blase beim Start (AK-12, Spezifikation
issues/datenschutz-fusszeile.md, Nutzer 24.10.2026 „Option Blase beim
Start“, D1 bis D4; Auftrag issues/datenschutz-fusszeile/auftrag-ak12-blase.md
Vertrag 3 bis 5).

Gebautes dist, lokale Testseite (tests/visual/fixtures/widget.html), Server
gemockt (theme_visual.Mock, Aufbau wie datenschutz_fenster.py). Je Ansicht
(Chatfenster 1280 und 1440, In der Seite aufgeklappt 1440, mobil 390 als
Chatfenster und als Vollbild In der Seite), hell und dunkel, deutsch und
englisch, Blase an (Server liefert privacyStartBubble true) und aus:

  - an: Datenschutz-Blase direkt unter der Begrüßungsblase, gleiche Fläche,
    Schrift, Schriftgröße, Zeilenhöhe, Innenabstand, Rundung und Schatten
    wie die Begrüßung, gleiche linke Kante, Avatar neben der letzten Blase;
    Überschrift fett („Datenschutz“/„Privacy“), Standardpunkte, kein Punkt
    „Hinweis zur KI“, Link „Datenschutzerklärung“/„Privacy statement“ mit
    target _blank und rel noopener noreferrer; Kontrast Text und Link zur
    Fläche mindestens 4,5:1; Startvorschläge darunter; die Begrüßung steht
    beim Öffnen ganz im Bild; kein waagerechter Bildlauf
  - an und aus: Fußzeile eine Zeile mit dem Link „Datenschutz“
    (disclaimer_measure.verdict), Platzhalter einzeilig und ganz im Feld
    (fensterbreite.PROBE_JS), keine Fehler in der Konsole
  - aus: keine Datenschutz-Blase
Einmalig (deutsch, hell, Chatfenster 1440): nach der ersten Frage bleibt die
Blase mit der Begrüßung oben stehen, die Vorschläge sind weg, der Link
„Datenschutz“ öffnet das Fenster wie bisher; data-privacy-start-bubble am
Skript und ein Altwert privacyNotice „bubble“ vom Server schalten keine
Blase ein; HTML in Überschrift und Text erscheint als Text (NAK-1); ein
javascript:-Link wird nicht verlinkt (NAK-3).

Aufruf (aus dem Repo, npm run build vorher):

  python3 tests/visual/datenschutz_blase.py [--dist dist] [--tag neu] [--lang de en] [--themes light dark] [--views …]

Ergebnis: .test-storage/datenschutz-blase-<tag>.json, Bilder
.test-storage/blase-<tag>-<lang>-<ansicht>-<theme>-<an|aus>.png und
blase-<tag>-verlauf.png, Zeilen auf stdout, Ausstieg 1 bei Fehlern oder
ohne ein einziges Ergebnis.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import disclaimer_measure as dm  # noqa: E402
import fensterbreite as fb  # noqa: E402
import datenschutz_fenster as df  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
OUT_DIR = ROOT / ".test-storage"
RESULTS = []
TAG = "neu"

VIEWS = [
    ("fenster-1280", "bubble", 1280, 800),
    ("fenster-1440", "bubble", 1440, 900),
    ("seite-1440", "inline", 1440, 900),
    ("mobil-fenster-390", "bubble", 390, 800),
    ("mobil-seite-390", "inline", 390, 800),
]
ON = {"privacyStartBubble": True}
TEXTS = {
    "de": {
        "title": "Datenschutz",
        "ai": "Hinweis zur KI",
        "link": "Datenschutzerklärung",
        "points": [
            "Ihre Anfragen bleiben auf Servern in Deutschland und werden nicht an Dritte weitergegeben.",
            "Mitarbeiter der Einrichtung können Gespräche zur Qualitätssicherung einsehen.",
            "Bitte teilen Sie nur Angaben, die für Ihre Anfrage nötig sind.",
        ],
    },
    "en": {
        "title": "Privacy",
        "ai": "About the AI",
        "link": "Privacy statement",
        "points": [
            "Your requests stay on servers in Germany and are not passed on to third parties.",
            "Staff of the institution may view conversations for quality assurance.",
            "Please only share information that is necessary for your request.",
        ],
    },
}
STYLE_PROPS = ["backgroundColor", "color", "fontSize", "lineHeight", "fontFamily", "paddingTop",
               "paddingRight", "paddingBottom", "paddingLeft", "borderTopLeftRadius",
               "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius", "boxShadow"]


def record(key, ok, detail):
    RESULTS.append({"key": key, "ok": bool(ok), "detail": detail})
    print(f"[{'OK ' if ok else 'FAIL'}] {key}: {detail}", flush=True)


BUBBLE_JS = r"""
(props) => {
  const q = window.__q;
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10,
      w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10,
      bottom: Math.round(b.bottom * 10) / 10, right: Math.round(b.right * 10) / 10 }; };
  const pick = (e) => { const c = getComputedStyle(e); const o = {}; for (const p of props) o[p] = c[p]; return o; };
  const g = q('#anything-llm-greeting-bubble');
  const p = q('#anything-llm-privacy-bubble');
  const hist = q('#chat-history') || (g && g.closest('.allm-overflow-y-auto'));
  const scroller = g ? g.closest('.allm-overflow-y-auto') : null;
  const pills = q('#anything-llm-suggestion-pills');
  const welcome = q('#anything-llm-panel-welcome');
  const avatar = welcome ? welcome.querySelector('img') : null;
  const out = {
    greeting: g ? { rect: r(g), style: pick(g) } : null,
    bubble: null,
    pills: pills ? r(pills) : null,
    avatar: avatar ? r(avatar) : null,
    scroller: scroller ? { rect: r(scroller), sw: scroller.scrollWidth, cw: scroller.clientWidth } : null,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    nextOfGreeting: g && g.nextElementSibling ? g.nextElementSibling.id : null,
  };
  if (p) {
    const strong = p.querySelector('strong');
    const a = p.querySelector('a');
    out.bubble = {
      rect: r(p), style: pick(p), text: p.textContent,
      tags: [...p.children].map((e) => e.tagName),
      title: strong ? { text: strong.textContent, weight: getComputedStyle(strong).fontWeight } : null,
      items: [...p.querySelectorAll('li')].map((l) => l.textContent),
      html: p.querySelectorAll('img, script, b, iframe').length,
      link: a ? { text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'),
        rel: a.getAttribute('rel'), color: getComputedStyle(a).color,
        decoration: getComputedStyle(a).textDecorationLine } : null,
    };
  }
  return out;
}
"""


def contrast_of(fg, bg):
    return df.contrast_of(fg, bg)


def check_view(browser, base_url, name, display, width, height, theme, lang, on):
    tag = f"{lang} {name} {theme} {'an' if on else 'aus'}"
    ctx, page = df.open_view(browser, base_url, display, width, height, theme, lang, config=ON if on else {})
    try:
        tv.wait_shadow(page, "#anything-llm-greeting-bubble")
        tv.settle(page, 500)
        st = page.evaluate(BUBBLE_JS, STYLE_PROPS)
        shot = OUT_DIR / f"blase-{TAG}-{lang}-{name}-{theme}-{'an' if on else 'aus'}.png"
        page.screenshot(path=str(shot))
        b, g = st["bubble"], st["greeting"]
        if not on:
            record(f"AK-1 ohne Schalter keine Datenschutz-Blase ({tag})", b is None and g is not None,
                   {"blase": b is not None, "next": st["nextOfGreeting"]})
        else:
            t = TEXTS[lang]
            record(f"D4 Blase direkt unter der Begrüßung ({tag})",
                   b is not None and st["nextOfGreeting"] == "anything-llm-privacy-bubble"
                   and abs(b["rect"]["x"] - g["rect"]["x"]) <= 0.5 and b["rect"]["y"] >= g["rect"]["bottom"],
                   {"greeting": g and g["rect"], "blase": b and b["rect"], "next": st["nextOfGreeting"]})
            if b is None:
                return
            diff = {k: (g["style"][k], b["style"][k]) for k in STYLE_PROPS if g["style"][k] != b["style"][k]}
            record(f"D4 Optik wie die Begrüßung (Fläche, Schrift, Abstände, Rundung, Schatten) ({tag})",
                   not diff, diff or {k: b["style"][k] for k in ("backgroundColor", "color", "fontSize", "lineHeight", "paddingTop")})
            av = st["avatar"]
            record(f"D4 Avatar neben der letzten Blase ({tag})",
                   av is not None and abs(av["bottom"] + 2 - b["rect"]["bottom"]) <= 1.5 and av["right"] < b["rect"]["x"],
                   {"avatar": av, "blase": b["rect"]})
            link = b["link"] or {}
            record(f"Vertrag 4 Inhalt: Überschrift fett, Punkte, Link, ohne KI-Punkt ({tag})",
                   (b["title"] or {}).get("text") == t["title"] and int((b["title"] or {}).get("weight", 0)) >= 700
                   and b["items"] == t["points"] and t["ai"] not in b["text"]
                   and link.get("text") == t["link"] and link.get("href") == df.CONFIG["privacyUrl"]
                   and link.get("target") == "_blank" and link.get("rel") == "noopener noreferrer"
                   and "underline" in (link.get("decoration") or "") and b["tags"][0] == "STRONG",
                   {"title": b["title"], "items": len(b["items"]), "link": link, "tags": b["tags"]})
            text_ratio = contrast_of(b["style"]["color"], b["style"]["backgroundColor"])
            link_ratio = contrast_of(link.get("color", "rgb(0,0,0)"), b["style"]["backgroundColor"])
            record(f"Kontrast Text und Link zur Fläche ≥ 4,5:1 ({tag})", text_ratio >= 4.5 and link_ratio >= 4.5,
                   {"text": text_ratio, "link": link_ratio})
            pills = st["pills"]
            sc = st["scroller"] or {}
            record(f"Startvorschläge unter der Blase, Begrüßung beim Öffnen im Bild ({tag})",
                   pills is not None and pills["y"] >= b["rect"]["bottom"]
                   and g["rect"]["y"] >= (sc.get("rect") or {}).get("y", 0) - 0.5,
                   {"pills": pills, "blase_unten": b["rect"]["bottom"], "greeting_oben": g["rect"]["y"],
                    "verlauf_oben": (sc.get("rect") or {}).get("y")})
        sc = st["scroller"] or {}
        record(f"kein waagerechter Bildlauf ({tag})",
               not st["hScroll"] and sc.get("sw", 0) <= sc.get("cw", 0) + 0.5,
               {"seite": st["hScroll"], "verlauf": [sc.get("sw"), sc.get("cw")]})
        footer = page.evaluate(dm.MEASURE_JS, [])
        foot = dm.verdict(footer, width)
        probe = page.evaluate(fb.PROBE_JS) or {}
        placeholder_ok = (probe.get("placeholder") == fb.PLACEHOLDER[lang]
                          and probe.get("textWidth", 1e9) <= probe.get("inner", 0) + 0.5
                          and probe.get("scrollHeight", 1e9) <= probe.get("clientHeight", 0))
        record(f"Fußzeile eine Zeile mit Link, Platzhalter einzeilig ({tag})", foot["ok"] and placeholder_ok,
               {"fusszeile": foot["why"] or {k: footer.get(k) for k in ("fontSize", "lines", "truncated")},
                "platzhalter": {k: probe.get(k) for k in ("textWidth", "inner", "scrollHeight", "clientHeight")}})
        errs = tv.errors_of(page)
        record(f"keine Fehler in der Konsole ({tag})", not errs, errs[:3])
    finally:
        ctx.close()


def check_once(browser, base_url):
    # nach der ersten Frage: Blase bleibt mit der Begrüßung oben stehen
    stream = [{"uuid": "u-1", "type": "textResponseChunk", "close": True, "sources": [],
               "textResponse": "Ja, montags um 18 Uhr."}]
    mock = tv.Mock(config={**df.CONFIG, **ON}, stream=stream)
    ctx, page = df.open_view(browser, base_url, "bubble", 1440, 900, "light", "de", mock=mock)
    try:
        tv.wait_shadow(page, "#anything-llm-suggestion-pills button")
        page.evaluate("() => window.__q('#anything-llm-suggestion-pills button').click()")
        page.wait_for_timeout(1200)
        st = page.evaluate(r"""() => {
          const list = window.__q('#chat-history').firstElementChild;
          const first = list.firstElementChild;
          return { first: first.id, persistent: first.hasAttribute('data-persistent'),
            blase: !!first.querySelector('#anything-llm-privacy-bubble'),
            greeting: !!first.querySelector('#anything-llm-greeting-bubble'),
            count: window.__allmShadow.querySelectorAll('#anything-llm-privacy-bubble').length,
            pills: !!window.__q('#anything-llm-suggestion-pills'),
            next: first.nextElementSibling ? first.nextElementSibling.textContent.slice(0, 40) : null };
        }""")
        page.screenshot(path=str(OUT_DIR / f"blase-{TAG}-verlauf.png"))
        record("Vertrag 4 im Verlauf: Blase mit der Begrüßung oben, Vorschläge weg",
               st["first"] == "anything-llm-panel-welcome" and st["persistent"] and st["blase"] and st["greeting"]
               and st["count"] == 1 and not st["pills"] and "Gibt es Yoga?" in (st["next"] or ""), st)
        df.click_link(page)
        d = df.state(page).get("dialog") or {}
        record("Vertrag 5 Link „Datenschutz“ öffnet das Fenster wie bisher (mit KI-Punkt)",
               d.get("role") == "dialog" and d.get("modal") == "true" and "Hinweis zur KI" in (d.get("text") or ""),
               {"title": d.get("title"), "modal": d.get("modal")})
        page.screenshot(path=str(OUT_DIR / f"blase-{TAG}-verlauf-fenster.png"))
    finally:
        ctx.close()

    # Einbau-Angabe und Altwert schalten keine Blase ein
    for label, cfg_extra, script_attrs, config in [
        ("data-privacy-start-bubble=\"true\" am Skript", {"privacy-start-bubble": "true"}, True, {}),
        ("Altwert privacyNotice „bubble“ vom Server", {}, False, {"privacyNotice": "bubble"}),
        ("Server liefert \"true\" als Text", {}, False, {"privacyStartBubble": "true"}),
    ]:
        attrs = {**tv.BASE_ATTRS, "language": "de", "open-on-load": "on", **cfg_extra}
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "script_attrs": script_attrs},
                                 mock=tv.Mock(config={**df.CONFIG, **config}),
                                 viewport={"width": 1440, "height": 900})
        try:
            tv.wait_shadow(page, "#anything-llm-greeting-bubble")
            tv.settle(page, 400)
            has = page.evaluate("() => !!window.__q('#anything-llm-privacy-bubble')")
            warned = [t for (_, t) in page.console_log if "data-privacy-start-bubble wirkt nicht" in t]
            ok = not has and (bool(warned) if script_attrs else True)
            record(f"Vertrag 3 keine Blase: {label}", ok, {"blase": has, "warnzeile": warned[:1]})
        finally:
            ctx.close()

    # NAK-1 und NAK-3 in der Blase
    config = {**ON, "privacyTitle": "<img src=x onerror=\"window.__xss=1\">Titel",
              "privacyText": "• <b>fett</b><img src=x onerror=\"window.__xss=2\">\n• zweiter Punkt",
              "privacyUrl": "javascript:window.__xss=3"}
    ctx, page = df.open_view(browser, base_url, "bubble", 1440, 900, "light", "de", config=config)
    try:
        tv.wait_shadow(page, "#anything-llm-privacy-bubble")
        st = page.evaluate(BUBBLE_JS, STYLE_PROPS)
        xss = page.evaluate("() => window.__xss || null")
        b = st["bubble"] or {}
        record("NAK-1 HTML in Überschrift und Text als Text, NAK-3 javascript: nicht verlinkt",
               b.get("html") == 0 and (b.get("title") or {}).get("text", "").startswith("<img")
               and b.get("link") is None and xss is None,
               {"html": b.get("html"), "title": b.get("title"), "link": b.get("link"), "xss": xss})
        page.screenshot(path=str(OUT_DIR / f"blase-{TAG}-nak.png"))
    finally:
        ctx.close()


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=str(ROOT / "dist"))
    ap.add_argument("--tag", default="neu")
    ap.add_argument("--lang", nargs="+", default=["de", "en"])
    ap.add_argument("--themes", nargs="+", default=["light", "dark"])
    ap.add_argument("--views", nargs="+", default=[v[0] for v in VIEWS])
    ap.add_argument("--skip-once", action="store_true")
    return ap.parse_args()


def main():
    global TAG
    args = parse_args()
    TAG = args.tag
    OUT_DIR.mkdir(exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in args.lang:
            for name, display, width, height in VIEWS:
                if name not in args.views:
                    continue
                for theme in args.themes:
                    for on in (True, False):
                        try:
                            check_view(browser, base_url, name, display, width, height, theme, lang, on)
                        except Exception as e:  # weiter prüfen, Fehler festhalten
                            record(f"Ablauf {lang} {name} {theme} {'an' if on else 'aus'}", False,
                                   str(e).splitlines()[0])
        if not args.skip_once:
            try:
                check_once(browser, base_url)
            except Exception as e:
                record("Ablauf einmalige Prüfungen", False, str(e).splitlines()[0])
        browser.close()
    srv.shutdown()
    out = OUT_DIR / f"datenschutz-blase-{args.tag}.json"
    out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"{len(RESULTS) - len(bad)}/{len(RESULTS)} ok -> {out}")
    if not RESULTS:
        print("nichts gemessen (keine Ansicht gewählt)")
    sys.exit(1 if bad or not RESULTS else 0)


if __name__ == "__main__":
    main()
