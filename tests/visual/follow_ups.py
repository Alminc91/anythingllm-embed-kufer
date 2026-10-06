#!/usr/bin/env python3
"""Playwright-Tests: Folgefragen als Pillen unter der letzten Antwort
(data-follow-ups="pills", Chunk "followUps" vom Server, Fork >= 7.14).

Einrichtung wie tests/visual/theme_visual.py (requirements.txt + chromium).

Aufruf (aus dem Repo-Wurzelverzeichnis):

  # 1) Referenzen der NEUEN Zustände (gibt es auf main nicht) aus diesem Branch,
  #    nur fehlende Dateien, bestehende werden nie überschrieben
  python3 tests/visual/follow_ups.py --baseline --new-states [--only fu-pills …]

  # 2) Prüfen (npm run build vorher)
  python3 tests/visual/follow_ups.py

Standard ohne Attribut: Bestands-Referenzen (bubble-open-answer,
bubble-streamed aus theme_visual) mit Folgefragen-Daten im Verlauf bzw. im
Stream -> 0,0 % (AK-5). Alle Aufrufe gemockt; stream-chat-Anfragen gezählt.
Ergebnisse: tests/visual/results/follow-ups-*.png, summary-follow-ups.json.
"""

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import theme_visual as tv  # noqa: E402
import inline_input as ii  # noqa: E402  (CountingMock)
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = tv.ROOT
BASELINE_DIR = tv.BASELINE_DIR
RESULTS_DIR = tv.RESULTS_DIR
record = tv.record

FU = ["Gibt es auch B1-Kurse?", "Gibt es Englisch online?"]
ANSWER = "Ja, es gibt passende Englischkurse. Termine finden Sie [auf der Kursseite](https://example.org/kurse)."
LINE = f"[[FRAGEN: {FU[0]} | {FU[1]}]]"
OPEN = {**tv.BASE_ATTRS, "open-on-load": "on"}
PILLS = {**OPEN, "follow-ups": "pills"}
QUESTION = "Gibt es Englischkurse?"


def stream(text=ANSWER, follow_ups=FU, close=True, uuid="u-1"):
    ev = [{"uuid": uuid, "type": "textResponseChunk", "close": False, "sources": [], "textResponse": text}]
    if close:
        ev.append({"uuid": uuid, "type": "textResponseChunk", "close": True, "sources": [], "textResponse": ""})
    if follow_ups is not None:
        ev.append({"uuid": uuid, "type": "followUps", "followUps": follow_ups, "close": False, "error": False})
    if close:
        ev.append({"uuid": uuid, "type": "finalizeResponseStream", "close": True, "error": False, "chatId": 4712})
    return ev


HISTORY = [
    {"role": "user", "content": "Gibt es Yogakurse?", "sentAt": tv.SENT_AT},
    {"role": "assistant", "content": "Ja, dienstags um 19 Uhr.", "sentAt": tv.SENT_AT + 5, "chatId": 1,
     "followUps": ["Alte Folgefrage?"]},
    {"role": "user", "content": QUESTION, "sentAt": tv.SENT_AT + 60},
    {"role": "assistant", "content": ANSWER, "sentAt": tv.SENT_AT + 65, "chatId": 2, "followUps": FU},
]


class SeqMock(ii.CountingMock):
    """Wie CountingMock; jede stream-chat-Anfrage bekommt eine eigene uuid
    (wie der echte Server), sonst überschriebe die zweite Antwort die erste."""

    def __init__(self, *a, make=None, **k):
        super().__init__(*a, **k)
        self.make = make

    def handle(self, route):
        if self.make and route.request.url.split("?")[0].endswith("/stream-chat"):
            self.stream = self.make(f"u-{len(self.stream_requests) + 1}")
        return super().handle(route)


def mock(**k):
    k.setdefault("stream", stream())
    return ii.CountingMock(**k)


def send(page, question=QUESTION):
    page.evaluate("() => window.__q('#message-input').focus()")
    page.keyboard.type(question)
    page.keyboard.press("Enter")


def wait_pills(page, timeout=10000):
    page.wait_for_function(
        "() => !!window.__q('#anything-llm-follow-ups') && !!window.__q('.allm-reply a, .allm-anything-llm-assistant-message a')",
        timeout=timeout)


