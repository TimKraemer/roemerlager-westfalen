#!/usr/bin/env python3
"""
Flüsse und Bäche von den Kreiskarten Lübbecke (1844) und Minden (1843)
nachzeichnen. Ergebnis: public/precomputed/fluesse-kreiskarten.geojson für die
Ebene „Flüsse und Bäche der Kreiskarten 1843/44“, die im Kreis
Minden-Lübbecke die anderen alten Flussläufe ersetzt. Die Weser setzt
„weser“ zusätzlich in src/data/fluesse.json ein.

Auf den Kreiskarten sind Bäche schwarze, fein geschlängelte Linien, Wege
glatte, blau sind die Gemeindegrenzen. Eine Suche, die sich nur an
Dunkelheit hält, springt auf parallele Wege. Deshalb liegen die Stützpunkte
jedes Gewässers in scripts/altkarten/fluesse/<karte>/<name>.json, in Pixeln
des Scans:

1. vorschlag: alle 70 px entlang des heutigen Laufs (OSM), auf die nächste
   schwarze Linie gezogen, nur im Kreisgebiet der Karte
   (fluesse/kreisgebiet.json).
2. Prüfbilder (kacheln, bogen) ansehen, falsche Punkte mit punkt oder
   ersetze von Hand setzen, etwa wo der alte Lauf eine heute abgeschnittene
   Schleife nahm.
3. Zwischen zwei Stützpunkten rastet der Lauf in einem schmalen Band auf die
   schwarze Linie ein (hellster Farbkanal, damit das Blau der Grenzen nicht
   zählt). Breite Flüsse (Weser, Werre) sind zwei Uferlinien, mitte setzt
   die Punkte auf die Strommitte, der Lauf ist dann eine Spline ohne
   Einrasten.
4. pruefe markiert Abschnitte, die glatt wie ein Weg verlaufen. Bei Bächen
   ohne "geprueft": true gelten sie nicht als nachgezeichnet. Durchgesehene
   Flüsse mit Doppellinie (Bastau, Große Aue) tragen "geprueft".
5. geojson baut daraus ein Netz ohne Lücken (build_network): der heutige
   Lauf jedes benannten Gewässers, darin die nachgezeichneten Stücke, jede
   Teilstrecke mit ihrer Herkunft.

Die Lage kommt aus der Entzerrung in scripts/altkarten/gcp/<karte>.json
(Feinpasspunkte gegen die Uraufnahme, siehe feinpass.py). maske stellt die
Karten für alt.py tiles frei.

  scripts/altkarten/nachzeichnen.sh leit                       heutige Gewässer im Kreis
  scripts/altkarten/nachzeichnen.sh bogen <karte> <name> [--px x0,y0,x1,y1]
                                                               Prüfbilder mit Raster
  scripts/altkarten/nachzeichnen.sh vorschlag <karte> [name …] [--neu]
                                                               Stützpunkte entlang des heutigen Laufs
  scripts/altkarten/nachzeichnen.sh kacheln <karte> [cx,cy …]  Prüfbilder je 1000-px-Kachel
  scripts/altkarten/nachzeichnen.sh ersetze <karte> <name> <teil> <von> <bis> x,y …
  scripts/altkarten/nachzeichnen.sh punkt <karte> <name> teil.i=x,y …
                                                               Stützpunkte von Hand setzen
  scripts/altkarten/nachzeichnen.sh mitte <karte> <name>       breite Flüsse auf die Strommitte
  scripts/altkarten/nachzeichnen.sh pruefe <karte>             Abschnitte, die eher Weg als Bach sind
  scripts/altkarten/nachzeichnen.sh geojson                    Ergebnis schreiben
  scripts/altkarten/nachzeichnen.sh weser                      Weser in src/data/fluesse.json einsetzen
  scripts/altkarten/nachzeichnen.sh maske [karte …]            Kreisgebiet freistellen
"""

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd
from skimage.graph import MCP_Geometric

sys.path.insert(0, str(Path(__file__).resolve().parent))
from alt import SRC_DIR, Warp, load_spec, merc, unmerc  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
POINTS = HERE / "fluesse"
CACHE = HERE / ".cache"
OUT = ROOT / "public" / "precomputed" / "fluesse-kreiskarten.geojson"
KREIS = ROOT / "src" / "data" / "kreis-minden-luebbecke.json"
MAPS = ["1844-kreis-luebbecke", "1843-kreis-minden"]
# Halbe Bandbreite beim Einrasten, Kartenpixel (etwa 8 m)
BAND = 9


