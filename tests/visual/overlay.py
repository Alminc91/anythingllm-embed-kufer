#!/usr/bin/env python3
"""Playwright-Tests: Inline-Box schwebend über dem Inhalt (data-inline-layout
/ visual_config.inlineLayout) und Aufklapp-Effekt (data-inline-effect).

Einrichtung wie tests/visual/theme_visual.py (requirements.txt + chromium).

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenzen der Bestandszustände vom UNVERÄNDERTEN Build (main cc5276b),
  #    nur fehlende Dateien, bestehende werden nie überschrieben
  python3 tests/visual/overlay.py --baseline --dist /pfad/zum/alten/dist

  # 2) Referenzen der NEUEN Zustände (gibt es auf main nicht) aus diesem Branch
  python3 tests/visual/overlay.py --baseline --new-states

  # 3) Prüfen (npm run build vorher)
  python3 tests/visual/overlay.py

Alle Aufrufe an praesentation werden gemockt (Config, Status, Verlauf). Die
Testseite (fixtures/widget.html) bekommt per Script Inhalt unter dem
Platzhalter: ein Element 40 px darunter (#below), Links, Kacheln, Abstand zum
Scrollen. Ergebnisse: tests/visual/results/overlay-*.png, summary-overlay.json.
"""

import argparse
import json
import re
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402  (Infrastruktur: Server, Mock, Shadow-Zugriff)
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BASELINE_DIR = tv.BASELINE_DIR
RESULTS_DIR = tv.RESULTS_DIR
record = tv.record

INLINE = {**tv.BASE_ATTRS, "display-mode": "inline"}
OVERLAY = {**INLINE, "inline-layout": "overlay"}
FLOAT = {**OVERLAY, "inline-effect": "float"}
INPUT = {
    "inline-input": "true",
    "inline-input-placeholder": "Stellen Sie hier Ihre Frage …",
    "inline-send-text": "Chatten",
    "default-messages": "Spanisch A1,Yoga,KI-Basics,Töpfern",
}
CFG_NO_MSGS = {k: v for k, v in tv.PRAES_CONFIG.items() if k != "defaultMessages"}
EFFECTS = ["expand", "grow", "spring", "float"]

# Inhalt der Kundenseite unter dem Platzhalter (vor dem Aufklappen eingefügt)
PAGE_JS = r"""
() => {
  if (document.getElementById('below')) return;
  const slot = document.getElementById('slot');
  const top = document.createElement('p');
  top.innerHTML = '<a id="link-out" href="#ziel-out">Seitenlink oberhalb</a>';
  document.getElementById('sibling').before(top);
  const link = document.getElementById('link-out');
  window.__linkClicks = 0;
  link.addEventListener('click', () => { window.__linkClicks += 1; });
  // Seiten-Script, das pointerdown nicht weiterreicht (Kollisionstest NAK-2)
  link.addEventListener('pointerdown', (e) => e.stopPropagation());
  const after = document.createElement('div');
  after.innerHTML =
    '<div id="below" style="margin-top:40px;height:40px;background:#cfe3ff;padding:8px">Element 40 px unter dem Platzhalter</div>' +
    '<p>Beliebt gerade: <a href="#a">Spanisch A1</a> · <a href="#b">Yoga</a> · <a href="#c">Töpfern</a></p>' +
    '<div id="tiles" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:12px">' +
    Array.from({length: 6}, (_, i) => `<div style="height:90px;background:#fff;border:1px solid #ccc;padding:8px">Fachbereich ${i + 1}</div>`).join('') +
    '</div><div style="height:1400px"></div>';
  slot.after(after);
}
"""

# Rechtecke für die Messungen
GEOM_JS = r"""
() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, dy: b.y + scrollY }; };
  const win = window.__q('#anything-llm-chat');
  return {
    below: r(document.getElementById('below')),
    mount: r(document.getElementById('kufer-assistent')),
    root: r(window.__q('#anything-llm-embed-inline')),
    chat: r(win),
    boxPos: win ? getComputedStyle(win.parentElement).position : null,
    chatPos: win ? getComputedStyle(win).position : null,
    open: !!win && win.getBoundingClientRect().height > 0,
    expandedAttr: document.getElementById('kufer-assistent').getAttribute('data-allm-expanded'),
    hostParent: (() => { const h = document.getElementById('anythingllm-embed-widget'); return h.parentElement.id || h.parentElement.tagName; })(),
    cls: win ? win.className : null,
  };
}
"""


def active_id(page):
    return page.evaluate(
        "() => { const a = window.__allmShadow && window.__allmShadow.activeElement; return a ? a.id || a.tagName : null; }")


def host_focused(page):
    return page.evaluate("() => document.activeElement === document.getElementById('anythingllm-embed-widget')")


def geom(page):
    return page.evaluate(GEOM_JS)


def ready(page, sel="#anything-llm-inline-bar"):
    tv.wait_shadow(page, sel)
    page.evaluate(PAGE_JS)
    tv.settle(page, 300)


def click_bar(page, sel="#anything-llm-inline-bar"):
    """Echter Mausklick (pointerdown/mousedown/click) auf die Leiste."""
    x, y = page.evaluate(
        "(s) => { const r = window.__q(s).getBoundingClientRect(); return [r.x + 24, r.y + r.height / 2]; }", sel)
    page.mouse.click(x, y)


def wait_open(page):
    page.wait_for_function(
        "() => { const w = window.__q('#anything-llm-chat'); return !!w && w.getBoundingClientRect().height > 0; }",
        timeout=10000)


def blur_widget(page):
    page.evaluate("() => window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur()")


def open_settled(page, sel="#anything-llm-inline-bar", wait_sel=None):
    click_bar(page, sel)
    wait_open(page)
    if wait_sel:
        tv.wait_shadow(page, wait_sel)
    tv.settle(page)


# ---------------------------------------------------------------------------
# Pixel-Zustände
# ---------------------------------------------------------------------------
# (name, attrs, cfg-extra, mock, viewport, origin)
#   "main": Referenz vom unveränderten Build (AK-1 default-unchanged)
#   "new":  neuer Zustand, Referenz aus diesem Branch (Regressionsschutz)
def pixel_cases():
    hist = tv.HISTORY_ANSWER
    return [
        ("ov-default-open", INLINE, {}, lambda: tv.Mock(history=hist), None, "main"),
        ("ov-default-open-input", {**INLINE, **INPUT}, {}, lambda: tv.Mock(config=CFG_NO_MSGS, history=hist),
         None, "main"),
        ("ov-default-open-dark", {**INLINE, "theme": "dark"}, {}, lambda: tv.Mock(history=hist), None, "main"),
        ("ov-float-open", FLOAT, {}, lambda: tv.Mock(history=hist), None, "new"),
        ("ov-float-open-input", {**FLOAT, **INPUT}, {}, lambda: tv.Mock(config=CFG_NO_MSGS, history=hist),
         None, "new"),
        ("ov-float-open-dark", {**FLOAT, "theme": "dark"}, {}, lambda: tv.Mock(history=hist), None, "new"),
    ]


def shoot(browser, base_url, case, out_path):
    name, attrs, extra, mk, viewport, _ = case
    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, **extra}, mk(), viewport=viewport)
    try:
        sel = "#anything-llm-inline-input" if attrs.get("inline-input") else "#anything-llm-inline-bar"
        ready(page, sel)
        open_settled(page, "#anything-llm-inline-bar" if not attrs.get("inline-input") else "#anything-llm-inline-send",
                     ".allm-anything-llm-assistant-message a")
        blur_widget(page)
        page.mouse.move(0, 0) if not attrs.get("inline-layout") else page.mouse.move(990, 690)
        page.wait_for_timeout(100)
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return tv.errors_of(page)
    finally:
        ctx.close()