# (name, cfg, mock, viewport, theme)
def pixel_cases():
    return [
        ("fu-pills", {"attrs": PILLS}, mock(), None),
        ("fu-pills-dark", {"attrs": {**PILLS, "theme": "dark"}}, mock(), None),
        ("fu-pills-mobile", {"attrs": PILLS}, mock(), tv.MOBILE),
        ("fu-pills-history", {"attrs": PILLS}, mock(history=HISTORY), None),
    ]


def shoot(browser, base_url, case, out_path):
    name, cfg, m, viewport = case
    freeze = lambda c, p: p.clock.set_fixed_time(tv.SENT_AT)  # noqa: E731
    ctx, page = tv.open_page(browser, base_url, cfg, m, viewport=viewport, before_goto=freeze)
    try:
        tv.wait_shadow(page, "#message-input")
        if not m.history:
            send(page)
        wait_pills(page)
        tv.settle(page)
        page.mouse.move(0, 0)
        page.evaluate("() => window.__allmShadow.activeElement && window.__allmShadow.activeElement.blur()")
        page.wait_for_timeout(100)
        page.screenshot(path=str(out_path), animations="disabled", caret="hide")
        return tv.errors_of(page)
    finally:
        ctx.close()


def run_pixel(browser, base_url, baseline, new_states, only=None):
    for case in pixel_cases():
        name = case[0]
        if only and name not in only:
            continue
        if baseline:
            if not new_states:
                continue  # alle Zustände sind neu (Referenz aus diesem Branch)
            out = BASELINE_DIR / f"{name}.png"
            if out.exists():
                print(f"[SKIP] {name}: Referenz existiert (wird nie überschrieben)")
                continue
            errs = shoot(browser, base_url, case, out)
            print(f"[BASE] {name} -> {out.relative_to(ROOT)}" + (f" (Konsole: {errs})" if errs else ""))
            continue
        out = RESULTS_DIR / f"follow-ups-{name}.png"
        errs = shoot(browser, base_url, case, out)
        ref = BASELINE_DIR / f"{name}.png"
        if not ref.exists():
            record(f"REG {name}", False, "keine Referenz (erst --baseline --new-states laufen lassen)")
            continue
        ratio, maxd = tv.diff_ratio(ref, out, RESULTS_DIR / f"follow-ups-{name}.diff.png")
        record(f"REG {name}", ratio <= tv.MAX_DIFF_RATIO and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""))


def run_default_pixel(browser, base_url):
    """AK-5: ohne data-follow-ups pixelgleich zu den Bestands-Referenzen,
    obwohl Verlauf bzw. Stream Folgefragen tragen."""
    hist = [dict(m) for m in tv.HISTORY_ANSWER]
    hist[1]["followUps"] = FU
    streamed = [{"uuid": "u-1", "type": "textResponseChunk", "close": False, "sources": [],
                 "textResponse": "Ja. Termine finden Sie [auf der Kursseite](https://example.org/kurse)."},
                {"uuid": "u-1", "type": "followUps", "followUps": FU}]
    cases = [
        ("bubble-open-answer", {"attrs": OPEN}, tv.Mock(history=hist),
         ".allm-anything-llm-assistant-message a", None),
        ("bubble-streamed", {"attrs": OPEN}, tv.Mock(stream=streamed), "#message-input", "send"),
    ]
    for case in cases:
        name = case[0]
        out = RESULTS_DIR / f"follow-ups-default-{name}.png"
        errs = tv.screenshot_case(browser, base_url, case, out)
        ratio, maxd = tv.diff_ratio(BASELINE_DIR / f"{name}.png", out,
                                    RESULTS_DIR / f"follow-ups-default-{name}.diff.png")
        record(f"AK-5 ohne Attribut pixelgleich ({name} mit Folgefragen-Daten)", ratio == 0 and not errs,
               f"Pixel-Diff {ratio * 100:.4f} % (max. Kanal-Abw. {maxd})" + (f", Konsole: {errs}" if errs else ""))


