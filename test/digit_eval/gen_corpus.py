#!/usr/bin/env python3
# Genere un corpus de figures de test pour evaluer la digitalisation (chemin AUTO).
# Chaque figure : <name>.png + <name>.json (verite terrain).
# Astuce calibration : on force ax.margins(0) et des xlim/ylim connus, donc les
# bords interieurs de la boite (spines) == limites d'axes -> le decodeur Node peut
# convertir pixel->data avec ces limites sans calibration manuelle.
import os, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), "corpus")
os.makedirs(OUT, exist_ok=True)

DPI = 130


def hexrgb(c):
    r, g, b, _ = matplotlib.colors.to_rgba(c)
    return [round(r * 255), round(g * 255), round(b * 255)]


def save(name, fig, ax, curves, xlim, ylim, xlog=False, ylog=False):
    ax.set_xlim(xlim)
    ax.set_ylim(ylim)
    if xlog:
        ax.set_xscale("log")
    if ylog:
        ax.set_yscale("log")
    ax.margins(0)
    for s in ax.spines.values():
        s.set_visible(True)
        s.set_color("black")
        s.set_linewidth(1.2)
    png = os.path.join(OUT, name + ".png")
    fig.savefig(png, dpi=DPI, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    meta = {
        "name": name, "xlim": list(xlim), "ylim": list(ylim),
        "xlog": bool(xlog), "ylog": bool(ylog), "curves": curves,
    }
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(meta, f)
    print("ok", name)


def curve(x, y, color, style):
    return {"x": [float(v) for v in x], "y": [float(v) for v in y],
            "color": hexrgb(color), "style": style}


def new():
    return plt.subplots(figsize=(7, 4))


# 1. une seule ligne solide
x = np.linspace(0, 10, 400); y = np.sin(x)
f, a = new(); a.plot(x, y, color="C0", lw=2)
save("01_solid_single", f, a, [curve(x, y, "C0", "solid")], (0, 10), (-1.1, 1.1))

# 2. plusieurs lignes solides couleurs distinctes
f, a = new(); cs = ["#d62728", "#1f77b4", "#2ca02c"]; cv = []
for i, c in enumerate(cs):
    yy = np.sin(x + i); a.plot(x, yy, color=c, lw=2); cv.append(curve(x, yy, c, "solid"))
save("02_solid_multi", f, a, cv, (0, 10), (-1.1, 1.1))

# 3. tirets
f, a = new(); a.plot(x, y, color="#9467bd", lw=2, ls="--")
save("03_dashed", f, a, [curve(x, y, "#9467bd", "dashed")], (0, 10), (-1.1, 1.1))

# 4. pointilles
f, a = new(); a.plot(x, y, color="#8c564b", lw=2, ls=":")
save("04_dotted", f, a, [curve(x, y, "#8c564b", "dotted")], (0, 10), (-1.1, 1.1))

# 5. tiret-point
f, a = new(); a.plot(x, y, color="#e377c2", lw=2, ls="-.")
save("05_dashdot", f, a, [curve(x, y, "#e377c2", "dashdot")], (0, 10), (-1.1, 1.1))

# 6. marqueurs
xs = np.linspace(0, 10, 40); ys = np.cos(xs)
f, a = new(); a.plot(xs, ys, color="#17becf", ls="none", marker="o", ms=6)
save("06_markers", f, a, [curve(xs, ys, "#17becf", "markers")], (0, 10), (-1.1, 1.1))

# 7. meme couleur, styles differents (separation par style)
f, a = new()
a.plot(x, np.sin(x), color="#d62728", lw=2, ls="-")
a.plot(x, np.sin(x) * 0.6, color="#d62728", lw=2, ls="--")
save("07_samecolor_styles", f, a,
     [curve(x, np.sin(x), "#d62728", "solid"), curve(x, np.sin(x) * 0.6, "#d62728", "dashed")],
     (0, 10), (-1.1, 1.1))

# 8. teintes proches (deux oranges)
f, a = new()
a.plot(x, np.sin(x), color="#e6550d", lw=2)
a.plot(x, np.sin(x + 0.8), color="#fdae6b", lw=2)
save("08_close_hues", f, a,
     [curve(x, np.sin(x), "#e6550d", "solid"), curve(x, np.sin(x + 0.8), "#fdae6b", "solid")],
     (0, 10), (-1.1, 1.1))

# 9. lignes epaisses
f, a = new(); a.plot(x, y, color="#1f77b4", lw=5)
save("09_thick", f, a, [curve(x, y, "#1f77b4", "solid")], (0, 10), (-1.1, 1.1))

# 10. lignes fines
f, a = new(); a.plot(x, y, color="#1f77b4", lw=0.8)
save("10_thin", f, a, [curve(x, y, "#1f77b4", "solid")], (0, 10), (-1.1, 1.1))

# 11. grille solide
f, a = new(); a.plot(x, y, color="#2ca02c", lw=2); a.grid(True, color="#cccccc")
save("11_grid_solid", f, a, [curve(x, y, "#2ca02c", "solid")], (0, 10), (-1.1, 1.1))

# 12. grille pointillee grise
f, a = new(); a.plot(x, y, color="#2ca02c", lw=2); a.grid(True, color="#999999", ls=":")
save("12_grid_dotted", f, a, [curve(x, y, "#2ca02c", "solid")], (0, 10), (-1.1, 1.1))

# 13. legende dans le cadre (swatches)
f, a = new()
a.plot(x, np.sin(x), color="#1f77b4", lw=2, label="A")
a.plot(x, np.cos(x), color="#d62728", lw=2, label="B")
a.legend(loc="lower left")
save("13_legend_inside", f, a,
     [curve(x, np.sin(x), "#1f77b4", "solid"), curve(x, np.cos(x), "#d62728", "solid")],
     (0, 10), (-1.1, 1.1))

# 14. axe X log
xl = np.logspace(0, 3, 400); yl = np.log10(xl)
f, a = new(); a.plot(xl, yl, color="#1f77b4", lw=2)
save("14_logx", f, a, [curve(xl, yl, "#1f77b4", "solid")], (1, 1000), (0, 3), xlog=True)

# 15. axe Y log
xv = np.linspace(0, 10, 400); yv = np.power(10.0, xv / 5.0)
f, a = new(); a.plot(xv, yv, color="#d62728", lw=2)
save("15_logy", f, a, [curve(xv, yv, "#d62728", "solid")], (0, 10), (1, 100), ylog=True)

# 16. croisement meme couleur
f, a = new()
a.plot(x, np.sin(x), color="#9467bd", lw=2)
a.plot(x, -np.sin(x), color="#9467bd", lw=2)
save("16_crossing_samecolor", f, a,
     [curve(x, np.sin(x), "#9467bd", "solid"), curve(x, -np.sin(x), "#9467bd", "solid")],
     (0, 10), (-1.1, 1.1))

# 17. courbe bruitee
rng = np.random.default_rng(0)
yn = np.sin(x) + rng.normal(0, 0.05, x.shape)
f, a = new(); a.plot(x, yn, color="#2ca02c", lw=1.5)
save("17_noisy", f, a, [curve(x, yn, "#2ca02c", "solid")], (0, 10), (-1.3, 1.3))

# 18. gaussiennes qui se chevauchent (cas reel)
g1 = np.exp(-((x - 4) ** 2) / 2) ; g2 = np.exp(-((x - 6) ** 2) / 3) * 0.7
f, a = new()
a.plot(x, g1, color="#e377c2", lw=2)
a.plot(x, g2, color="#2ca02c", lw=2)
save("18_overlap_gauss", f, a,
     [curve(x, g1, "#e377c2", "solid"), curve(x, g2, "#2ca02c", "solid")],
     (0, 10), (0, 1.1))

print("corpus dans", OUT)