def run_pixel(browser, base_url, baseline, new_states, only=None):
    for case in pixel_cases():
        name, origin = case[0], case[5]
        if only and name not in only:
            continue
        if baseline:
            if (origin == "new") != new_states:
                continue
            out = BASELINE_DIR / f"{name}.png"
            if out.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            errs = shoot(browser, base_url, case, out)
            print(f"[BASE] {name} -> {out.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        out = RESULTS_DIR / f"overlay-{name}.png"
        errs = shoot(browser, base_url, case, out)
        ref = BASELINE_DIR / f"{name}.png"
        if not ref.exists():
            record(f"PIX {name}", False, "keine Referenz (erst --baseline laufen lassen)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"overlay-{name}.diff.png")
        key = "AK-1 default-unchanged" if origin == "main" else "REG"
        record(f"{key} {name}", ratio <= tv.MAX_DIFF_RATIO and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""))


# ---------------------------------------------------------------------------
# AK-1: Standard verschiebt den Inhalt wie bisher (Messung)
# ---------------------------------------------------------------------------
def check_default_shift(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": INLINE, "inline": True}, tv.Mock())
    try:
        ready(page)
        before = geom(page)
        open_settled(page)
        after = geom(page)
        shift = after["below"]["dy"] - before["below"]["dy"]
        grow = after["root"]["h"] - before["root"]["h"]
        ok = (after["boxPos"] == "relative" and abs(shift - grow) <= 1 and shift > 300
              and "allm-effect" not in after["cls"])
        record("AK-1 default-unchanged Inhalt verschoben", ok,
               f"Box {after['boxPos']}, #below +{shift:.0f} px (Inline-Fläche +{grow:.0f} px), Effekt-Klasse: "
               f"{'keine' if 'allm-effect' not in after['cls'] else after['cls']}")
        # Außenklick klappt im Seitenfluss NICHT ein (wie bisher)
        page.mouse.click(900, 650)
        page.wait_for_timeout(200)
        record("AK-1 default-unchanged Außenklick ohne Wirkung", geom(page)["open"], "Box bleibt offen")
    finally:
        ctx.close()


def check_default_no_animation(browser, base_url):
    """Entscheidung A: ohne ausdrückliche Wahl (flow) keine Animation — die Box
    steht im ersten Frame vollständig da (verhaltensgleich zu main)."""
    ctx, page = tv.open_page(browser, base_url, {"attrs": INLINE, "inline": True}, tv.Mock())
    try:
        ready(page)
        click_bar(page)
        s = page.evaluate(
            "() => { const w = window.__q('#anything-llm-chat'); const c = getComputedStyle(w); return { n: w.getAnimations().length, name: c.animationName, tf: c.transform, op: c.opacity, cls: w.className }; }")
        ok = s["n"] == 0 and s["name"] == "none" and s["tf"] == "none" and s["op"] == "1" and "allm-effect" not in s["cls"]
        record("AK-1 default-unchanged ohne Animation (sofort aufgeklappt)", ok,
               f"laufende Animationen {s['n']}, animation-name {s['name']}, transform {s['tf']}, opacity {s['op']}")
    finally:
        ctx.close()
    # overlay ohne Effekt-Angabe -> expand
    ctx, page = tv.open_page(browser, base_url, {"attrs": OVERLAY, "inline": True}, tv.Mock())
    try:
        ready(page)
        click_bar(page)
        s = page.evaluate("() => { const w = window.__q('#anything-llm-chat'); return [getComputedStyle(w).animationName, w.getAnimations().length]; }")
        record("overlay ohne data-inline-effect -> expand", s[0] == "allm-fx-expand" and s[1] == 1,
               f"animation-name {s[0]}, laufende Animationen {s[1]}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# AK-2: Overlay verschiebt nichts
# ---------------------------------------------------------------------------
def check_ak2(browser, base_url):
    for label, attrs in (("float", FLOAT), ("expand", OVERLAY), ("input+float", {**FLOAT, **INPUT})):
        mk = tv.Mock(config=CFG_NO_MSGS) if "inline-input" in attrs else tv.Mock()
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True}, mk)
        try:
            sel = "#anything-llm-inline-input" if "inline-input" in attrs else "#anything-llm-inline-bar"
            ready(page, sel)
            before = geom(page)
            gap = before["below"]["y"] - before["mount"]["bottom"]
            open_settled(page, "#anything-llm-inline-send" if "inline-input" in attrs else "#anything-llm-inline-bar")
            after = geom(page)
            dy = after["below"]["dy"] - before["below"]["dy"]
            dm = after["mount"]["h"] - before["mount"]["h"]
            cx = after["below"]["x"] + after["below"]["w"] / 2
            cy = after["below"]["y"] + after["below"]["h"] / 2
            on_top = page.evaluate(
                "([x, y]) => document.elementFromPoint(x, y) === document.getElementById('anythingllm-embed-widget')",
                [cx, cy])
            overlaps = after["chat"]["bottom"] > after["below"]["y"] + after["below"]["h"]
            ok = abs(dy) <= 1 and abs(dm) <= 1 and on_top and overlaps and after["boxPos"] == "absolute"
            record(f"AK-2 Overlay verschiebt nichts ({label})", ok,
                   f"Abstand #below–Platzhalter {gap:.0f} px; #below top (Dokument) {before['below']['dy']:.1f} -> "
                   f"{after['below']['dy']:.1f} (Δ {dy:+.1f} px), Platzhalter-Höhe Δ {dm:+.1f} px, "
                   f"Box {after['boxPos']} {after['chat']['w']:.0f}×{after['chat']['h']:.0f}, überlappt: {overlaps}, "
                   f"elementFromPoint(#below) = Widget: {on_top}")
            # Breite = Inline-Fläche (Platzhalter)
            record(f"AK-2 Breite = Platzhalter ({label})", abs(after["chat"]["w"] - after["mount"]["w"]) <= 1,
                   f"Box {after['chat']['w']:.0f} px, Platzhalter {after['mount']['w']:.0f} px")
        finally:
            ctx.close()
    # Seite verbreitert den Platzhalter beim Aufklappen (Signal data-allm-expanded,
    # wie demo.ki.kufer.de 600 -> 760 px): Chips brechen anders um, die
    # unsichtbare Leiste hält trotzdem ihre Höhe -> nichts rückt nach
    widen = ("#kufer-assistent { width: 420px; } "
             "#kufer-assistent[data-allm-expanded] { width: 680px; }")
    attrs = {**FLOAT, **INPUT, "default-messages": "Welche Sprachkurse gibt es am Abend?,"
             "Voraussetzungen für einen Integrationskurs?,Yoga für Anfänger"}
    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, "css": widen},
                             tv.Mock(config=CFG_NO_MSGS))
    try:
        ready(page, "#anything-llm-inline-input")
        before = geom(page)
        open_settled(page, "#anything-llm-inline-send")
        after = geom(page)
        dy = after["below"]["dy"] - before["below"]["dy"]
        bar_h = page.evaluate(
            "() => { const w = window.__q('#anything-llm-inline-input-bar'); return w ? w.parentElement.getBoundingClientRect().height : null; }")
        chips_h = page.evaluate(
            "() => window.__q('#anything-llm-inline-chips').getBoundingClientRect().height")
        record("AK-2 Platzhalter verbreitert sich beim Aufklappen (Seiten-CSS)",
               abs(dy) <= 1 and after["mount"]["w"] == 680 and abs(after["chat"]["w"] - 680) <= 1,
               f"Platzhalter {before['mount']['w']:.0f} -> {after['mount']['w']:.0f} px, Höhe "
               f"{before['mount']['h']:.0f} -> {after['mount']['h']:.0f} px (unsichtbare Leiste {bar_h:.0f} px, "
               f"Chips jetzt {chips_h:.0f} px hoch), #below Δ {dy:+.1f} px")
    finally:
        ctx.close()
    # inlineMaxWidth: Breite = inlineMaxWidth, zentriert
    ctx, page = tv.open_page(browser, base_url,
                             {"attrs": {**FLOAT, "inline-max-width": "520"}, "inline": True}, tv.Mock())
    try:
        ready(page)
        open_settled(page)
        g = geom(page)
        centered = abs((g["chat"]["x"] - g["mount"]["x"]) - (g["mount"]["x"] + g["mount"]["w"] - g["chat"]["x"] - g["chat"]["w"])) <= 1
        record("AK-2 Breite = inlineMaxWidth", abs(g["chat"]["w"] - 520) <= 1 and centered,
               f"Box {g['chat']['w']:.0f} px (inlineMaxWidth 520), zentriert: {centered}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# AK-3: Außenklick und Escape schließen, Verlauf bleibt, Fokus auf der Leiste
# ---------------------------------------------------------------------------
def check_ak3(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock(history=tv.HISTORY_ANSWER))
    try:
        ready(page)
        open_settled(page, wait_sel=".allm-anything-llm-assistant-message a")
        attr_open = geom(page)["expandedAttr"]
        # Außenklick auf eine leere Stelle der Seite (rechts neben dem Inhalt)
        page.mouse.click(930, 120)
        page.wait_for_timeout(150)
        g = geom(page)
        fid, hf = active_id(page), host_focused(page)
        record("AK-3 Außenklick schließt, Fokus auf der Leiste", not g["open"] and fid == "anything-llm-inline-bar" and hf,
               f"offen={g['open']}, Fokus={fid} (Host aktiv: {hf}), data-allm-expanded offen={attr_open} / zu={g['expandedAttr']}")
        click_bar(page)
        wait_open(page)
        tv.settle(page, 400)
        msgs = page.evaluate("() => window.__allmShadow.querySelectorAll('.allm-anything-llm-assistant-message').length")
        record("AK-3 Verlauf bleibt erhalten", msgs >= 1, f"Antworten nach erneutem Öffnen: {msgs}")
        # Escape mit Fokus im Widget (Eingabefeld)
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        g = geom(page)
        fid = active_id(page)
        record("AK-3 Escape (Fokus im Widget) schließt, Fokus auf der Leiste",
               not g["open"] and fid == "anything-llm-inline-bar", f"offen={g['open']}, Fokus={fid}")
        # Escape mit Fokus auf der Seite (z. B. nach Klick auf Text in der Box)
        click_bar(page)
        wait_open(page)
        page.evaluate("() => { window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur(); document.body.focus(); }")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        g = geom(page)
        fid = active_id(page)
        record("AK-3 Escape (Fokus auf der Seite) schließt, Fokus auf der Leiste",
               not g["open"] and fid == "anything-llm-inline-bar", f"offen={g['open']}, Fokus={fid}")
        # Klick IN die Box klappt nicht ein
        click_bar(page)
        wait_open(page)
        tv.settle(page, 400)
        c = geom(page)["chat"]
        page.mouse.click(c["x"] + c["w"] / 2, c["y"] + c["h"] / 2)
        page.wait_for_timeout(150)
        record("AK-3 Klick in die Box schließt nicht", geom(page)["open"], "Box bleibt offen")
        # Außenklick auf ein Eingabefeld der Seite: Fokus bleibt dort
        page.evaluate("() => { const i = document.createElement('input'); i.id = 'page-input'; i.style.cssText = 'position:fixed;left:820px;top:40px;width:150px'; document.body.appendChild(i); }")
        ix, iy = page.evaluate("() => { const r = document.getElementById('page-input').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; }")
        page.mouse.click(ix, iy)
        page.wait_for_timeout(150)
        pid = page.evaluate("() => document.activeElement && document.activeElement.id")
        record("AK-3 Außenklick in ein Seitenfeld: Fokus bleibt im Feld", not geom(page)["open"] and pid == "page-input",
               f"offen={geom(page)['open']}, document.activeElement=#{pid}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# AK-4: vier Effekte unterscheidbar (computed animation + Zwischenstand)
# ---------------------------------------------------------------------------
SAMPLE_JS = r"""
(frac) => {
  const w = window.__q('#anything-llm-chat');
  const cs = getComputedStyle(w);
  const out = {
    name: cs.animationName, duration: cs.animationDuration, easing: cs.animationTimingFunction,
    origin: cs.transformOrigin, cls: w.className,
  };
  const a = w.getAnimations()[0];
  if (a) {
    a.pause();
    const d = a.effect.getComputedTiming().duration;
    a.currentTime = 0;
    out.start = { tf: getComputedStyle(w).transform, op: getComputedStyle(w).opacity, sh: getComputedStyle(w).boxShadow };
    a.currentTime = d * frac;
    const c = getComputedStyle(w);
    out.mid = { tf: c.transform, op: c.opacity, sh: c.boxShadow };
    a.finish();
  }
  const e = getComputedStyle(w);
  out.end = { tf: e.transform, op: e.opacity, sh: e.boxShadow };
  return out;
}
"""


def matrix(tf):
    if not tf or tf == "none":
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    return tuple(float(v) for v in tf[tf.index("(") + 1: -1].split(","))


def check_ak4(browser, base_url):
    expect_ease = {
        "expand": "cubic-bezier(0.4, 0, 0.2, 1)",
        "grow": "cubic-bezier(0.4, 0, 0.2, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "float": "cubic-bezier(0.16, 1, 0.3, 1)",
    }
    seen = {}
    for layout in ("overlay", "flow"):
        for eff in EFFECTS:
            attrs = {**INLINE, "inline-layout": layout, "inline-effect": eff}
            ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True}, tv.Mock())
            try:
                ready(page)
                click_bar(page)
                s = page.evaluate(SAMPLE_JS, 0.4)
            finally:
                ctx.close()
            a, b, c, d, tx, ty = matrix(s["start"]["tf"])
            ma, mb, mc, md, mtx, mty = matrix(s["mid"]["tf"])
            dur_ms = float(s["duration"].rstrip("s")) * 1000
            ok_common = (s["name"] == f"allm-fx-{eff}" and 260 <= dur_ms <= 500 and s["easing"] == expect_ease[eff]
                         and s["end"]["tf"] == "none" and s["end"]["op"] == "1")
            if eff == "expand":
                ok = ok_common and a == 1 and d == 0 and s["start"]["op"] == "1" and 0 < md < 1 and ma == 1
                what = f"Start scaleY {d:g} (scaleX {a:g}), bei 40 % scaleY {md:.3f}, Opacity fest {s['mid']['op']}"
            elif eff == "grow":
                ok = ok_common and abs(a - 0.96) < 1e-6 and abs(d - 0.96) < 1e-6 and s["start"]["op"] == "0"
                what = f"Start scale {a:g}/{d:g}, Opacity {s['start']['op']} -> bei 40 % {float(s['mid']['op']):.2f}"
            elif eff == "spring":
                ok = ok_common and a < 1 and abs(a - d) < 1e-6 and s["start"]["op"] == "0"
                what = f"Start scale {a:g}, bei 40 % scale {ma:.3f} (Federkurve, überschwingt), Opacity {s['start']['op']}"
            else:
                ok = (ok_common and a == 1 and d == 1 and abs(ty - 8) < 1e-6 and 0 < mty < 8
                      and (s["start"]["sh"] == "none" or s["start"]["sh"].startswith("rgba(0, 0, 0, 0) 0px 0px 0px"))
                      and s["end"]["sh"] != "none" and s["start"]["op"] == "0")
                what = (f"Start translateY {ty:g} px -> bei 40 % {mty:.2f} px, Schatten {s['start']['sh']} -> "
                        f"{s['end']['sh'][:40]}…, Opacity {s['start']['op']}")
            seen[(layout, eff)] = (s["name"], s["start"]["tf"], s["start"]["op"], s["easing"])
            record(f"AK-4 Effekt {eff} ({layout})", ok,
                   f"{s['name']} {s['duration']} {s['easing']}; {what}")
    distinct = len({seen[("overlay", e)] for e in EFFECTS}) == 4
    record("AK-4 vier Effekte unterscheidbar", distinct, f"{len({seen[('overlay', e)] for e in EFFECTS})} verschiedene Signaturen")
    # Dauer/Kurve über Seiten-CSS
    css = ":root { --allm-effect-duration: 450ms; --allm-effect-easing: linear; }"
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True, "css": css}, tv.Mock())
    try:
        ready(page)
        click_bar(page)
        s = page.evaluate(SAMPLE_JS, 0.4)
        record("AK-4 --allm-effect-duration / --allm-effect-easing per Seiten-CSS",
               s["duration"] == "0.45s" and s["easing"] == "linear", f"{s['duration']} {s['easing']}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# AK-5: Mobil unverändert
# ---------------------------------------------------------------------------
def check_ak5(browser, base_url):
    for label, opts in (("Maus", {}), ("Touch", {"has_touch": True, "is_mobile": True})):
        ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock(),
                                 viewport=tv.MOBILE, context_options=opts)
        try:
            ready(page)
            before = geom(page)
            if opts:
                x, y = page.evaluate("() => { const r = window.__q('#anything-llm-inline-bar').getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; }")
                page.touchscreen.tap(x, y)
            else:
                click_bar(page)
            wait_open(page)
            tv.settle(page, 400)
            g = geom(page)
            vw, vh = page.evaluate("() => [innerWidth, innerHeight]")
            full = (g["chatPos"] == "fixed" and g["chat"]["x"] == 0 and g["chat"]["y"] == 0
                    and abs(g["chat"]["w"] - vw) <= 1 and abs(g["chat"]["h"] - vh) <= 1)
            ok = full and g["hostParent"] == "BODY" and "allm-effect" not in g["cls"] and g["expandedAttr"] is None
            record(f"AK-5 Mobil 390 px Vollbild ({label})", ok,
                   f"#anything-llm-chat {g['chatPos']} {g['chat']['w']:.0f}×{g['chat']['h']:.0f} @ "
                   f"{g['chat']['x']:.0f},{g['chat']['y']:.0f} (Viewport {vw}×{vh}); Host in {g['hostParent']}; Effekt-Klasse: "
                   f"{'ja' if 'allm-effect' in g['cls'] else 'nein'}; data-allm-expanded={g['expandedAttr']}; "
                   f"Platzhalter-Höhe {before['mount']['h']:.0f} -> {g['mount']['h']:.0f}")
            if label == "Maus":
                page.screenshot(path=str(RESULTS_DIR / "overlay-mobile-float.png"), animations="disabled", caret="hide")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# AK-6: reduzierte Bewegung