def font(size, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for d in ("/usr/share/fonts/truetype/dejavu/", "/usr/share/fonts/TTF/"):
        if Path(d + name).exists():
            return ImageFont.truetype(d + name, size)
    return ImageFont.load_default()


class Karte:
    def __init__(self, map_id):
        self.id = map_id
        self.spec = load_spec(map_id)
        self.warp = Warp(self.spec)
        self._img = None

    @property
    def img(self):
        if self._img is None:
            self._img = Image.open(SRC_DIR / self.spec["file"]).convert("RGB")
        return self._img

    def to_px(self, lonlat):
        lonlat = np.asarray(lonlat, float)
        mx, my = merc(lonlat[:, 0], lonlat[:, 1])
        return self.warp.to_px(np.column_stack([mx, my]))

    def to_lonlat(self, px):
        m = self.warp.to_merc(np.asarray(px, float))
        lon, lat = unmerc(m[:, 0], m[:, 1])
        return np.column_stack([lon, lat])


def load_points(map_id):
    """{name: {"kind", "snap", "parts": [[[x, y], ...], ...]}} je Karte."""
    d = POINTS / map_id
    if not d.exists():
        return {}
    return {f.stem: json.loads(f.read_text()) for f in sorted(d.glob("*.json"))}


def save_points(map_id, name, entry):
    d = POINTS / map_id
    d.mkdir(parents=True, exist_ok=True)
    # eine Zeile je Teilstück, damit Änderungen im Diff lesbar bleiben
    parts = ",\n\t\t".join(json.dumps([[round(x), round(y)] for x, y in p]) for p in entry["parts"])
    head = {k: v for k, v in entry.items() if k != "parts"}
    text = json.dumps(head, ensure_ascii=False)[:-1] + f', "parts": [\n\t\t{parts}\n\t]}}\n'
    (d / f"{name}.json").write_text(text)


# --- Einrasten ----------------------------------------------------------------


def ink_image(rgb):
    """Schwarze Linien: hellster Kanal deutlich dunkler als die Umgebung."""
    lum = np.asarray(rgb, np.float32).max(-1)
    return np.clip(nd.uniform_filter(lum, 13) - lum, 0, 80) / 80


def snap(img, pts, raw=False):
    """Lauf zwischen den Stützpunkten auf der schwarzen Kartenlinie. Mit
    raw=True ungeglättet, für das Maß der Schlängelung."""
    pts = np.asarray(pts, float)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        m = BAND + 6
        x0 = int(min(a[0], b[0]) - m)
        y0 = int(min(a[1], b[1]) - m)
        x1 = int(max(a[0], b[0]) + m) + 1
        y1 = int(max(a[1], b[1]) + m) + 1
        ink = nd.gaussian_filter(ink_image(img.crop((x0, y0, x1, y1))), 0.8)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        d = b - a
        L = math.hypot(*d) or 1.0
        t = np.clip(((xx - a[0]) * d[0] + (yy - a[1]) * d[1]) / L**2, 0, 1)
        dist = np.hypot(xx - (a[0] + t * d[0]), yy - (a[1] + t * d[1]))
        cost = 1.0 / (0.04 + ink)
        cost[dist > BAND] = np.inf
        mcp = MCP_Geometric(cost)
        s = (int(round(a[1])) - y0, int(round(a[0])) - x0)
        e = (int(round(b[1])) - y0, int(round(b[0])) - x0)
        mcp.find_costs([s], [e])
        path = np.array(mcp.traceback(e), float)
        out.extend(path[1:, ::-1] + [x0, y0])
    return np.array(out) if raw else smooth(np.array(out), 2)


def smooth(p, r):
    if len(p) < 2 * r + 2:
        return p
    q = p.copy()
    k = np.ones(2 * r + 1) / (2 * r + 1)
    for c in range(2):
        q[r:-r, c] = np.convolve(p[:, c], k, mode="valid")
    return q


def spline(pts, step=4.0):
    """Catmull-Rom durch die Stützpunkte, für Mittellinien ohne Einrasten."""
    p = np.asarray(pts, float)
    if len(p) < 3:
        return p
    q = np.vstack([p[0] * 2 - p[1], p, p[-1] * 2 - p[-2]])
    out = []
    for i in range(1, len(q) - 2):
        p0, p1, p2, p3 = q[i - 1 : i + 3]
        n = max(2, int(math.hypot(*(p2 - p1)) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    2 * p1
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    out.append(p[-1])
    return np.array(out)


def simplify(p, tol):
    from shapely.geometry import LineString

    return np.array(LineString(p).simplify(tol).coords)


def traced(karte, entry):
    """Alle Teilstücke eines Gewässers als Pixellinien."""
    out = []
    for part in entry["parts"]:
        if len(part) < 2:
            continue
        if entry.get("snap", True):
            out.append(snap(karte.img, part))
        else:
            out.append(spline(part))
    return out


# --- Leitlinien ---------------------------------------------------------------


def leit():
    """Heutige benannte Gewässer im Kreis, für die Liste und die Prüfbilder."""
    f = CACHE / "leit-kreis.json"
    if f.exists():
        return json.loads(f.read_text())
    from gewaesser import guide_lines
    from shapely.geometry import LineString, shape

    kreis = shape(json.loads(KREIS.read_text())["features"][0]["geometry"])
    lines = guide_lines(kreis.buffer(0.01).bounds)
    by = {}
    for ln in lines:
        if not ln["name"]:
            continue
        g = LineString(ln["coords"]).intersection(kreis.buffer(0.005))
        if g.is_empty:
            continue
        by.setdefault(ln["name"], {"kind": ln["kind"], "lines": []})
        geoms = getattr(g, "geoms", [g])
        for gg in geoms:
            if gg.geom_type == "LineString" and len(gg.coords) > 1:
                by[ln["name"]]["lines"].append([list(c) for c in gg.coords])
        if ln["kind"] == "river":
            by[ln["name"]]["kind"] = "river"
    for v in by.values():
        v["lines"] = chain(v["lines"], 3e-4)
    f.write_text(json.dumps(by))
    return by


def chain(lines, tol):
    """Stücke zu langen Linien verbinden, wenn sich Enden fast berühren
    (Kachelkanten, Kreisgrenze). Doppelte kurze Stücke fallen weg."""
    from shapely.geometry import LineString
    from shapely.ops import linemerge, unary_union

    merged = unary_union([LineString(c) for c in lines if len(c) > 1])
    if merged.geom_type == "MultiLineString":
        merged = linemerge(merged)
    ls = [list(g.coords) for g in getattr(merged, "geoms", [merged])]
    ls = [np.array(c) for c in ls]
    changed = True
    while changed:
        changed = False
        ls.sort(key=len, reverse=True)
        for i in range(len(ls)):
            for j in range(len(ls)):
                if i == j:
                    continue
                a, b = ls[i], ls[j]
                for ra in (False, True):
                    for rb in (False, True):
                        A = a[::-1] if ra else a
                        B = b[::-1] if rb else b
                        if np.hypot(*(A[-1] - B[0])) < tol:
                            ls[i] = np.vstack([A, B[1:]])
                            del ls[j]
                            changed = True
                            break
                    if changed:
                        break
                if changed:
                    break
            if changed:
                break
    return [c.tolist() for c in ls if len(c) > 1]


def length_km(lines):
    s = 0.0
    for ln in lines:
        p = np.array(ln)
        dx = np.diff(p[:, 0]) * 111.32 * math.cos(math.radians(52.3))
        dy = np.diff(p[:, 1]) * 111.32
        s += np.hypot(dx, dy).sum()
    return s


def cmd_leit(_args):
    by = leit()
    rows = sorted(((length_km(v["lines"]), k, v["kind"]) for k, v in by.items()), reverse=True)
    for km, name, kind in rows:
        if km >= 2:
            print(f"{name:32s} {kind:7s} {km:6.1f} km")


# Kanäle, Entlaster und Gräben sind nicht gemeint, nur Flüsse und Bäche
SKIP = re.compile(r"kanal|entlast|graben|^nn$", re.I)
# Breite Flüsse: zwei Uferlinien, Stützpunkte auf die Mitte, kein Einrasten.
# Wert: kleinste und größte Breite zwischen den Ufern in Kartenpixeln
WIDE = {"Weser": (14, 60), "Werre": (5, 22)}
# Abstand der vorgeschlagenen Stützpunkte und Suchradius beim Einrasten
STEP_PX = 70
SNAP_R = 12


def drawn_mask(karte, f=8):
    """Wo die Karte Inhalt hat (Kreisgebiet), auf 1/f verkleinert."""
    cache = CACHE / f"tinte-{karte.id}.npy"
    if cache.exists():
        return np.load(cache), f
    W, H = karte.img.size
    small = karte.img.resize((W // f, H // f), Image.BOX)
    ink = ink_image(small)
    m = nd.uniform_filter((ink > 0.12).astype(np.float32), 9) > 0.05
    from matplotlib.path import Path as MPath

    m = nd.binary_closing(m, iterations=6)
    # nur im Kreisgebiet, das die Karte zeigt (fluesse/kreisgebiet.json, 1/8)
    kreis = json.loads((POINTS / "kreisgebiet.json").read_text())[karte.id]
    poly = MPath(np.array(kreis, float) * 8 / f)
    yy, xx = np.mgrid[0 : m.shape[0], 0 : m.shape[1]]
    m &= poly.contains_points(np.column_stack([xx.ravel(), yy.ravel()])).reshape(m.shape)
    np.save(cache, m)
    return m, f


def densify_px(p, step):
    out = [p[0]]
    for a, b in zip(p[:-1], p[1:]):
        n = int(math.hypot(*(b - a)) // step)
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / (n + 1))
        out.append(b)
    return np.array(out)


def cmd_vorschlag(args):
    """Stützpunkte entlang des heutigen Laufs, auf die Kartenlinie gezogen.
    Bestehende Dateien bleiben, außer mit --neu."""
    map_id = args[0]
    names = [a for a in args[1:] if not a.startswith("--")]
    karte = Karte(map_id)
    W, H = karte.img.size
    drawn, f = drawn_mask(karte)
    by = leit()
    if not names:
        names = [n for n, v in by.items() if not SKIP.search(n) and length_km(v["lines"]) >= 2]
    for name in names:
        if (POINTS / map_id / f"{name}.json").exists() and "--neu" not in args:
            continue
        v = by[name]
        wide = name in WIDE
        parts = []
        for ln in v["lines"]:
            p = densify_px(karte.to_px(ln), STEP_PX)
            ok = (p[:, 0] > 20) & (p[:, 1] > 20) & (p[:, 0] < W - 20) & (p[:, 1] < H - 20)
            ix = np.clip((p[:, 0] // f).astype(int), 0, drawn.shape[1] - 1)
            iy = np.clip((p[:, 1] // f).astype(int), 0, drawn.shape[0] - 1)
            ok &= drawn[iy, ix]
            cur = []
            for q, good in zip(p, ok):
                if good:
                    if not wide:
                        q = snap_point(karte.img, q)
                    cur.append(q)
                elif len(cur) > 1:
                    parts.append(cur)
                    cur = []
                else:
                    cur = []
            if len(cur) > 1:
                parts.append(cur)
        if not parts:
            continue
        entry = {"kind": v["kind"], "snap": not wide, "parts": [np.array(p).tolist() for p in parts]}
        save_points(map_id, name, entry)
        print(f"{name}: {len(parts)} Teile, {sum(len(p) for p in parts)} Punkte")


def snap_point(img, q):
    r = SNAP_R
    x0, y0 = int(q[0]) - r, int(q[1]) - r
    ink = nd.gaussian_filter(ink_image(img.crop((x0, y0, x0 + 2 * r + 1, y0 + 2 * r + 1))), 1.0)
    yy, xx = np.mgrid[-r : r + 1, -r : r + 1]
    ink[np.hypot(xx, yy) > r] = 0
    # leichter Zug zur Mitte, damit gleich starke Linien die nähere gewinnt
    ink -= 0.004 * np.hypot(xx, yy)
    k = np.unravel_index(np.argmax(ink), ink.shape)
    return np.array([x0 + k[1], y0 + k[0]], float)


def cmd_ersetze(args):
    """ersetze <karte> <name> <teil> <von> <bis> x,y ...: Stützpunkte von..bis
    (einschließlich) durch neue ersetzen. Teil "neu" hängt ein Teilstück an,
    "weg" mit von/bis löscht ein Teilstück ganz (von=bis=-)."""
    map_id, name, part = args[0], args[1], args[2]
    pts = load_points(map_id).get(name) or {"kind": "stream", "snap": True, "parts": []}
    new = [[int(v) for v in a.split(",")] for a in args[5:]]
    if part == "neu":
        pts["parts"].append([[int(v) for v in a.split(",")] for a in args[3:]])
    elif part == "weg":
        del pts["parts"][int(args[3])]
    else:
        k, i0, i1 = int(part), int(args[3]), int(args[4])
        p = pts["parts"][k]
        pts["parts"][k] = p[:i0] + new + p[i1 + 1 :]
    pts["parts"] = [p for p in pts["parts"] if len(p) > 1]
    save_points(map_id, name, pts)
    print(f"{name}: {len(pts['parts'])} Teile")


def center_wide(img, part, reach=40, min_w=14, max_w=60):
    """Stützpunkte breiter Flüsse auf die Mitte zwischen den Uferlinien.
    Je Punkt ein Querprofil der Linienstärke; gesucht ist das Paar aus
    zwei kräftigen Linien links und rechts mit passender Breite. Punkte
    ohne klares Paar bleiben, die Mitten werden über Nachbarn geglättet."""
    p = np.asarray(part, float)
    n = len(p)
    tang = np.gradient(p, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    norm = np.column_stack([-tang[:, 1], tang[:, 0]])
    x0, y0 = (p.min(0) - reach - 5).astype(int)
    x1, y1 = (p.max(0) + reach + 5).astype(int)
    ink = nd.gaussian_filter(ink_image(img.crop((x0, y0, x1, y1))), 1.0)
    off = np.zeros(n)
    ok = np.zeros(n, bool)
    t = np.arange(-reach, reach + 1)
    for i in range(n):
        # Profil über 5 Schnitte entlang des Flusses gemittelt
        prof = np.zeros(len(t))
        for s in (-4, -2, 0, 2, 4):
            q = p[i] + tang[i] * s
            xs = q[0] + norm[i, 0] * t - x0
            ys = q[1] + norm[i, 1] * t - y0
            prof += nd.map_coordinates(ink, [ys, xs], order=1, cval=0)
        prof /= 5
        peaks = [k for k in range(1, len(t) - 1) if prof[k] >= prof[k - 1] and prof[k] >= prof[k + 1] and prof[k] > 0.12]
        best = None
        for a in peaks:
            for b in peaks:
                w = t[b] - t[a]
                if w < min_w or w > max_w:
                    continue
                # Innen soll es heller sein als an den Ufern
                inner = prof[a + 3 : b - 2].mean() if b - a > 6 else 1
                score = min(prof[a], prof[b]) - 0.5 * inner - 0.002 * abs((t[a] + t[b]) / 2)
                if best is None or score > best[0]:
                    best = (score, (t[a] + t[b]) / 2)
        if best and best[0] > 0.05:
            off[i] = best[1]
            ok[i] = True
    # Ausreißer gegen den gleitenden Median der Nachbarn
    med = nd.median_filter(np.where(ok, off, np.nan), size=7, mode="nearest")
    good = ok & (np.abs(off - np.nan_to_num(med)) < 6)
    if good.sum() < 2:
        return p, good
    idx = np.arange(n)
    off_i = np.interp(idx, idx[good], off[good])
    off_i = nd.uniform_filter1d(off_i, 3, mode="nearest")
    return p + norm * off_i[:, None], good


def cmd_mitte(args):
    """mitte <karte> <name>: Stützpunkte breiter Flüsse auf die Strommitte."""
    map_id, name = args[0], args[1]
    karte = Karte(map_id)
    pts = load_points(map_id)[name]
    out = []
    for part in pts["parts"]:
        lo, hi = WIDE[name]
        q, good = center_wide(karte.img, part, min_w=lo, max_w=hi)
        shift = np.hypot(*(q - np.asarray(part, float)).T)
        print(f"Teil: {len(part)} Punkte, {good.sum()} mit Uferpaar, Verschiebung Median {np.median(shift):.1f} px, max {shift.max():.1f} px")
        out.append(np.round(q).astype(int).tolist())
    pts["parts"] = out
    save_points(map_id, name, pts)


# --- Prüfung: Bach oder Weg? ---------------------------------------------------

# Laut Zeichenerklärung ist ein Bach eine fein geschlängelte Linie, ein Weg
# eine glatte. Maß: mittlerer Abstand des ungeglätteten Laufs von seiner
# geglätteten Fassung (Gauß, 8 px), je Abschnitt von CHECK_PX Kartenpixeln
# (etwa 300 m). Die Bachlinie der Legende hat 1,3, der Weg 0,85.
CHECK_PX = 60
SMOOTH_MAX = 0.8
# Darüber irrt der Lauf durch Schraffen oder Schrift
WIRR_MIN = 3.0
# Kürzestes Stück, das nach dem Herausschneiden bleiben darf
MIN_KEEP_PX = 60


def wiggle(raw):
    p = densify_px(np.asarray(raw, float), 1.0)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    s = np.arange(0, d[-1], 1.0)
    q = np.column_stack([np.interp(s, d, p[:, 0]), np.interp(s, d, p[:, 1])])
    sm = nd.gaussian_filter1d(q, 8, axis=0, mode="nearest")
    return q, np.hypot(*(q - sm).T)


def classify(img, part):
    """Lauf (1 px Schritt) und je Punkt 1 Bach, 0 glatt (Weg), 2 wirr."""
    q, w = wiggle(snap(img, part, raw=True))
    cls = np.ones(len(q), int)
    for i in range(0, len(q), CHECK_PX):
        c = w[i : i + CHECK_PX]
        if len(c) < CHECK_PX / 2:
            continue
        if c.mean() < SMOOTH_MAX:
            cls[i : i + CHECK_PX] = 0
        elif c.mean() > WIRR_MIN:
            cls[i : i + CHECK_PX] = 2
    return q, cls


def kept(karte, entry):
    """Die Linien, die ins Ergebnis gehen: breite Flüsse ganz, Bäche nur
    dort, wo die Karte einen Bach zeigt. "geprueft": true im Eintrag
    übergeht die Prüfung (von Hand nachgesehen)."""
    out = []
    for part in entry["parts"]:
        if len(part) < 2:
            continue
        if not entry.get("snap", True):
            out.append(spline(part))
            continue
        q, cls = classify(karte.img, part)
        if entry.get("geprueft"):
            cls[:] = 1
        i = 0
        while i < len(q):
            if cls[i] != 1:
                i += 1
                continue
            j = i
            while j < len(q) and cls[j] == 1:
                j += 1
            if (j - i >= MIN_KEEP_PX or (i == 0 and j == len(q))) and j - i > 1:
                out.append(smooth(q[i:j], 2))
            i = j
    return out


def cmd_pruefe(args):
    """Abschnitte, die glatt wie ein Weg (gelb) oder wirr (orange) verlaufen.
    Schreibt .cache/pruefung-<karte>.json für die Prüfbilder und listet je
    Gewässer die Anzahl."""
    map_id = args[0]
    karte = Karte(map_id)
    result = {}
    rows = []
    for name, entry in load_points(map_id).items():
        if not entry.get("snap", True) or entry.get("geprueft"):
            continue
        parts = []
        bad = {0: 0, 2: 0}
        for part in entry["parts"]:
            if len(part) < 2:
                continue
            q, cls = classify(karte.img, part)
            for k in bad:
                bad[k] += int((cls == k).sum())
            parts.append({"px": np.round(q[::2], 1).tolist(), "ok": cls[::2].tolist()})
        result[name] = parts
        if bad[0] or bad[2]:
            rows.append((bad[0] + bad[2], name, bad))
    (CACHE / f"pruefung-{map_id}.json").write_text(json.dumps(result))
    mpp = karte.warp.meters_per_px() * math.cos(math.radians(52.3))
    for n, name, bad in sorted(rows, reverse=True):
        print(f"{name:28s} glatt {bad[0] * mpp / 1000:4.1f} km, wirr {bad[2] * mpp / 1000:4.1f} km")


def cmd_punkt(args):
    """punkt <karte> <name> teil.i=x,y …: einzelne Stützpunkte verschieben,
    teil.i=- löscht einen Punkt (von hinten nach vorn, damit die Nummern
    der übrigen gelten)."""
    map_id, name = args[0], args[1]
    pts = load_points(map_id)[name]
    edits = []
    for a in args[2:]:
        key, val = a.split("=")
        k, i = map(int, key.split("."))
        edits.append((k, i, val))
    for k, i, val in sorted(edits, key=lambda e: (e[0], -e[1])):
        if val == "-":
            del pts["parts"][k][i]
        else:
            pts["parts"][k][i] = [int(v) for v in val.split(",")]
    save_points(map_id, name, pts)
    print(f"{name}: {len(edits)} Punkte geändert")


def cmd_kacheln(args):
    """Prüfbilder je 1000-px-Kachel mit allen nachgezeichneten Gewässern."""
    map_id = args[0]
    only = [tuple(int(v) for v in a.split(",")) for a in args[1:]]
    karte = Karte(map_id)
    W, H = karte.img.size
    drawn, f = drawn_mask(karte)
    all_pts = load_points(map_id)
    lines = {n: traced(karte, e) for n, e in all_pts.items()}
    C = 1000
    out = []
    for cy in range(0, H, C):
        for cx in range(0, W, C):
            if only and (cx // C, cy // C) not in only:
                continue
            if not drawn[cy // f : (cy + C) // f, cx // f : (cx + C) // f].any():
                continue
            box = (cx - 60, cy - 60, cx + C + 60, cy + C + 60)
            hit = any(
                ((ln[:, 0] > cx) & (ln[:, 0] < cx + C) & (ln[:, 1] > cy) & (ln[:, 1] < cy + C)).sum() > 20
                for ls in lines.values()
                for ln in ls
            )
            if not hit and not only:
                continue
            out.append(render(karte, box, lines, all_pts, f"{map_id} Kachel {cx // C},{cy // C}"))
    print("\n".join(out))


def render(karte, box, lines, all_pts, title):
    x0, y0, x1, y1 = box
    crop = karte.img.crop(box)
    s = 1.3
    crop = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
    ov = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f = font(12, False)
    for gx in range(math.ceil(x0 / 50) * 50, x1, 50):
        c = (255, 0, 255, 140) if gx % 100 == 0 else (255, 0, 255, 50)
        d.line([((gx - x0) * s, 0), ((gx - x0) * s, crop.height)], fill=c)
        if gx % 100 == 0:
            d.text(((gx - x0) * s + 2, 2), str(gx), fill=(200, 0, 200, 255), font=f)
    for gy in range(math.ceil(y0 / 50) * 50, y1, 50):
        c = (255, 0, 255, 140) if gy % 100 == 0 else (255, 0, 255, 50)
        d.line([(0, (gy - y0) * s), (crop.width, (gy - y0) * s)], fill=c)
        if gy % 100 == 0:
            d.text((2, (gy - y0) * s + 2), str(gy), fill=(200, 0, 200, 255), font=f)
    fb = font(11)
    check = CACHE / f"pruefung-{karte.id}.json"
    check = json.loads(check.read_text()) if check.exists() else {}
    for name in lines:
        for part in check.get(name, []):
            q = [((x - x0) * s, (y - y0) * s) for x, y in part["px"]]
            for i in range(len(q) - 1):
                if part["ok"][i] == 0:
                    d.line(q[i : i + 2], fill=(255, 230, 0, 200), width=9)
                elif part["ok"][i] == 2:
                    d.line(q[i : i + 2], fill=(255, 120, 0, 200), width=9)
    for name, ls in lines.items():
        for ln in ls:
            q = [((x - x0) * s, (y - y0) * s) for x, y in ln]
            d.line(q, fill=(255, 0, 0, 190), width=2)
        for pi, part in enumerate(all_pts[name]["parts"]):
            for i, (x, y) in enumerate(part):
                vx, vy = (x - x0) * s, (y - y0) * s
                if 0 <= vx < crop.width and 0 <= vy < crop.height:
                    d.ellipse([vx - 3, vy - 3, vx + 3, vy + 3], fill=(255, 140, 0, 255))
                    if i % 5 == 0 or i == len(part) - 1:
                        lab = f"{name[:9]} {pi}.{i}" if i == 0 else f"{pi}.{i}"
                        d.text((vx + 4, vy - 13), lab, fill=(0, 0, 200, 255), font=fb)
    im = Image.alpha_composite(crop.convert("RGBA"), ov).convert("RGB")
    ImageDraw.Draw(im).text((6, crop.height - 20), title, fill=(0, 0, 160), font=font(14))
    p = CACHE / "kacheln" / f"{title.replace(' ', '-').replace(',', '_')}.jpg"
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, quality=86)
    return str(p)


# --- Prüfbilder ---------------------------------------------------------------


def cmd_bogen(args):
    map_id, name = args[0], args[1]
    karte = Karte(map_id)
    W, H = karte.img.size
    pts = load_points(map_id).get(name)
    guide = [karte.to_px(ln) for ln in leit().get(name, {}).get("lines", [])]
    if "--px" in args:
        box = [int(v) for v in args[args.index("--px") + 1].split(",")]
        boxes = [box]
    else:
        # Kacheln von 800 px (mit 100 px Rand), die die heutige Linie oder
        # gesetzte Stützpunkte berühren
        allp = [g for g in guide] + [np.array(p, float) for p in (pts or {}).get("parts", []) if p]
        allp = np.vstack(allp) if allp else np.zeros((0, 2))
        allp = allp[(allp[:, 0] > 0) & (allp[:, 1] > 0) & (allp[:, 0] < W) & (allp[:, 1] < H)]
        cells = sorted({(int(x // 800), int(y // 800)) for x, y in allp}, key=lambda c: (c[1], c[0]))
        boxes = [[cx * 800 - 100, cy * 800 - 100, cx * 800 + 900, cy * 800 + 900] for cx, cy in cells]
    lines = traced(karte, pts) if pts else []
    out = []
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(W, x1), min(H, y1)
        crop = karte.img.crop((x0, y0, x1, y1))
        s = min(1400 / crop.width, 1400 / crop.height, 1.6)
        crop = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
        ov = Image.new("RGBA", crop.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        f = font(12, False)
        for gx in range(math.ceil(x0 / 50) * 50, x1, 50):
            c = (255, 0, 255, 150) if gx % 100 == 0 else (255, 0, 255, 60)
            d.line([((gx - x0) * s, 0), ((gx - x0) * s, crop.height)], fill=c)
            if gx % 100 == 0:
                d.text(((gx - x0) * s + 2, 2), str(gx), fill=(200, 0, 200, 255), font=f)
        for gy in range(math.ceil(y0 / 50) * 50, y1, 50):
            c = (255, 0, 255, 150) if gy % 100 == 0 else (255, 0, 255, 60)
            d.line([(0, (gy - y0) * s), (crop.width, (gy - y0) * s)], fill=c)
            if gy % 100 == 0:
                d.text((2, (gy - y0) * s + 2), str(gy), fill=(200, 0, 200, 255), font=f)
        for g in guide:
            q = [((x - x0) * s, (y - y0) * s) for x, y in g]
            for i in range(0, len(q) - 1, 2):
                d.line(q[i : i + 2], fill=(0, 200, 255, 170), width=2)
        for ln in lines:
            d.line([((x - x0) * s, (y - y0) * s) for x, y in ln], fill=(255, 0, 0, 200), width=2)
        if pts:
            fb = font(11)
            for pi, part in enumerate(pts["parts"]):
                for i, (x, y) in enumerate(part):
                    vx, vy = (x - x0) * s, (y - y0) * s
                    if 0 <= vx < crop.width and 0 <= vy < crop.height:
                        d.ellipse([vx - 3, vy - 3, vx + 3, vy + 3], fill=(255, 0, 0, 255))
                        d.text((vx + 4, vy - 12), f"{pi}.{i}", fill=(255, 0, 0, 255), font=fb)
        im = Image.alpha_composite(crop.convert("RGBA"), ov).convert("RGB")
        ImageDraw.Draw(im).text((6, crop.height - 20), f"{name} {k}: {x0},{y0}-{x1},{y1}", fill=(0, 0, 160), font=font(14))
        p = CACHE / "bogen" / f"{map_id}-{name}-{k}.jpg"
        p.parent.mkdir(parents=True, exist_ok=True)
        im.save(p, quality=86)
        out.append(str(p))
    print("\n".join(out))


# --- Ergebnis -----------------------------------------------------------------


# --- Netz: ein Lauf je Gewässer ------------------------------------------------

# Gerüst ist der heutige Lauf jedes benannten Gewässers (OSM, wie leit). Die
# nachgezeichneten Stücke ersetzen ihn dort, wo es sie gibt; wo die
# Kreiskarte nichts hergibt, bleibt der heutige Lauf. So hat das Netz keine
# Lücken, und jede Teilstrecke trägt ihre Herkunft ("kreiskarte" oder
# "heute").
#
# Ein Stück gehört zu einem Lauf, wenn es im Median höchstens MATCH_MEDIAN_M
# und an beiden Enden höchstens MATCH_END_M von ihm entfernt liegt.
MATCH_MEDIAN_M = 250
MATCH_END_M = 450
# Freie Enden bis zum nächsten anderen Lauf verlängern (Mündungen)
MOUTH_M = {"river": 500, "stream": 300}
# Kürzere Läufe zeigt die Karte nicht
MIN_LINE_M = 300


def build_network(traced):
    """traced: {name: [[[lon, lat], …], …]} nachgezeichnete Stücke.
    Ergebnis: [(name, kind, [[lon, lat], …], [herkunft je Punkt])]."""
    from shapely.geometry import LineString, Point
    from shapely.ops import nearest_points

    k = math.cos(math.radians(52.3)) * 111320
    to_m = lambda c: [(x * k, y * 111320) for x, y in c]  # noqa: E731
    to_ll = lambda c: [[x / k, y / 111320] for x, y in c]  # noqa: E731

    guides = {n: v for n, v in leit().items() if not SKIP.search(n)}
    out = []  # [name, kind, [(x, y)], [herkunft]]
    used = 0

    def fits(T, G):
        c = list(T.coords)
        d = sorted(G.distance(Point(q)) for q in c[:: max(1, len(c) // 30)])
        return (
            d[len(d) // 2] <= MATCH_MEDIAN_M
            and G.distance(Point(c[0])) <= MATCH_END_M
            and G.distance(Point(c[-1])) <= MATCH_END_M
        )

    for name, g in guides.items():
        pieces = [LineString(to_m(c)) for c in traced.get(name, [])]
        glines = [LineString(to_m(gc)) for gc in g["lines"] if len(gc) > 1]
        # Stücke, die über mehrere heutige Linien reichen (Weser mit
        # Seitenarmen): dort den heutigen Lauf herausschneiden, das Stück
        # gilt als Ganzes
        whole = [T for T in pieces if not any(fits(T, G) for G in glines)]
        for T in whole:
            zone = T.buffer(MATCH_MEDIAN_M)
            rest = []
            for G in glines:
                r = G.difference(zone)
                rest += [x for x in getattr(r, "geoms", [r]) if x.geom_type == "LineString" and x.length > 50]
            glines = rest
            out.append([name, g["kind"], list(T.coords), ["kreiskarte"] * len(T.coords)])
            used += 1
        pieces = [T for T in pieces if not any(T is W for W in whole)]
        for G in glines:
            if G.length < 1:
                continue
            # passende Stücke mit ihrer Lage auf dem Lauf
            spans = []
            for T in pieces:
                if not fits(T, G):
                    continue
                c = list(T.coords)
                m0, m1 = G.project(Point(c[0])), G.project(Point(c[-1]))
                if m0 > m1:
                    m0, m1, c = m1, m0, c[::-1]
                if m1 - m0 < 50:
                    continue
                spans.append((m0, m1, c))
            # Überlappungen: das längere Stück gewinnt
            spans.sort(key=lambda s: -(s[1] - s[0]))
            chosen = []
            for s in spans:
                if all(s[1] <= o[0] or s[0] >= o[1] for o in chosen):
                    chosen.append(s)
            chosen.sort()
            used += len(chosen)
            pts, her = [], []
            pos = 0.0
            for m0, m1, c in chosen:
                for q in _substring(G, pos, m0):
                    pts.append(q)
                    her.append("heute")
                for q in c:
                    pts.append(q)
                    her.append("kreiskarte")
                pos = m1
            for q in _substring(G, pos, G.length):
                pts.append(q)
                her.append("heute")
            pts, her = _dedupe(pts, her)
            if len(pts) > 1:
                out.append([name, g["kind"], pts, her])

    # 2. Mündungen: freies Ende an den nächsten anderen Lauf, nur vorwärts
    lines = [LineString(o[2]) for o in out]
    joined = 0
    for i, o in enumerate(out):
        for end in (0, -1):
            pts = o[2]
            p = Point(pts[end])
            best = None
            for j, L in enumerate(lines):
                if j == i or out[j][0] == o[0]:
                    continue
                d = L.distance(p)
                if best is None or d < best[0]:
                    best = (d, L)
            if not best or not (1 < best[0] < MOUTH_M.get(o[1], 300)):
                continue
            q = nearest_points(best[1], p)[0]
            inner = pts[min(5, len(pts) - 1)] if end == 0 else pts[max(-6, -len(pts))]
            if (p.x - inner[0]) * (q.x - p.x) + (p.y - inner[1]) * (q.y - p.y) <= 0:
                continue
            if end == 0:
                o[2].insert(0, (q.x, q.y))
                o[3].insert(0, o[3][0])
            else:
                o[2].append((q.x, q.y))
                o[3].append(o[3][-1])
            joined += 1
        lines[i] = LineString(o[2])

    # 3. Nur was zum Netz gehört: Läufe, die über andere Läufe mit einem
    # Fluss verbunden sind oder den Kreis verlassen (dort geht es mit den
    # heutigen Flüssen weiter). Einzelne Striche ohne Anschluss fallen weg.
    from shapely.geometry import Polygon

    ring = json.loads(KREIS.read_text())["features"][0]["geometry"]["coordinates"][0]
    kreis = Polygon(to_m(ring))
    n = len(out)
    nb = [[j for j in range(n) if j != i and lines[j].distance(lines[i]) < 5] for i in range(n)]
    anchor = [
        o[1] == "river"
        or not kreis.contains(Point(o[2][0]))
        or not kreis.contains(Point(o[2][-1]))
        for o in out
    ]
    seen = [False] * n
    keep = []
    for i in range(n):
        if seen[i]:
            continue
        comp, stack = [], [i]
        seen[i] = True
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in nb[u]:
                if not seen[v]:
                    seen[v] = True
                    stack.append(v)
        if not any(anchor[u] for u in comp):
            continue
        for u in comp:
            if lines[u].length >= MIN_LINE_M:
                keep.append((out[u][0], out[u][1], to_ll(out[u][2]), out[u][3]))
    n_alt = sum(len(v) for v in traced.values())
    print(f"{len(guides)} Läufe, {used} von {n_alt} nachgezeichneten Stücken eingesetzt, {joined} Mündungen angeschlossen, {len(keep)} Läufe bleiben")
    return keep


def _substring(G, a, b):
    from shapely.ops import substring

    if b - a < 1:
        return []
    return list(substring(G, a, b).coords)


def _dedupe(pts, her):
    out_p, out_h = [], []
    for p, h in zip(pts, her):
        if out_p and math.dist(out_p[-1], p) < 0.5:
            continue
        out_p.append(p)
        out_h.append(h)
    return out_p, out_h


def runs(coords, her):
    """Teilstrecken gleicher Herkunft, die sich den Randpunkt teilen."""
    out = []
    s = 0
    for i in range(1, len(coords) + 1):
        if i == len(coords) or her[i] != her[s]:
            seg = coords[max(0, s - 1) : i]
            if len(seg) > 1:
                out.append((her[s], seg))
            s = i
    return out


def cmd_geojson(_args):
    traced = {}
    for map_id in MAPS:
        pts = load_points(map_id)
        if not pts:
            continue
        karte = Karte(map_id)
        for name, entry in pts.items():
            # Teilstücke mit eigener Datei tragen den Namen im Eintrag
            name = entry.get("name", name)
            for ln in kept(karte, entry):
                traced.setdefault(name, []).append(karte.to_lonlat(simplify(ln, 0.8)).tolist())
        print(f"{map_id}: {len(pts)} Gewässer")
    feats = []
    for name, kind, coords, her in build_network(traced):
        for herkunft, seg in runs(coords, her):
            feats.append(
                {
                    "type": "Feature",
                    "properties": {"name": name, "kind": kind, "herkunft": herkunft},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[round(a, 5), round(b, 5)] for a, b in seg],
                    },
                }
            )
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":"))
    )
    share = sum(f["properties"]["herkunft"] == "kreiskarte" for f in feats)
    print(f"{len(feats)} Teilstrecken, davon {share} nach der Kreiskarte → {OUT}")


def cmd_maske(args):
    """Freistellen: Maske des Kreisgebiets für alt.py tiles, 1/8 der
    Scangröße. Gezeichnetes (Tinte) im erweiterten Kreispolygon, Löcher
    gefüllt, Rand weich. Titel, Legende und leeres Nachbarland fallen weg."""
    for map_id in args or MAPS:
        karte = Karte(map_id)
        W, H = karte.img.size
        f = 8
        small = karte.img.resize((W // f, H // f), Image.BOX)
        ink = nd.uniform_filter((ink_image(small) > 0.12).astype(np.float32), 7) > 0.04
        from matplotlib.path import Path as MPath
        from shapely.geometry import Polygon

        kreis = json.loads((POINTS / "kreisgebiet.json").read_text())[map_id]
        poly = Polygon(kreis).buffer(10)
        yy, xx = np.mgrid[0 : H // f, 0 : W // f]
        inside = MPath(np.array(poly.exterior.coords)).contains_points(
            np.column_stack([xx.ravel(), yy.ravel()])
        ).reshape(yy.shape)
        m = nd.binary_closing(ink & inside, iterations=8)
        m = nd.binary_fill_holes(m)
        lab, n = nd.label(m)
        if n > 1:
            sizes = nd.sum(m, lab, range(1, n + 1))
            m = lab == (np.argmax(sizes) + 1)
        m = nd.binary_opening(m, iterations=5)
        a = nd.gaussian_filter(m.astype(np.float32), 1.5)
        out = CACHE / f"maske-{map_id}.png"
        Image.fromarray((a * 255).astype(np.uint8)).save(out)
        print(f"{map_id}: {m.mean() * 100:.0f} % der Fläche → {out}")


def cmd_weser(_args):
    """Weser in src/data/fluesse.json: im Kreis der Lauf der Kreiskarte
    (Teilstücke "kreiskarte"), so gilt in Ebene und Modell eine Fassung."""
    rivers_f = ROOT / "src" / "data" / "fluesse.json"
    rivers = json.loads(rivers_f.read_text())
    w = rivers["Weser"]
    coords = np.array(w["coords"], float)
    kinds = np.empty(len(coords), object)
    for a, b, k in w["parts"]:
        kinds[a : b + 1] = k
    for map_id in MAPS:
        entry = load_points(map_id).get("Weser")
        if not entry:
            continue
        karte = Karte(map_id)
        for ln in kept(karte, entry):
            new = karte.to_lonlat(simplify(ln, 0.8))
            # Stelle im alten Lauf, an der das neue Stück beginnt und endet
            k = np.cos(np.radians(52.3))
            dist = lambda p: np.hypot((coords[:, 0] - p[0]) * k, coords[:, 1] - p[1])  # noqa: E731
            i0, i1 = int(np.argmin(dist(new[0]))), int(np.argmin(dist(new[-1])))
            if i0 > i1:
                new, i0, i1 = new[::-1], i1, i0
            coords = np.vstack([coords[:i0], new, coords[i1 + 1 :]])
            kinds = np.concatenate([kinds[:i0], np.full(len(new), "kreiskarte", object), kinds[i1 + 1 :]])
            print(f"{map_id}: Punkte {i0}–{i1} durch {len(new)} ersetzt")
    parts = []
    start = 0
    for i in range(1, len(coords) + 1):
        if i == len(coords) or kinds[i] != kinds[start]:
            parts.append([start, min(i, len(coords) - 1), kinds[start]])
            start = i
    w["coords"] = [[round(a, 5), round(b, 5)] for a, b in coords]
    w["parts"] = parts
    # Format wie build-rivers.mjs
    rivers_f.write_text(json.dumps(rivers, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Weser: {len(coords)} Punkte, {len(parts)} Teilstücke")


if __name__ == "__main__":
    cmds = {
        "leit": cmd_leit,
        "vorschlag": cmd_vorschlag,
        "ersetze": cmd_ersetze,
        "punkt": cmd_punkt,
        "mitte": cmd_mitte,
        "pruefe": cmd_pruefe,
        "kacheln": cmd_kacheln,
        "bogen": cmd_bogen,
        "geojson": cmd_geojson,
        "weser": cmd_weser,
        "maske": cmd_maske,
    }
    cmds[sys.argv[1]](sys.argv[2:])