# ---------------------------------------------------------------------------
# Funktionsprüfungen
# ---------------------------------------------------------------------------
PROBE = """() => {
  const wrap = window.__q('#anything-llm-follow-ups');
  const bubbles = [...window.__allmShadow.querySelectorAll('.allm-anything-llm-assistant-message')];
  const last = bubbles[bubbles.length - 1];
  const all = window.__allmShadow.querySelectorAll('#anything-llm-follow-ups').length;
  const text = window.__allmShadow.textContent;
  if (!wrap) return { count: all, pills: [], text };
  const lb = last.getBoundingClientRect();
  const win = window.__q('#anything-llm-chat').getBoundingClientRect();
  return {
    count: all,
    group: wrap.getAttribute('role'), label: wrap.getAttribute('aria-label'),
    belowLast: wrap.getBoundingClientRect().top >= lb.bottom - 0.5,
    pills: [...wrap.querySelectorAll('button')].map(b => {
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
      return { text: b.textContent, h: Math.round(r.height), left: Math.round(r.left), bubbleLeft: Math.round(lb.left),
               right: r.right, winRight: win.right, border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
               borderColor: cs.borderTopColor, color: cs.color, radius: parseFloat(cs.borderTopLeftRadius) };
    }),
    text,
  };
}"""


def check_stream_and_click(browser, base_url):
    m = SeqMock(stream=stream(), make=lambda uuid: stream(uuid=uuid))
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, m)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        wait_pills(page)
        tv.settle(page, 400)
        st = page.evaluate(PROBE)
        accent = page.evaluate("() => getComputedStyle(window.__q('#anything-llm-chat')).getPropertyValue('--allmi-accent').trim()")
        pills = st["pills"]
        ok = (st["count"] == 1 and [p["text"] for p in pills] == FU and st["belowLast"]
              and st["group"] == "group" and st["label"]
              and all(p["border"] == "1px solid" and p["borderColor"] == p["color"] and p["h"] <= 34
                      and p["radius"] >= p["h"] / 2 and p["right"] <= p["winRight"] + 0.5 for p in pills)
              and "FRAGEN" not in st["text"])
        record("AK-2 zwei Pillen unter der letzten Antwort (Akzent-Rand und -Schrift, ≤ 34 px)", ok,
               json.dumps({**{k: st[k] for k in ("count", "belowLast", "group", "label")}, "accent": accent,
                           "pills": [{k: p[k] for k in ("text", "h", "border", "borderColor", "color", "left",
                                                        "bubbleLeft")} for p in pills]}, ensure_ascii=False))
        page.evaluate("() => { const b = window.__q('#anything-llm-follow-ups button'); b.click(); b.click(); }")
        ii.wait_user_and_token(page, FU[0], token="Ja, es gibt passende")
        page.wait_for_timeout(600)
        sent = [r.get("message") for r in m.stream_requests]
        users = page.evaluate(
            "() => [...window.__allmShadow.querySelectorAll('.allm-anything-llm-user-message')].map(e => e.textContent.trim())")
        record("AK-2 Klick sendet genau eine Anfrage mit dem Text, Verlauf bleibt",
               sent == [QUESTION, FU[0]] and users == [QUESTION, FU[0]],
               f"stream-chat: {sent}, Nutzer: {users}")
        # die neue Antwort bekommt (gleicher Mock) wieder Pillen -> genau eine Gruppe, unter der letzten
        wait_pills(page)
        st2 = page.evaluate(PROBE)
        record("AK-2 nach dem Klick: alte Pillen weg, nur unter der neuen letzten Antwort",
               st2["count"] == 1 and st2["belowLast"], json.dumps({k: st2[k] for k in ("count", "belowLast")}))
    finally:
        ctx.close()


def check_history(browser, base_url):
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, mock(history=HISTORY))
    try:
        tv.wait_shadow(page, "#anything-llm-follow-ups")
        tv.settle(page, 400)
        st = page.evaluate(PROBE)
        ok = (st["count"] == 1 and [p["text"] for p in st["pills"]] == FU and st["belowLast"]
              and "Alte Folgefrage" not in st["text"])
        record("AK-2 Verlauf neu geladen: Pillen nur unter der letzten Nachricht", ok,
               json.dumps({"count": st["count"], "pills": [p["text"] for p in st["pills"]]}, ensure_ascii=False))
    finally:
        ctx.close()