# ---------------------------------------------------------------------------
def check_ak6(browser, base_url):
    for eff in EFFECTS:
        attrs = {**OVERLAY, "inline-effect": eff}
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True,
                                                       "css": ":root { --allm-effect-duration: 450ms; }"},
                                 tv.Mock(), reduced_motion="reduce")
        try:
            ready(page)
            click_bar(page)
            s = page.evaluate(
                "() => { const w = window.__q('#anything-llm-chat'); const c = getComputedStyle(w); return { name: c.animationName, dur: c.animationDuration, n: w.getAnimations().length, tf: c.transform, op: c.opacity, v: getComputedStyle(document.getElementById('anythingllm-embed-widget')).getPropertyValue('--allmi-effect-duration').trim() }; }")
            ok = s["n"] == 0 and s["dur"] == "0s" and s["tf"] == "none" and s["op"] == "1"
            record(f"AK-6 reduzierte Bewegung ({eff})", ok,
                   f"animation-name {s['name']}, Dauer {s['dur']}, laufende Animationen {s['n']}, "
                   f"--allmi-effect-duration {s['v']} (Seiten-CSS 450ms, bleibt; abgeschaltet per animation: none), "
                   f"sofort transform {s['tf']}, opacity {s['op']}")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# AK-7: Stapelordnung konfigurierbar
# ---------------------------------------------------------------------------
BANNER_JS = r"""
() => {
  const b = document.createElement('div');
  b.id = 'banner';
  b.textContent = 'Cookie-Banner (z-index 100)';
  b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:120px;z-index:100;background:#333;color:#fff;padding:12px';
  document.body.appendChild(b);
}
"""


def check_ak7(browser, base_url):
    for label, css, want in (("--allm-overlay-z: 50", ":root { --allm-overlay-z: 50; }", "banner"),
                             ("Standard 1000", "", "widget")):
        ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True, "css": css}, tv.Mock())
        try:
            ready(page)
            page.evaluate(BANNER_JS)
            open_settled(page)
            g = geom(page)
            y = min(g["chat"]["bottom"] - 20, 700 - 40)
            hit = page.evaluate(
                "([x, y]) => { const e = document.elementFromPoint(x, y); return e.id === 'anythingllm-embed-widget' ? 'widget' : e.id; }",
                [g["chat"]["x"] + 40, y])
            z = page.evaluate("() => getComputedStyle(window.__q('#anything-llm-chat').parentElement).zIndex")
            record(f"AK-7 Stapelordnung ({label})", hit == want,
                   f"Box z-index {z}, Banner z-index 100, elementFromPoint im Überlappungsbereich = {hit}")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# AK-8 im Browser: visual_config.inlineLayout ohne Script-Attribut
# ---------------------------------------------------------------------------
def check_ak8(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": INLINE, "inline": True},
                             tv.Mock(config={**tv.PRAES_CONFIG, "inlineLayout": "overlay", "inlineEffect": "float"}))
    try:
        ready(page)
        before = geom(page)
        open_settled(page)
        g = geom(page)
        ok = g["boxPos"] == "absolute" and "allm-effect-float" in g["cls"] and abs(g["below"]["dy"] - before["below"]["dy"]) <= 1
        record("AK-8 visual_config.inlineLayout = overlay (Browser)", ok,
               f"Box {g['boxPos']}, Effekt {'float' if 'allm-effect-float' in g['cls'] else g['cls']}, "
               f"#below Δ {g['below']['dy'] - before['below']['dy']:+.1f} px")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# NAK-1: kein Scroll-Lock, keine Body-Styles
# ---------------------------------------------------------------------------
def check_nak1(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock())
    try:
        ready(page)
        snap = "() => [document.body.getAttribute('style'), document.documentElement.getAttribute('style'), getComputedStyle(document.body).overflow, getComputedStyle(document.documentElement).overflow, document.getElementById('kufer-assistent').getAttribute('style')]"
        before = page.evaluate(snap)
        open_settled(page)
        during = page.evaluate(snap)
        page.mouse.move(930, 300)
        page.mouse.wheel(0, 400)
        page.wait_for_timeout(400)
        sy = page.evaluate("() => window.scrollY")
        still = geom(page)["open"]
        ok = before == during and sy >= 300 and still
        record("NAK-1 kein Scroll-Lock, keine Body-Styles", ok,
               f"body/html style+overflow, Platzhalter-style vorher {before} = offen {during}; "
               f"Mausrad 400 px -> scrollY {sy}, Box weiter offen: {still}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# NAK-2: Außenklick auf Links schließt UND löst den Link aus
# ---------------------------------------------------------------------------
def check_nak2(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock())
    try:
        ready(page)
        open_settled(page)
        x, y = page.evaluate("() => { const r = document.getElementById('link-out').getBoundingClientRect(); return [r.x + 10, r.y + r.height / 2]; }")
        page.mouse.click(x, y)
        page.wait_for_timeout(200)
        st = page.evaluate("() => [location.hash, window.__linkClicks]")
        g = geom(page)
        ok = not g["open"] and st[0] == "#ziel-out" and st[1] == 1
        record("NAK-2 Link außerhalb: schließt und Link wird ausgelöst", ok,
               f"offen={g['open']}, location.hash={st[0]}, Klick-Handler {st[1]}x "
               "(Link stoppt pointerdown per stopPropagation)")
    finally:
        ctx.close()
    # Seite verbreitert den Platzhalter bei offenem Panel um 160 px
    # (README-Beispiel data-allm-expanded); der Link steht rechts daneben und
    # rückt beim Einklappen um 160 px nach links. Einklappen schon beim
    # pointerdown würde den click verschlucken (mouseup an anderer Stelle).
    css = ("#row { display: flex; align-items: flex-start; gap: 12px; } "
           "#kufer-assistent { width: 500px; flex: none; margin: 0; } "
           "#kufer-assistent[data-allm-expanded] { width: 660px; } main { max-width: none; }")
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True, "css": css}, tv.Mock())
    try:
        ready(page)
        page.evaluate(
            "() => { const m = document.getElementById('kufer-assistent'); const row = document.createElement('div'); row.id = 'row'; m.parentNode.insertBefore(row, m); row.appendChild(m); const a = document.createElement('a'); a.id = 'link-side'; a.href = '#ziel-side'; a.textContent = 'Link daneben'; a.style.cssText = 'display:inline-block;padding:10px;white-space:nowrap'; row.appendChild(a); window.__sideClicks = 0; a.addEventListener('click', () => { window.__sideClicks += 1; }); }")
        tv.settle(page, 200)
        x0 = page.evaluate("() => document.getElementById('link-side').getBoundingClientRect().x")
        open_settled(page)
        x, y = page.evaluate("() => { const r = document.getElementById('link-side').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
        mw = page.evaluate("() => document.getElementById('kufer-assistent').getBoundingClientRect().width")
        page.mouse.click(x, y)
        page.wait_for_timeout(200)
        st = page.evaluate("() => [location.hash, window.__sideClicks]")
        x1 = page.evaluate("() => document.getElementById('link-side').getBoundingClientRect().x")
        g = geom(page)
        ok = not g["open"] and st == ["#ziel-side", 1] and x1 < x - 100
        record("NAK-2 Link neben dem verbreiterten Platzhalter: Handler 1x UND Panel zu", ok,
               f"Platzhalter offen {mw:.0f} px, Link-Mitte offen x {x:.0f}, Link links zu {x0:.0f} -> nach dem Einklappen {x1:.0f}; "
               f"offen={g['open']}, location.hash={st[0]}, Klick-Handler {st[1]}x")
    finally:
        ctx.close()
    # Rechts- und Mittelklick außerhalb schließen nicht
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock())
    try:
        ready(page)
        open_settled(page)
        page.mouse.click(930, 120, button="right")
        page.wait_for_timeout(150)
        right = geom(page)["open"]
        page.mouse.click(930, 120, button="middle")
        page.wait_for_timeout(150)
        middle = geom(page)["open"]
        page.mouse.click(930, 120)
        page.wait_for_timeout(150)
        left = geom(page)["open"]
        record("Nur linke Maustaste: Rechts-/Mittelklick außerhalb schließen nicht", right and middle and not left,
               f"nach Rechtsklick offen={right}, nach Mittelklick offen={middle}, nach Linksklick offen={left}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# Touch (iPad): Tippen außerhalb schließt, Wischen nicht
# ---------------------------------------------------------------------------
def touch_swipe(page, x, y, dy):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for i in range(1, 9):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y + dy * i / 8}]})
        page.wait_for_timeout(16)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.detach()


def check_touch_outside(browser, base_url):
    opts = {"has_touch": True}
    for label, no_click in (("Chromium", False), ("ohne click am document wie Safari", True)):
        ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock(),
                                 viewport={"width": 1024, "height": 768}, context_options=opts)
        try:
            ready(page)
            x, y = page.evaluate("() => { const r = window.__q('#anything-llm-inline-bar').getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; }")
            page.touchscreen.tap(x, y)
            wait_open(page)
            tv.settle(page, 400)
            if no_click:
                # Safari: kein click für Taps auf nicht-interaktive Stellen
                page.evaluate("() => window.addEventListener('click', (e) => e.stopImmediatePropagation(), true)")
            # Wischen über leeren Seitentext (Überschrift)
            hx, hy = page.evaluate("() => { const r = document.querySelector('h1').getBoundingClientRect(); return [r.x + r.width - 20, r.y + r.height / 2]; }")
            touch_swipe(page, hx, hy, 60)
            page.wait_for_timeout(500)
            after_swipe = geom(page)["open"]
            page.evaluate("() => window.scrollTo(0, 0)")
            page.wait_for_timeout(100)
            hx, hy = page.evaluate("() => { const r = document.querySelector('h1').getBoundingClientRect(); return [r.x + r.width - 20, r.y + r.height / 2]; }")
            page.touchscreen.tap(hx, hy)
            page.wait_for_timeout(500)
            after_tap = geom(page)["open"]
            record(f"Touch außerhalb ({label}): Wischen schließt nicht, Tippen auf Seitentext schließt",
                   after_swipe and not after_tap, f"nach Wischen offen={after_swipe}, nach Tippen offen={after_tap}")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Escape mit Fokus in einem Seitenfeld: schließt, Fokus bleibt im Feld
# ---------------------------------------------------------------------------
def check_escape_page_field(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock())
    try:
        ready(page)
        page.evaluate("() => { const i = document.createElement('input'); i.id = 'page-search'; i.style.cssText = 'position:fixed;left:820px;top:40px;width:150px'; document.body.appendChild(i); }")
        open_settled(page)
        page.evaluate("() => document.getElementById('page-search').focus()")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        pid = page.evaluate("() => document.activeElement && document.activeElement.id")
        g = geom(page)
        record("Escape im Seitenfeld: schließt, Fokus bleibt im Feld", not g["open"] and pid == "page-search",
               f"offen={g['open']}, document.activeElement=#{pid}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# Wiedereintritt ohne openChat: Fenster 1200 -> 700 -> 800, Drehen aus dem
# Vollbild in einen overflow:hidden-Vorfahren, kein Effekt beim Resize
# ---------------------------------------------------------------------------
def check_reentry(browser, base_url):
    chips = ("Welche Sprachkurse gibt es am Abend in der Innenstadt?,"
             "Voraussetzungen für einen Integrationskurs mit Zertifikat?,"
             "Yoga für Anfänger am Wochenende")
    attrs = {**FLOAT, **INPUT, "default-messages": chips}
    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, "css": "main { max-width: none; }"},
                             tv.Mock(config=CFG_NO_MSGS), viewport={"width": 1200, "height": 800})
    try:
        ready(page, "#anything-llm-inline-input")
        h1200 = geom(page)["root"]["h"]
        open_settled(page, "#anything-llm-inline-bar")
        page.set_viewport_size({"width": 700, "height": 800})
        page.wait_for_timeout(300)
        page.set_viewport_size({"width": 800, "height": 800})
        page.wait_for_timeout(300)
        anims = page.evaluate("() => window.__q('#anything-llm-chat').getAnimations().length")
        spacer = page.evaluate(
            "() => { const w = window.__q('#anything-llm-inline-input-bar'); const s = w.parentElement; return [s.getBoundingClientRect().height, s.style.height]; }")
        before = geom(page)
        # Escape mit Fokus im Widget (Chat-Eingabefeld)
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        after = geom(page)
        natural = after["root"]["h"]
        jump = after["below"]["dy"] - before["below"]["dy"]
        ok = (before["open"] and before["boxPos"] == "absolute" and abs(spacer[0] - natural) <= 1
              and abs(jump) <= 1 and natural != h1200)
        record("Wiedereintritt 1200 -> 700 -> 800: Platzhalter = natürliche Höhe, kein Sprung beim Einklappen", ok,
               f"Leiste 1200 px: {h1200:.0f} px; nach 800 px: unsichtbare Leiste {spacer[0]:.0f} px (style {spacer[1] or '-'}), "
               f"natürliche Höhe eingeklappt {natural:.0f} px, #below Δ beim Einklappen {jump:+.1f} px, eingeklappt={not after['open']}")
        record("Kein Effekt beim Wiedereintritt (Resize über 768 px)", anims == 0, f"getAnimations() = {anims}")
    finally:
        ctx.close()
    # Drehen: mobil geöffnet (Vollbild), dann quer (>=768px) in einen
    # overflow:hidden-Vorfahren -> Flow-Fallback
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock(),
                             viewport=tv.MOBILE)
    try:
        ready(page)
        page.evaluate(
            "() => { const m = document.getElementById('kufer-assistent'); const w = document.createElement('div'); w.id = 'clip'; w.style.cssText = 'overflow:hidden;height:220px;border:1px dashed #999'; m.parentNode.insertBefore(w, m); w.appendChild(m); }")
        click_bar(page)
        wait_open(page)
        tv.settle(page, 300)
        full = geom(page)["chatPos"]
        page.set_viewport_size({"width": 1000, "height": 700})
        page.wait_for_timeout(400)
        g = geom(page)
        anims = page.evaluate("() => window.__q('#anything-llm-chat').getAnimations().length")
        warns = [t for (k, t) in page.console_log if k == "warning" and "inlineLayout" in t]
        ok = full == "fixed" and g["open"] and g["boxPos"] == "relative" and g["hostParent"] == "kufer-assistent" and len(warns) == 1 and anims == 0
        record("Drehen aus dem Vollbild in overflow:hidden-Vorfahren -> Flow-Fallback", ok,
               f"mobil {full}; quer: Box {g['boxPos']}, Host in {g['hostParent']}, Warnungen {len(warns)}, Animationen {anims}")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# Fund B: Absenden aus der Leiste scrollt die Box vollständig ins Bild (wie Klick)