def check_no_pills_while_streaming(browser, base_url):
    """NAK-2: Antwort ohne Abschluss (streamt noch) -> keine Pillen, auch wenn
    der Chunk followUps schon da ist; NAK-3: Endzeile (älterer Server) nie
    sichtbar."""
    m = mock(stream=stream(close=False))
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, m)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        page.wait_for_function("() => !!window.__q('.allm-reply a')", timeout=10000)
        tv.settle(page, 500)
        st = page.evaluate(PROBE)
        record("NAK-2 keine Pillen während des Streamings", st["count"] == 0, json.dumps({"count": st["count"]}))
    finally:
        ctx.close()
    m = mock(stream=stream(text=f"{ANSWER}\n{LINE}", follow_ups=None))
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, m)
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        wait_pills(page)
        tv.settle(page, 400)
        st = page.evaluate(PROBE)
        ok = "FRAGEN" not in st["text"] and [p["text"] for p in st["pills"]] == FU
        record("NAK-3 Endzeile eines älteren Servers nie sichtbar (Übergangs-Abwehr), Pillen daraus", ok,
               json.dumps({"pills": [p["text"] for p in st["pills"]]}, ensure_ascii=False))
    finally:
        ctx.close()


def check_default_dom(browser, base_url):
    """AK-5 (DOM): ohne Attribut bzw. mit "none" keine Pillen."""
    for name, attrs in (("ohne Attribut", OPEN), ("none", {**OPEN, "follow-ups": "none"})):
        ctx, page = tv.open_page(browser, base_url, {"attrs": attrs}, mock())
        try:
            tv.wait_shadow(page, "#message-input")
            send(page)
            page.wait_for_function("() => !!window.__q('.allm-anything-llm-assistant-message a')", timeout=10000)
            tv.settle(page, 500)
            st = page.evaluate(PROBE)
            record(f"AK-5 {name}: keine Pillen", st["count"] == 0 and "FRAGEN" not in st["text"],
                   json.dumps({"count": st["count"]}))
        finally:
            ctx.close()


def check_mobile_wrap(browser, base_url):
    long_fu = ["Gibt es auch Englischkurse am Wochenende in Rhein?", "Gibt es Englisch für Senioren mit Vorkenntnissen?"]
    ctx, page = tv.open_page(browser, base_url, {"attrs": PILLS}, mock(stream=stream(follow_ups=long_fu)),
                             viewport={"width": 360, "height": 740})
    try:
        tv.wait_shadow(page, "#message-input")
        send(page)
        wait_pills(page)
        tv.settle(page, 400)
        st = page.evaluate(PROBE)
        page_w = page.evaluate("() => document.documentElement.scrollWidth")
        ok = (len(st["pills"]) == 2 and all(p["right"] <= p["winRight"] + 0.5 for p in st["pills"])
              and page_w <= 360 and [p["text"] for p in st["pills"]] == long_fu)
        record("Pillen bei 360 px im Fenster, voller Text (Umbruch statt Kürzung)", ok,
               json.dumps({"pageWidth": page_w, "pills": [{k: p[k] for k in ("text", "h", "right", "winRight")}
                                                          for p in st["pills"]]}, ensure_ascii=False))
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
            if not args.baseline:
                run_default_pixel(browser, base_url)
                check_default_dom(browser, base_url)
                check_stream_and_click(browser, base_url)
                check_history(browser, base_url)
                check_no_pills_while_streaming(browser, base_url)
                check_mobile_wrap(browser, base_url)
            browser.close()
    finally:
        srv.shutdown()

    if args.baseline:
        return 0
    failed = [r for r in tv.RESULTS if not r[1]]
    print(f"\n{len(tv.RESULTS) - len(failed)}/{len(tv.RESULTS)} Prüfungen bestanden.")
    (RESULTS_DIR / "summary-follow-ups.json").write_text(
        json.dumps([{"check": k, "ok": ok, "detail": d} for k, ok, d in tv.RESULTS], ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