# ---------------------------------------------------------------------------
def check_scroll_after_send(browser, base_url):
    vp = {"width": 1280, "height": 900}
    spacer = ("() => { const s = document.createElement('div'); s.style.height = '560px'; s.textContent = 'Abstand';"
              " document.getElementById('slot').before(s); }")
    for layout_label, extra in (("flow", {}), ("overlay", {"inline-layout": "overlay"})):
        attrs = {**INLINE, **INPUT, **extra, "inline-height": "520px"}
        res = {}
        for how in ("click", "enter", "chip"):
            m = tv.Mock(config=CFG_NO_MSGS, stream="hang")
            ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True}, m, viewport=vp)
            try:
                ready(page, "#anything-llm-inline-input")
                page.evaluate(spacer)
                tv.settle(page, 200)
                if how == "click":
                    click_bar(page)  # neben das Feld: nur aufklappen
                elif how == "enter":
                    page.evaluate("() => window.__q('#anything-llm-inline-input').focus()")
                    page.keyboard.type("Hallo")
                    page.keyboard.press("Enter")
                else:
                    x, y = page.evaluate("() => { const r = window.__q('.allm-inline-chip').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
                    page.mouse.click(x, y)
                wait_open(page)
                page.wait_for_timeout(1200)
                res[how] = page.evaluate(
                    "() => { const b = window.__q('#anything-llm-chat').getBoundingClientRect(); return { sy: scrollY, bottom: b.bottom, top: b.top, vh: innerHeight }; }")
            finally:
                m.release()
                ctx.close()
        c = res["click"]
        for how in ("enter", "chip"):
            r = res[how]
            ok = r["sy"] >= c["sy"] - 2 and r["bottom"] <= r["vh"] and r["top"] >= 0
            record(f"B Scrollen nach Absenden aus der Leiste ({how}, {layout_label})", ok,
                   f"scrollY {r['sy']:.0f} (Klick-Öffnen {c['sy']:.0f}), Box {r['top']:.0f}–{r['bottom']:.0f} px, "
                   f"Viewport {r['vh']} px")


# ---------------------------------------------------------------------------
# NAK-4: kein Frame mit unpositionierter Box
# ---------------------------------------------------------------------------
FRAMES_JS = r"""
() => {
  window.__ovFrames = [];
  const tick = () => {
    const w = window.__q('#anything-llm-chat');
    const root = window.__q('#anything-llm-embed-inline');
    if (w) {
      const r = w.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        window.__ovFrames.push({ x: r.x, y: r.y, w: r.width, h: r.height, rx: rr.x, ry: rr.y, rw: rr.width,
                                 pos: getComputedStyle(w.parentElement).position });
    }
    if (window.__ovFrames.length < 40) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
"""


def check_nak4(browser, base_url):
    for eff in EFFECTS:
        ctx, page = tv.open_page(browser, base_url, {"attrs": {**OVERLAY, "inline-effect": eff}, "inline": True},
                                 tv.Mock())
        try:
            ready(page)
            page.evaluate(FRAMES_JS)
            click_bar(page)
            if eff == "float":
                page.wait_for_timeout(16)
                page.screenshot(path=str(RESULTS_DIR / "overlay-nak4-float-16ms.png"), caret="hide")
            page.wait_for_function("() => window.__ovFrames.length >= 20", timeout=10000)
            frames = page.evaluate("() => window.__ovFrames")
            bad = [f for f in frames
                   if f["pos"] != "absolute" or abs((f["x"] + f["w"] / 2) - (f["rx"] + f["rw"] / 2)) > 1
                   or f["y"] < f["ry"] - 1 or f["y"] > f["ry"] + 12]
            first = frames[0]
            record(f"NAK-4 kein unpositionierter Frame ({eff})", not bad,
                   f"{len(frames)} Frames; 1. sichtbarer Frame: Box {first['x']:.0f},{first['y']:.0f} "
                   f"{first['w']:.0f}×{first['h']:.0f} (Ziel-Oberkante {first['ry']:.0f}, Mitte {first['rx'] + first['rw'] / 2:.0f}), "
                   f"Abweichler {len(bad)}")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Fallback: Vorfahre mit overflow:hidden -> flow + Warnung
# ---------------------------------------------------------------------------
def check_fallback(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": FLOAT, "inline": True}, tv.Mock())
    try:
        ready(page)
        page.evaluate(
            "() => { const m = document.getElementById('kufer-assistent'); const w = document.createElement('div'); w.id = 'clip'; w.style.cssText = 'overflow:hidden;height:220px;border:1px dashed #999'; m.parentNode.insertBefore(w, m); w.appendChild(m); }")
        open_settled(page)
        g = geom(page)
        warns = [t for (k, t) in page.console_log if k == "warning" and "inlineLayout" in t]
        record("Fallback overflow:hidden -> flow + console.warn", g["boxPos"] == "relative" and len(warns) == 1,
               f"Box {g['boxPos']}, Warnungen {len(warns)}: {warns[0][:90] if warns else '-'}")
        # Außen-Vorfahre mit overflow-x:hidden, Box passt hinein -> Overlay bleibt
    finally:
        ctx.close()
    ctx, page = tv.open_page(browser, base_url,
                             {"attrs": FLOAT, "inline": True, "css": "main { overflow-x: hidden; }"}, tv.Mock())
    try:
        ready(page)
        open_settled(page)
        g = geom(page)
        warns = [t for (k, t) in page.console_log if k == "warning" and "inlineLayout" in t]
        record("Fallback nicht bei passendem overflow-x:hidden-Vorfahren", g["boxPos"] == "absolute" and not warns,
               f"Box {g['boxPos']}, Warnungen {len(warns)}")
    finally:
        ctx.close()


def check_signal(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": INLINE, "inline": True}, tv.Mock())
    try:
        ready(page)
        a0 = geom(page)["expandedAttr"]
        open_settled(page)
        a1 = geom(page)["expandedAttr"]
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
        a2 = geom(page)["expandedAttr"]
        record("Signal data-allm-expanded am Platzhalter", a0 is None and a1 == "true" and a2 is None,
               f"eingeklappt={a0}, aufgeklappt={a1}, wieder eingeklappt={a2}")
    finally:
        ctx.close()


def check_warn(browser, base_url):
    # ungültig = ohne Angabe: flow -> keine Animation, overlay -> expand
    for label, attrs, want in (("flow", INLINE, None), ("overlay", OVERLAY, "allm-effect-expand")):
        ctx, page = tv.open_page(browser, base_url, {"attrs": {**attrs, "inline-effect": "wobble"}, "inline": True},
                                 tv.Mock())
        try:
            ready(page)
            click_bar(page)
            wait_open(page)
            cls = geom(page)["cls"]
            warns = [t for (k, t) in page.console_log if k == "warning" and "inlineEffect" in t]
            ok_cls = ("allm-effect" not in cls) if want is None else (want in cls)
            record(f'NAK-3 data-inline-effect="wobble" (Browser, {label})', ok_cls and len(warns) == 1,
                   f"Klasse {'keine' if 'allm-effect' not in cls else cls.split()[-1]}, Warnungen {len(warns)}: "
                   f"{warns[0][warns[0].find('—'):][:80] if warns else '-'}")
        finally:
            ctx.close()


# ---------------------------------------------------------------------------
# Effekt "morph": Leiste wächst zum Panel (Issue „morph + Rückbau“)
# ---------------------------------------------------------------------------
MORPH = {**OVERLAY, "inline-effect": "morph", "inline-height": "520px"}
MORPH_FLOW = {**INLINE, "inline-effect": "morph", "inline-height": "520px"}
# AK-2: Leiste 600 px breit (Pille), Panel 760 × 520 px (die Seite verbreitert
# den Platzhalter beim Aufklappen), Panel-Rundung 40 px
MORPH_CSS = ("#kufer-assistent { width: 600px; } #kufer-assistent[data-allm-expanded] { width: 760px; } "
             "#anythingllm-embed-widget { --allm-bar-radius: 999px; --allm-radius: 40px; }")
# Timing wie das Mockup („Schweben“): Aufklappen 720 ms, Zuklappen 480 ms nach 80 ms
MORPH_MS = 720
MORPH_CLOSE_MS = 480
MORPH_CLOSE_DELAY = 80

MORPH_STATE_JS = r"""
() => {
  const w = window.__q('#anything-llm-chat');
  const c = w && w.querySelector('.allm-inline-content');
  const r = w.getBoundingClientRect();
  const cs = getComputedStyle(w);
  return { w: r.width, h: r.height, x: r.x, y: r.y, radius: parseFloat(cs.borderTopLeftRadius),
    dur: cs.transitionDuration.split(',')[0].trim(), tf: cs.transform, cls: w.className,
    op: c ? parseFloat(getComputedStyle(c).opacity) : null, ctf: c ? getComputedStyle(c).transform : null,
    box: w.parentElement.getBoundingClientRect().height,
    morph: w.classList.contains('allm-morph') || w.classList.contains('allm-morph-from') };
}
"""
# Alle Transitionen des Laufs anhalten und auf t ms setzen (deterministischer Frame)
MORPH_SEEK_JS = r"""
(t) => {
  const w = window.__q('#anything-llm-chat');
  const anims = [...w.getAnimations({ subtree: true }), ...w.parentElement.getAnimations()];
  anims.forEach((a) => { a.pause(); a.currentTime = t; });
  return anims.length;
}
"""
MORPH_PLAY_JS = r"""
() => { const w = window.__q('#anything-llm-chat');
  [...w.getAnimations({ subtree: true }), ...w.parentElement.getAnimations()].forEach((a) => a.play()); }
"""
# Ab dem nächsten pointerdown jeden Frame messen (700 ms): Chat-Fenster, äußere Box, #below
MORPH_SAMPLER_JS = r"""
() => { window.__ms = []; document.addEventListener('pointerdown', () => {
  const t0 = performance.now();
  const tick = () => {
    const w = window.__q('#anything-llm-chat');
    if (w) { const r = w.getBoundingClientRect();
      window.__ms.push({ t: performance.now() - t0, w: r.width, h: r.height,
        box: w.parentElement.getBoundingClientRect().height,
        below: document.getElementById('below').getBoundingClientRect().top + scrollY }); }
    if (performance.now() - t0 < 700) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }, { capture: true, once: true }); }
"""


def morph_state(page):
    return page.evaluate(MORPH_STATE_JS)


def pill_rect(page):
    return page.evaluate(
        "() => { const r = window.__q('#anything-llm-inline-bar').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; }")


def wait_morph_running(page):
    page.wait_for_function("() => { const w = window.__q('#anything-llm-chat'); return !!w && w.classList.contains('allm-morph'); }",
                           timeout=3000)


def wait_morph_done(page):
    page.wait_for_function(
        "() => { const w = window.__q('#anything-llm-chat'); return !w || !(w.classList.contains('allm-morph') || w.classList.contains('allm-morph-from')); }",
        timeout=3000)


def wait_bar_back(page):
    page.wait_for_function(
        "() => { const w = window.__q('#anything-llm-chat'); return (!w || w.getBoundingClientRect().height === 0) && !!window.__q('#anything-llm-inline-input'); }",
        timeout=3000)


def morph_page(browser, base_url, attrs=None, viewport=None, reduced_motion="no-preference", css=MORPH_CSS):
    attrs = attrs or {**MORPH, **INPUT}
    ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, "css": css},
                             tv.Mock(config=CFG_NO_MSGS, history=tv.HISTORY_ANSWER), viewport=viewport,
                             reduced_motion=reduced_motion)
    ready(page, "#anything-llm-inline-input" if attrs.get("inline-input") else "#anything-llm-inline-bar")
    return ctx, page


def morph_click(page):
    """Leiste aufklappen: leeres Feld -> Knopf „Chatten“ (Fokus ins Chat-Feld)."""
    click_bar(page, "#anything-llm-inline-send")


def morph_prepared(browser, base_url, attrs=None):
    """Einmal auf- und (per Escape, rückwärts) zuklappen: Chat geladen, Leiste
    wieder da -> der nächste Lauf ist deterministisch (Inhalt steht)."""
    ctx, page = morph_page(browser, base_url, attrs)
    morph_click(page)
    wait_open(page)
    tv.wait_shadow(page, ".allm-anything-llm-assistant-message a")
    wait_morph_done(page)
    tv.settle(page, 300)
    page.keyboard.press("Escape")
    wait_bar_back(page)
    tv.settle(page, 200)
    page.mouse.move(990, 690)
    return ctx, page


def run_morph_pixel(browser, base_url, baseline, new_states, only=None):
    """Zustände ov-morph-mid (alle Transitionen bei 50 % der Dauer angehalten)
    und ov-morph-end (Endzustand) — neue Zustände, Referenz aus diesem Branch."""
    names = [n for n in ("ov-morph-mid", "ov-morph-end") if not only or n in only]
    if not names or (baseline and not new_states):
        return
    ctx, page = morph_prepared(browser, base_url)
    try:
        morph_click(page)
        wait_morph_running(page)
        page.evaluate(MORPH_SEEK_JS, MORPH_MS / 2)
        blur_widget(page)
        page.mouse.move(990, 690)
        page.wait_for_timeout(100)
        shots = {}
        mid = RESULTS_DIR / "overlay-ov-morph-mid.png"
        page.screenshot(path=str(mid), caret="hide")
        shots["ov-morph-mid"] = mid
        page.evaluate(MORPH_PLAY_JS)
        wait_morph_done(page)
        tv.settle(page)
        blur_widget(page)
        page.wait_for_timeout(100)
        end = RESULTS_DIR / "overlay-ov-morph-end.png"
        page.screenshot(path=str(end), animations="disabled", caret="hide")
        shots["ov-morph-end"] = end
        errs = tv.errors_of(page)
    finally:
        ctx.close()
    for name in names:
        ref = BASELINE_DIR / f"{name}.png"
        if baseline:
            if ref.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            ref.write_bytes(shots[name].read_bytes())
            print(f"[BASE] {name} -> {ref.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        if not ref.exists():
            record(f"PIX {name}", False, "keine Referenz (erst --baseline --new-states laufen lassen)")
            continue
        ratio, maxd = tv.diff_ratio(ref, shots[name], RESULTS_DIR / f"overlay-{name}.diff.png")
        record(f"REG {name}", ratio <= tv.MAX_DIFF_RATIO and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""))


def check_morph(browser, base_url):
    """AK-2 Geometrie (Start/50 %/Ende), NAK-1 kein Textzoom, AK-3 rückwärts, AK-10 Frames."""
    ctx, page = morph_prepared(browser, base_url)
    try:
        bar = pill_rect(page)
        morph_click(page)
        wait_morph_running(page)
        page.evaluate(MORPH_SEEK_JS, 0)
        start = morph_state(page)
        page.evaluate(MORPH_SEEK_JS, MORPH_MS / 2)
        mid = morph_state(page)
        page.evaluate(MORPH_PLAY_JS)
        wait_morph_done(page)
        tv.settle(page, 200)
        end = morph_state(page)
        lo, hi = 600 * 0.95, 760 * 1.05
        ok = (abs(start["w"] - bar["w"]) <= 1 and abs(start["h"] - bar["h"]) <= 1 and start["radius"] >= bar["h"] / 2 - 0.5
              and abs(start["x"] - bar["x"]) <= 1 and start["op"] == 0 and start["dur"] == "0.72s")
        record("AK-2 morph Start = Leistenform", ok,
               f"Leiste {bar['w']:.0f}×{bar['h']:.0f} @ {bar['x']:.0f}; Box {start['w']:.0f}×{start['h']:.0f} @ {start['x']:.0f}, "
               f"Rundung {start['radius']:.1f} px (Pille = halbe Höhe; Leiste 999px), Inhalt-Opacity {start['op']}, Dauer {start['dur']}")
        ok = bar["w"] < mid["w"] < 760 and lo <= mid["w"] <= hi and bar["h"] < mid["h"] < 520 and mid["op"] < 1
        record("AK-2 morph bei 50 % Zwischengröße, Inhalt noch nicht voll", ok,
               f"{mid['w']:.1f}×{mid['h']:.1f} px, Rundung {mid['radius']:.1f} px, Inhalt-Opacity {mid['op']:.3f}")
        ok = (abs(end["w"] - 760) <= 1 and abs(end["h"] - 520) <= 1 and end["radius"] == 40 and end["op"] == 1
              and not end["morph"] and end["tf"] == "none")
        record("AK-2 morph Ende = Panel 760×520, --allm-radius", ok,
               f"{end['w']:.0f}×{end['h']:.0f} px, Rundung {end['radius']} px, transform {end['tf']}, Klassen weg: {not end['morph']}")
        a, b, c, d, _, _ = matrix(mid["tf"])
        record("NAK-1 morph kein Textzoom (Inhalt nur Opacity)", mid["ctf"] == "none" and a == 1 and d == 1 and b == 0 and c == 0,
               f"transform Inhalt {mid['ctf']}, Box {mid['tf']}")
        # AK-10: ungestörter Lauf, jeden Frame gemessen (nach Escape-Zuklappen)
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.press("Escape")
        wait_bar_back(page)
        page.mouse.move(990, 690)
        page.evaluate(MORPH_SAMPLER_JS)
        morph_click(page)
        page.wait_for_timeout(MORPH_MS + 300)
        samples = page.evaluate("() => window.__ms")
        buckets = {}
        for sm in samples:
            buckets.setdefault(int(sm["t"] // 40), sm)
        growing = sum(1 for sm in buckets.values() if bar["w"] + 0.5 < sm["w"] < 760 - 0.5)
        record("AK-10 morph wächst über mehrere 40-ms-Frames (Messung)", growing >= 6,
               f"{growing} von {len(buckets)} Frames (40-ms-Takt) zwischen Leiste und Panel; Soll ≥ 6 von 14")
        # AK-3: Escape -> rückwärts, danach Leiste wie vorher, Fokus auf der Leiste
        page.evaluate("() => window.__q('#message-input').focus()")
        page.keyboard.press("Escape")
        page.wait_for_timeout(int(MORPH_CLOSE_DELAY + MORPH_CLOSE_MS * 0.3))
        during = morph_state(page)
        wait_bar_back(page)
        page.wait_for_timeout(100)
        after = pill_rect(page)
        focus = active_id(page)
        g = geom(page)
        ok = (during["morph"] and bar["w"] - 1 <= during["w"] < 760 - 1 and abs(after["w"] - bar["w"]) <= 1
              and abs(after["h"] - bar["h"]) <= 1 and focus == "anything-llm-inline-input" and g["expandedAttr"] is None
              and not tv.errors_of(page))
        record("AK-3 morph Zuklappen rückwärts (Escape)", ok,
               f"nach 80 ms + 30 % {during['w']:.0f}×{during['h']:.0f} px, danach Leiste {after['w']:.0f}×{after['h']:.0f} "
               f"(vorher {bar['w']:.0f}×{bar['h']:.0f}), Fokus {focus}, data-allm-expanded={g['expandedAttr']}")
        # Außenklick ebenfalls rückwärts
        morph_click(page)
        wait_open(page)
        wait_morph_done(page)
        page.mouse.click(930, 120)
        page.wait_for_timeout(int(MORPH_CLOSE_DELAY + MORPH_CLOSE_MS * 0.3) + 20)
        during = morph_state(page)
        wait_bar_back(page)
        record("AK-3 morph Zuklappen rückwärts (Außenklick)", during["morph"] and during["w"] < 760 - 1,
               f"nach 80 ms + 30 % {during['w']:.0f}×{during['h']:.0f} px, Leiste zurück")
    finally:
        ctx.close()


def check_morph_reduced_mobile(browser, base_url):
    """AK-4 reduzierte Bewegung (0 ms, Endzustand sofort), AK-5 mobil Vollbild ohne Morph."""
    ctx, page = morph_page(browser, base_url, reduced_motion="reduce")
    try:
        morph_click(page)
        wait_open(page)
        s = morph_state(page)
        ok = s["dur"] == "0s" and not s["morph"] and abs(s["w"] - 760) <= 1 and abs(s["h"] - 520) <= 1 and s["op"] == 1
        record("AK-4 morph reduzierte Bewegung: sofort Endzustand", ok,
               f"transition-duration {s['dur']}, {s['w']:.0f}×{s['h']:.0f} px direkt nach dem Klick, Morph-Klassen: {s['morph']}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)
        closed = page.evaluate("() => window.__q('#anything-llm-chat').getBoundingClientRect().height === 0")
        record("AK-4 morph reduzierte Bewegung: Zuklappen sofort", closed, f"nach 50 ms zu: {closed}")
    finally:
        ctx.close()
    ctx, page = morph_page(browser, base_url, viewport=tv.MOBILE, css=None)
    try:
        morph_click(page)
        wait_open(page)
        tv.settle(page, 400)
        g = geom(page)
        vw, vh = page.evaluate("() => [innerWidth, innerHeight]")
        ok = (g["chatPos"] == "fixed" and abs(g["chat"]["w"] - vw) <= 1 and abs(g["chat"]["h"] - vh) <= 1
              and "allm-morph" not in g["cls"].replace("allm-effect-morph", "") and g["hostParent"] == "BODY")
        record("AK-5 morph mobil 390 px: Vollbild ohne Morph", ok,
               f"{g['chatPos']} {g['chat']['w']:.0f}×{g['chat']['h']:.0f} (Viewport {vw}×{vh}), Host in {g['hostParent']}")
    finally:
        ctx.close()


def check_morph_nak2(browser, base_url):
    """NAK-2: Klick in die Box auf halbem Weg -> keine Konsolenfehler, Endzustand erreicht."""
    ctx, page = morph_page(browser, base_url)
    try:
        morph_click(page)
        page.wait_for_timeout(int(MORPH_MS * 0.4))
        x, y = page.evaluate("() => { const r = window.__q('#anything-llm-chat').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
        page.mouse.click(x, y)
        page.wait_for_timeout(MORPH_MS + 300)
        s = morph_state(page)
        errs = tv.errors_of(page)
        ok = not errs and not s["morph"] and abs(s["w"] - 760) <= 1 and abs(s["h"] - 520) <= 1
        record("NAK-2 morph Klick auf halbem Weg", ok,
               f"Endzustand {s['w']:.0f}×{s['h']:.0f} px, Morph-Klassen: {s['morph']}, Konsole: {errs or 'leer'}")
    finally:
        ctx.close()


def check_morph_flow(browser, base_url):
    """NAK-3: im Seitenfluss Höhe monoton wachsend, #below am Ende wie bei expand."""
    shifts = {}
    for eff in ("morph", "expand"):
        attrs = {**MORPH_FLOW, "inline-effect": eff}
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, "css": MORPH_CSS}, tv.Mock())
        try:
            ready(page)
            before = geom(page)
            page.evaluate(MORPH_SAMPLER_JS)
            click_bar(page)
            wait_open(page)
            page.wait_for_timeout(MORPH_MS + 300)
            after = geom(page)
            shifts[eff] = after["below"]["dy"] - before["below"]["dy"]
            samples = page.evaluate("() => window.__ms")
            if eff == "morph":
                boxes = [sm["box"] for sm in samples]
                below = [sm["below"] for sm in samples]
                mono = all(b2 >= b1 - 0.5 for b1, b2 in zip(boxes, boxes[1:]))
                mono_below = all(b2 >= b1 - 0.5 for b1, b2 in zip(below, below[1:]))
                record("NAK-3 morph flow: Höhe monoton wachsend, Inhalt wandert mit", mono and mono_below and
                       boxes[0] < boxes[-1] and len(set(round(b) for b in boxes)) >= 6,
                       f"Box {boxes[0]:.0f} -> {boxes[-1]:.0f} px in {len(boxes)} Frames, #below monoton: {mono_below}, "
                       f"Konsole: {tv.errors_of(page) or 'leer'}")
        finally:
            ctx.close()
    record("NAK-3 morph flow: #below am Ende wie expand", abs(shifts["morph"] - shifts["expand"]) <= 1,
           f"#below Δ morph {shifts['morph']:+.1f} px, expand {shifts['expand']:+.1f} px")


# ---------------------------------------------------------------------------
# Issue „Morph flüssiger“: Frames, kein Scroll im Lauf, Schließen, Chips
# ---------------------------------------------------------------------------
# Jeden Frame (rAF) bis 1500 ms aufzeichnen — pro Frame nur, was kein Layout
# erzwingt: Zeitstempel, scrollY, Morph-Klassen am Fenster (die Messung soll
# den Lauf nicht selbst verlangsamen). Geometrie und Chips (Opacity,
# Sichtbarkeit) nur an festen Messpunkten: im ersten Frame mit Morph-Klasse
# und danach am ersten Frame ab jeder Marke (ms seit diesem Frame), plus im
# ersten Frame nach dem Lauf ("end"). Long Tasks per PerformanceObserver.
# Start direkt vor der Aktion (Klick bzw. Escape); ausgewertet wird das
# Fenster, in dem die Morph-Klassen am Fenster stehen (Lauf), plus der Frame
# davor.
MORPH_SAMPLES = [0, MORPH_MS * 0.5]
MORPH_REC_JS = r"""
(marks) => {
  const R = window.__mr = { f: [], s: [], end: null, lt: [], pre: scrollY, t0: performance.now() };
  try {
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => R.lt.push({ s: e.startTime, d: e.duration })));
    po.observe({ type: 'longtask' });
    R.po = po;
  } catch (e) { R.noLongtask = true; }
  let w = null;
  const win = () => (w && w.isConnected ? w : (w = window.__q('#anything-llm-chat')));
  const measure = (at, ts) => {
    const c = window.__q('#anything-llm-inline-chips');
    const cs = c && getComputedStyle(c);
    const ww = win();
    return { at, t: ts, w: ww ? ww.getBoundingClientRect().width : 0,
      chipOp: cs ? parseFloat(cs.opacity) : null, chipVis: cs ? cs.visibility : null,
      chipHidden: c ? !!c.closest('[aria-hidden="true"]') : null };
  };
  const todo = [...marks].sort((a, b) => a - b);
  let tm = null;
  const tick = (ts) => {
    const ww = win();
    const cl = ww && ww.classList;
    const morph = !!cl && (cl.contains('allm-morph') || cl.contains('allm-morph-from'));
    R.f.push({ t: ts, sy: scrollY, morph });
    if (morph && tm === null) tm = ts;
    if (tm !== null && morph) while (todo.length && ts - tm >= todo[0]) R.s.push(measure(todo.shift(), ts));
    if (tm !== null && !morph && !R.end) R.end = measure('end', ts);
    if (performance.now() - R.t0 < 1500) requestAnimationFrame(tick);
    else { R.done = true; R.po && R.po.disconnect(); }
  };
  requestAnimationFrame(tick);
}
"""


def morph_record(page, action, marks=None):
    """Aufzeichnen (Messpunkte marks in ms ab dem ersten Morph-Frame), Aktion
    ausführen, Ende der Aufzeichnung abwarten."""
    page.evaluate(MORPH_REC_JS, MORPH_SAMPLES if marks is None else marks)
    action()
    page.wait_for_function("() => window.__mr && window.__mr.done", timeout=5000)
    return page.evaluate("() => { const R = window.__mr; return { f: R.f, s: R.s, end: R.end, lt: R.lt, pre: R.pre,"
                         " noLongtask: !!R.noLongtask }; }")


def morph_window(rec):
    """Frames des Laufs: vom Frame vor dem ersten Morph-Frame bis zum ersten
    Frame danach ohne Morph-Klassen (Ende)."""
    f = rec["f"]
    idx = [i for i, x in enumerate(f) if x["morph"]]
    if not idx:
        return []
    a, b = max(idx[0] - 1, 0), min(idx[-1] + 1, len(f) - 1)
    return f[a:b + 1]


def frame_stats(win, lt):
    ts = [x["t"] for x in win]
    iv = [b - a for a, b in zip(ts, ts[1:])]
    ok = sum(1 for d in iv if d <= 20)
    t_a, t_b = (ts[0], ts[-1]) if ts else (0, 0)
    longs = [x for x in lt if x["d"] > 50 and x["s"] + x["d"] >= t_a - 50 and x["s"] <= t_b]
    return {"n": len(iv), "share": ok / len(iv) if iv else 0.0, "max": max(iv) if iv else 0,
            "dur": t_b - t_a, "long": len(longs)}


def morph_escape(page):
    page.evaluate("() => window.__q('#message-input').focus()")
    page.keyboard.press("Escape")


def check_morph_frames(browser, base_url):
    """ov-morph-frames (AK-3): rAF-Intervalle über Öffnen und Schließen, 3 Läufe,
    Median; Ziel ≥ 90 % ≤ 20 ms, keine Long Tasks > 50 ms im Lauf.
    AK-1: scrollY konstant zwischen Klick und Ende (Box im Viewport)."""
    import statistics
    ctx, page = morph_prepared(browser, base_url)
    try:
        runs = {"open": [], "close": []}
        widths = {"open": [], "close": []}
        scroll = []
        longtask_api = True
        for _ in range(3):
            rec = morph_record(page, lambda: morph_click(page))
            win = morph_window(rec)
            runs["open"].append(frame_stats(win, rec["lt"]))
            widths["open"].append([round(x["w"]) for x in rec["s"]] + ([round(rec["end"]["w"])] if rec["end"] else []))
            scroll.append(("open", rec["pre"], sorted({round(x["sy"], 1) for x in win})))
            longtask_api = longtask_api and not rec["noLongtask"]
            tv.settle(page, 300)
            page.mouse.move(990, 690)
            rec = morph_record(page, lambda: morph_escape(page))
            win = morph_window(rec)
            runs["close"].append(frame_stats(win, rec["lt"]))
            widths["close"].append([round(x["w"]) for x in rec["s"]] + ([round(rec["end"]["w"])] if rec["end"] else []))
            scroll.append(("close", rec["pre"], sorted({round(x["sy"], 1) for x in win})))
            wait_bar_back(page)
            tv.settle(page, 300)
            page.mouse.move(990, 690)
        g = geom(page)
        vh = page.evaluate("() => innerHeight")
        for phase in ("open", "close"):
            st = runs[phase]
            med = statistics.median(s["share"] for s in st)
            longs = sum(s["long"] for s in st)
            record(f"AK-3 ov-morph-frames {phase}: Median ≥ 90 % der rAF-Intervalle ≤ 20 ms", med >= 0.9 and longs == 0,
                   f"Median {med * 100:.1f} % (Läufe: " + ", ".join(
                       f"{s['share'] * 100:.1f} %/{s['n']} Int./max {s['max']:.1f} ms/{s['dur']:.0f} ms" for s in st)
                   + f"); Long Tasks > 50 ms im Lauf: {longs}" + ("" if longtask_api else " (Long-Task-API fehlt)")
                   + f"; Breite an den Messpunkten 0 %/50 %/Ende (nur dort Layout gelesen): {widths[phase]}")
        ok = all(len(v) == 1 and abs(v[0] - pre) < 0.5 for _, pre, v in scroll) and g["mount"]["y"] >= 0
        record("AK-1 morph overlay: kein Scroll während Öffnen/Schließen (Box im Viewport)", ok,
               "; ".join(f"{ph}: vorher {pre:.0f}, im Lauf {v}" for ph, pre, v in scroll) + f"; Viewport {vh} px")
    finally:
        ctx.close()


def check_morph_scroll_before(browser, base_url):
    """Box weit unten (ragt aus dem Viewport), Seite mit scroll-behavior: smooth.
    AK-1 overlay: scrollY bleibt ab dem Klick in jedem Frame gleich (wie das
    Mockup, die Box ragt unten heraus), kein Fokus ins unsichtbare
    Eingabefeld (Befund 2). NAK-1 flow: die Seite scrollt VOR dem ersten
    Morph-Frame ohne Animation, im Lauf nicht. Befund 1 flow-short: nur 100 px
    Inhalt unter dem Widget — Scroll gegen die Endgröße, kein Klemmen, kein
    Sprung bis nach dem Lauf, Box am Ende ganz sichtbar."""
    vp = {"width": 1280, "height": 900}
    css = MORPH_CSS + " html { scroll-behavior: smooth; }"
    for layout, attrs in (("overlay", {**MORPH, **INPUT}), ("flow", {**MORPH_FLOW, **INPUT}),
                          ("flow-short", {**MORPH_FLOW, **INPUT})):
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs, "inline": True, "css": css},
                                 tv.Mock(config=CFG_NO_MSGS, history=tv.HISTORY_ANSWER), viewport=vp)
        try:
            ready(page, "#anything-llm-inline-input")
            page.evaluate("() => { const s = document.createElement('div'); s.style.height = '560px'; s.textContent = 'Abstand';"
                          " document.getElementById('slot').before(s); }")
            if layout == "flow-short":
                # Inhalt unter dem Platzhalter (PAGE_JS) durch 100 px ersetzen
                page.evaluate("() => { const slot = document.getElementById('slot'); slot.nextElementSibling.remove();"
                              " const d = document.createElement('div'); d.style.height = '100px'; d.textContent = 'Fuß';"
                              " slot.after(d); }")
            tv.settle(page, 300)
            rec = morph_record(page, lambda: morph_click(page))
            win = morph_window(rec)
            sys_ = [round(x["sy"], 1) for x in win[1:]]
            box = page.evaluate("() => { const b = window.__q('#anything-llm-chat').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; }")
            errs = tv.errors_of(page)
            if layout == "overlay":
                focus = active_id(page)
                ok = (len(win) > 3 and set(sys_) == {round(rec["pre"], 1)} and box["bottom"] > box["vh"]
                      and focus != "message-input" and not errs)
                record("AK-1 morph overlay: Box ragt heraus, trotzdem kein Scroll, kein Fokus ins unsichtbare Feld", ok,
                       f"scrollY vorher {rec['pre']:.0f}, im Lauf {sorted(set(sys_))} ({len(win)} Frames), "
                       f"Box danach {box['top']:.0f}–{box['bottom']:.0f} px (Viewport {box['vh']} px), Seite smooth, "
                       f"Fokus im Widget: {focus}")
            elif layout == "flow-short":
                i0 = next((i for i, x in enumerate(rec["f"]) if x["morph"]), None)
                after = sorted({round(x["sy"], 1) for x in rec["f"][i0:]}) if i0 is not None else []
                doc = page.evaluate("() => ({ sh: document.documentElement.scrollHeight, sy: scrollY,"
                                    " mh: window.__q('#anything-llm-embed-inline').style.minHeight })")
                ok = (len(win) > 3 and len(after) == 1 and after[0] > rec["pre"] + 1 and box["top"] >= -0.5
                      and box["bottom"] <= box["vh"] + 0.5 and doc["mh"] == "" and not errs)
                record("Befund 1 morph flow, 100 px Inhalt darunter: Scroll gegen Endgröße, kein Sprung, Box ganz sichtbar", ok,
                       f"scrollY vorher {rec['pre']:.0f}, ab erstem Morph-Frame bis 1,5 s {after}; Box danach "
                       f"{box['top']:.0f}–{box['bottom']:.0f} px (Viewport {box['vh']} px); Dokument {doc['sh']} px, "
                       f"Reserve danach '{doc['mh']}'")
            else:
                ok = (len(win) > 3 and len(set(sys_)) == 1 and sys_[0] > rec["pre"] + 1 and box["top"] >= -0.5
                      and box["bottom"] <= box["vh"] + 0.5 and not errs)
                record("NAK-1 morph flow: Box außerhalb, Scroll vor dem Lauf, nicht währenddessen", ok,
                       f"scrollY vorher {rec['pre']:.0f}, im Lauf {sorted(set(sys_))} ({len(win)} Frames, erster "
                       f"Morph-Frame schon gescrollt), Box danach {box['top']:.0f}–{box['bottom']:.0f} px "
                       f"(Viewport {box['vh']} px), Seite smooth")
        finally:
            ctx.close()


def check_morph_close_timing(browser, base_url):
    """AK-2 (Timing wie das Mockup): Öffnen 720 ms expo, Schließen 480 ms
    cubic-bezier(.65,0,.35,1) nach 80 ms; Inhalt bei 50 % der Schließdauer
    schon aus, die Box steht in den ersten 80 ms noch (Inhalt blendet zuerst aus)."""
    ctx, page = morph_prepared(browser, base_url)
    style_js = ("() => { const cs = getComputedStyle(window.__q('#anything-llm-chat'));"
                " return { dur: cs.transitionDuration, ease: cs.transitionTimingFunction, delay: cs.transitionDelay }; }")
    try:
        morph_click(page)
        wait_morph_running(page)
        st_open = page.evaluate(style_js)
        wait_morph_done(page)
        tv.settle(page, 300)
        morph_escape(page)
        st_close = page.evaluate(style_js)
        # erst früh, dann 50 % (eine beendete Transition fällt aus getAnimations)
        page.evaluate(MORPH_SEEK_JS, MORPH_CLOSE_DELAY * 0.75)
        early = morph_state(page)
        page.evaluate(MORPH_SEEK_JS, MORPH_CLOSE_MS * 0.5)
        half = morph_state(page)
        page.evaluate(MORPH_PLAY_JS)
        wait_bar_back(page)

        def first(v):  # erster Wert einer Liste (Kommas in cubic-bezier überspringen)
            return re.split(r",\s*(?![^()]*\))", v)[0].strip()
        ok = (first(st_open["dur"]) == "0.72s" and first(st_open["ease"]) == "cubic-bezier(0.16, 1, 0.3, 1)"
              and first(st_open["delay"]) == "0s"
              and first(st_close["dur"]) == "0.48s" and first(st_close["ease"]) == "cubic-bezier(0.65, 0, 0.35, 1)"
              and first(st_close["delay"]) == "0.08s" and half["op"] == 0 and abs(early["w"] - 760) <= 1
              and 0 < early["op"] < 1)
        record("AK-2 morph Timing wie Mockup: Öffnen 720 ms, Schließen 480 ms nach 80 ms, Inhalt zuerst aus", ok,
               f"Öffnen {st_open['dur']} / {first(st_open['ease'])} / Verzögerung {first(st_open['delay'])}; "
               f"Schließen {st_close['dur']} / {first(st_close['ease'])} / Verzögerung {first(st_close['delay'])}; "
               f"Inhalt-Opacity bei 50 % der Schließdauer: {half['op']}; nach 60 ms Box {early['w']:.0f} px breit, "
               f"Inhalt-Opacity {early['op']:.2f}")
    finally:
        ctx.close()


def check_morph_chips(browser, base_url):
    """AK-4: Chips unter der Leiste blenden beim Öffnen weich aus (1 -> 0) und
    beim Schließen wieder ein, statt sofort zu verschwinden."""
    ctx, page = morph_prepared(browser, base_url)
    try:
        n_chips = page.evaluate("() => window.__allmShadow.querySelectorAll('.allm-inline-chip').length")
        # Messpunkte: Ausblenden 360 ms ab Lauf-Beginn, Einblenden 240 ms nach 80 ms
        rec = morph_record(page, lambda: morph_click(page), [0, 60, 120, 180, 240, 300])
        ops = [x["chipOp"] for x in rec["s"] if x["chipVis"] == "visible" and x["chipHidden"]]
        mid_open = [o for o in ops if 0.02 < o < 0.98]
        end_open = rec["end"]["chipVis"] if rec["end"] else None
        tv.settle(page, 300)
        page.mouse.move(990, 690)
        rec = morph_record(page, lambda: morph_escape(page), [0, 100, 150, 200, 250, 300])
        opsc = [x["chipOp"] for x in rec["s"] if x["chipVis"] == "visible" and x["chipHidden"]]
        mid_close = [o for o in opsc if 0.02 < o < 0.98]
        wait_bar_back(page)
        after = page.evaluate("() => { const c = window.__q('#anything-llm-inline-chips'); const cs = getComputedStyle(c); return { op: parseFloat(cs.opacity), vis: cs.visibility, cls: c.className }; }")
        ok = (n_chips > 0 and len(mid_open) >= 3 and ops and ops[0] > 0.9 and end_open == "hidden"
              and len(mid_close) >= 3 and after["op"] == 1 and after["vis"] == "visible"
              and "allm-morph-chips" not in after["cls"])
        record("AK-4 morph Chips blenden aus (Öffnen) und wieder ein (Schließen)", ok,
               f"{n_chips} Chips; Öffnen: {len(mid_open)}/6 Messpunkte mit 0<Opacity<1 (Start {ops[0] if ops else '-'}, "
               f"Ende {end_open}); Schließen: {len(mid_close)}/6 Messpunkte dazwischen "
               f"({', '.join(f'{o:.2f}' for o in opsc)}); danach Opacity {after['op']}, {after['vis']}")
    finally:
        ctx.close()


MORPH_CHIPS_REVERSE_JS = r"""
() => new Promise((res) => {
  const c = window.__q('#anything-llm-inline-chips');
  const op = () => parseFloat(getComputedStyle(c).opacity);
  const o1 = op();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const o2 = op();
  const v = c.style.getPropertyValue('--allmi-chips-o');
  requestAnimationFrame(() => requestAnimationFrame(() => res({ o1, o2, o3: op(), v, cls: c.className })));
})
"""


def check_morph_chips_reverse(browser, base_url):
    """Befund 4: Schließen, während die Chips noch ausblenden -> Einblenden
    ab der aktuellen Opacity (kein Sprung auf 0)."""
    ctx, page = morph_prepared(browser, base_url)
    try:
        morph_click(page)
        page.wait_for_function(
            "() => { const c = window.__q('#anything-llm-inline-chips'); const o = c && parseFloat(getComputedStyle(c).opacity);"
            " return c && c.classList.contains('allm-morph-chips-out') && o > 0.25 && o < 0.75; }",
            polling="raf", timeout=3000)
        r = page.evaluate(MORPH_CHIPS_REVERSE_JS)
        wait_bar_back(page)
        ok = (abs(r["o2"] - r["o1"]) < 0.05 and abs(r["o3"] - r["o1"]) < 0.1 and "allm-morph-chips-in" in r["cls"]
              and r["v"] != "" and not tv.errors_of(page))
        record("Befund 4 morph Chips: Umkehr beim Ausblenden ohne Opacity-Sprung", ok,
               f"Opacity vor Escape {r['o1']:.3f}, direkt danach {r['o2']:.3f}, 2 Frames später {r['o3']:.3f} "
               f"(--allmi-chips-o={r['v']})")
    finally:
        ctx.close()


# ---------------------------------------------------------------------------
# Zuklappen wie das Original (Issue embed-zeilenkarten-tasten-morph-
# datenschutz, AK-8, AK-10): Seite wie die Demo — Fläche zentriert, 600 px
# eingeklappt / 760 px aufgeklappt, umgeschaltet per MutationObserver
# (asynchron, wie demo app.js) mit Seiten-Transition max-width 500 ms; bei
# schmalem Fenster schrumpfen beide (60 vw / 80 vw).
# ---------------------------------------------------------------------------
DEMO_CLOSE_CSS = ("main { max-width: none; } #slot { max-width: min(600px, 60vw); margin: 0 auto; "
                  "transition: max-width 500ms cubic-bezier(.16,1,.3,1); } "
                  "#slot.is-open { max-width: min(760px, 80vw); } "
                  "#anythingllm-embed-widget { --allm-bar-radius: 999px; --allm-radius: 40px; }")
DEMO_CLOSE_JS = r"""
(() => {
  const hook = () => {
    const ph = document.getElementById('kufer-assistent');
    if (!ph) return requestAnimationFrame(hook);
    new MutationObserver(() => document.getElementById('slot').classList.toggle('is-open',
      ph.getAttribute('data-allm-expanded') === 'true')).observe(ph, { attributes: true,
      attributeFilter: ['data-allm-expanded'] });
  };
  hook();
  // Zeitpunkt der Nutzeraktion (Klick/Escape), Bezug für den Rekorder
  const mark = () => { window.__t0 = performance.now(); };
  document.addEventListener('pointerdown', mark, true);
  document.addEventListener('keydown', mark, true);
})();
"""
# Rechteck des Chat-Fensters + Breite des Hosts je Frame, nicht-blockierend
# (Ergebnis in window.__rec; evaluate wartet sonst ein Promise ab). Gemessen
# wird im Task NACH dem Frame (rAF -> setTimeout 0): das ist der gemalte
# Stand. Direkt im rAF-Callback sähe der Rekorder die Seiten-Transition
# schon im neuen Frame, die Box-Nachführung des Widgets (eigener rAF-
# Callback, läuft danach, vor dem Malen) aber noch im alten.
CLOSE_REC_JS = r"""(ms) => { const out = []; window.__rec = null; window.__t0 = null;
  const host = document.getElementById('anythingllm-embed-widget');
  const start = performance.now();
  const step = () => setTimeout(sample, 0);
  const sample = () => { const w = window.__q('#anything-llm-chat'); const r = w ? w.getBoundingClientRect() : null;
    const h = host.getBoundingClientRect();
    out.push({ t: performance.now(), x: r ? r.x : null, w: r ? r.width : 0, h: r ? r.height : 0,
      hostW: h.width, hostX: h.x, cls: w ? /allm-morph/.test(w.className) : false,
      close: w ? w.classList.contains('allm-morph-close') : false });
    if (performance.now() - start < ms) requestAnimationFrame(step);
    else window.__rec = { frames: out, t0: window.__t0 }; };
  requestAnimationFrame(step); return true; }"""


def demo_close_page(browser, base_url, viewport):
    ctx, page = tv.open_page(browser, base_url, {"attrs": {**MORPH, **INPUT}, "inline": True, "css": DEMO_CLOSE_CSS},
                             tv.Mock(config=CFG_NO_MSGS, history=tv.HISTORY_ANSWER), viewport=viewport,
                             before_goto=lambda c, p: c.add_init_script(DEMO_CLOSE_JS))
    ready(page, "#anything-llm-inline-input")
    tv.settle(page, 600)
    return ctx, page


def demo_open(page):
    morph_click(page)
    wait_open(page)
    wait_morph_done(page)
    tv.settle(page, 700)  # Seiten-Transition (500 ms) vorbei


def analyse_close(rec):
    fr, t0 = rec["frames"], rec["t0"]
    for f in fr:
        f["t"] = f["t"] - t0
    run = [f for f in fr if f["cls"] and f["t"] >= 0]
    last = run[-1] if run else None
    end_t = last["t"] if last else None
    at350 = min(fr, key=lambda f: abs(f["t"] - 350))
    after = [f for f in fr if end_t is not None and end_t < f["t"] <= end_t + 600]
    host_span = (max(f["hostW"] for f in after) - min(f["hostW"] for f in after)) if after else None
    return run, last, at350, after, host_span


def check_morph_close_geometry(browser, base_url):
    """::morph-close-geometry (AK-8) — Einklappen-Knopf, Klick außerhalb,
    Escape: bei t ≈ 350 ms läuft die Breite (610 < w < 740), der letzte Frame
    des Laufs = Leistenform (± 1 px, auch x), nach dem Lauf bewegt sich der
    Host nicht mehr (< 1 px bis +600 ms). Seite schaltet asynchron mit eigener
    Transition um (wie die Demo)."""
    vp = {"width": 1280, "height": 1400}
    ctx, page = demo_close_page(browser, base_url, vp)
    try:
        bar = pill_rect(page)
        for how in ("Knopf", "Außenklick", "Escape"):
            demo_open(page)
            panel = morph_state(page)
            page.evaluate(CLOSE_REC_JS, 1500)
            page.wait_for_timeout(40)
            if how == "Knopf":
                page.mouse.click(*page.evaluate(
                    "() => { const r = window.__q('button[aria-label=\"Einklappen\"]').getBoundingClientRect();"
                    " return [r.x + r.width / 2, r.y + r.height / 2]; }"))
            elif how == "Außenklick":
                page.mouse.click(40, 1300)
            else:
                page.evaluate("() => window.__q('#message-input').focus()")
                page.keyboard.press("Escape")
            page.wait_for_function("() => window.__rec !== null", timeout=5000)
            rec = page.evaluate("() => window.__rec")
            run, last, at350, after, host_span = analyse_close(rec)
            ok = (bool(run) and 610 < at350["w"] < 740
                  and abs(last["w"] - bar["w"]) <= 1 and abs(last["h"] - bar["h"]) <= 1
                  and abs(last["x"] - bar["x"]) <= 1 and host_span is not None and host_span < 1)
            record(f"AK-8 morph-close-geometry ({how}): Breite+Höhe in einem Lauf, danach Ruhe", ok,
                   f"Panel {panel['w']:.0f}×{panel['h']:.0f} @ {panel['x']:.0f}; t≈{at350['t']:.0f} ms: "
                   f"{at350['w']:.1f}×{at350['h']:.1f} @ {at350['x']:.1f}; letzter Lauf-Frame t={last['t'] if last else None:.0f} ms "
                   f"{last['w']:.1f}×{last['h']:.1f} @ {last['x']:.1f} (Leiste {bar['w']:.0f}×{bar['h']:.0f} @ {bar['x']:.0f}); "
                   f"Host-Breite bis +600 ms nach Laufende: Spanne {host_span:.2f} px ({len(after)} Frames)"
                   if last else f"kein Lauf: {len(rec['frames'])} Frames")
            # Breite fällt monoton (kein Ausbeulen nach rechts/links)
            rights = [f["x"] + f["w"] for f in run]
            lefts = [f["x"] for f in run]
            mono = all(b <= a + 0.5 for a, b in zip(rights, rights[1:])) and all(
                b >= a - 0.5 for a, b in zip(lefts, lefts[1:]))
            record(f"AK-8 morph-close: linke Kante nur nach rechts, rechte nur nach links ({how})", mono,
                   f"links {lefts[0]:.0f}->{lefts[-1]:.0f}, rechts {rights[0]:.0f}->{rights[-1]:.0f}" if run else "-")
            wait_bar_back(page)
            tv.settle(page, 300)
            page.mouse.move(1200, 1350)
    finally:
        ctx.close()


def check_morph_close_after_resize(browser, base_url):
    """::morph-close-after-resize (AK-10) — Panel offen, Fenster 1280 -> 900
    (Leiste jetzt 540 statt 600 px): der Lauf endet auf der neuen Leiste,
    kein Sprung danach."""
    ctx, page = demo_close_page(browser, base_url, {"width": 1280, "height": 1400})
    try:
        demo_open(page)
        page.set_viewport_size({"width": 900, "height": 1400})
        page.wait_for_timeout(800)
        page.evaluate(CLOSE_REC_JS, 1500)
        page.wait_for_timeout(40)
        page.mouse.click(*page.evaluate(
            "() => { const r = window.__q('button[aria-label=\"Einklappen\"]').getBoundingClientRect();"
            " return [r.x + r.width / 2, r.y + r.height / 2]; }"))
        page.wait_for_function("() => window.__rec !== null", timeout=5000)
        rec = page.evaluate("() => window.__rec")
        wait_bar_back(page)
        tv.settle(page, 300)
        bar = pill_rect(page)
        run, last, at350, after, host_span = analyse_close(rec)
        ok = (bool(run) and abs(last["w"] - bar["w"]) <= 1 and abs(last["h"] - bar["h"]) <= 1
              and abs(last["x"] - bar["x"]) <= 1 and host_span is not None and host_span < 1 and bar["w"] < 590)
        record("AK-10 morph-close-after-resize: Lauf endet auf der neuen Leiste, kein Sprung danach", ok,
               f"neue Leiste {bar['w']:.0f}×{bar['h']:.0f} @ {bar['x']:.0f}; letzter Lauf-Frame "
               f"{last['w']:.1f}×{last['h']:.1f} @ {last['x']:.1f}; Host-Spanne danach {host_span:.2f} px"
               if last else "kein Lauf")
    finally:
        ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="fehlende Referenz-Screenshots erzeugen")
    ap.add_argument("--new-states", action="store_true", help="mit --baseline: Referenzen der neuen Zustände")
    ap.add_argument("--dist", default=str(ROOT / "dist"), help="Verzeichnis mit dem gebauten Widget")
    ap.add_argument("--only", nargs="*", help="nur diese Pixel-Zustände")
    args = ap.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    srv, base_url = tv.start_server(args.dist)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            run_pixel(browser, base_url, args.baseline, args.new_states, args.only)
            run_morph_pixel(browser, base_url, args.baseline, args.new_states, args.only)
            if not args.baseline:
                check_default_shift(browser, base_url)
                check_ak2(browser, base_url)
                check_ak3(browser, base_url)
                check_ak4(browser, base_url)
                check_ak5(browser, base_url)
                check_ak6(browser, base_url)
                check_ak7(browser, base_url)
                check_ak8(browser, base_url)
                check_nak1(browser, base_url)
                check_nak2(browser, base_url)
                check_touch_outside(browser, base_url)
                check_escape_page_field(browser, base_url)
                check_reentry(browser, base_url)
                check_scroll_after_send(browser, base_url)
                check_default_no_animation(browser, base_url)
                check_warn(browser, base_url)
                check_nak4(browser, base_url)
                check_fallback(browser, base_url)
                check_signal(browser, base_url)
                check_morph(browser, base_url)
                check_morph_reduced_mobile(browser, base_url)
                check_morph_nak2(browser, base_url)
                check_morph_flow(browser, base_url)
                check_morph_close_timing(browser, base_url)
                check_morph_close_geometry(browser, base_url)
                check_morph_close_after_resize(browser, base_url)
                check_morph_chips(browser, base_url)
                check_morph_chips_reverse(browser, base_url)
                check_morph_scroll_before(browser, base_url)
                check_morph_frames(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    failed = [r for r in tv.RESULTS if not r[1]]
    print(f"\n{len(tv.RESULTS) - len(failed)}/{len(tv.RESULTS)} Prüfungen bestanden.")
    (RESULTS_DIR / "summary-overlay.json").write_text(
        json.dumps([{"check": k, "ok": ok, "detail": d} for k, ok, d in tv.RESULTS], ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
