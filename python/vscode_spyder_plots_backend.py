import pandas as pd
import numpy as np

temperatures = list(range(100, 1600, 100))

# 1. Capacité thermique isobare brute (J/kg.K)
# Source : NIST-JANAF 4th Edition (1998)
donnees_cp = {
    "Ar":  [520]*15,
    "CO":  [1039, 1039, 1040, 1047, 1064, 1087, 1113, 1139, 1163, 1185, 1203, 1219, 1234, 1246, 1257],
    "N2":  [1039, 1039, 1040, 1044, 1056, 1075, 1098, 1122, 1146, 1167, 1187, 1203, 1218, 1231, 1242],
    "CO2": [np.nan, np.nan, 846, 935, 1014, 1076, 1126, 1169, 1204, 1234, 1258, 1279, 1298, 1313, 1327],
    "NO":  [1076, 1013, 991, 982, 1010, 1035, 1061, 1086, 1106, 1125, 1144, 1158, 1167, 1179, 1197],
    "O2":  [909, 910, 919, 941, 972, 1003, 1031, 1054, 1074, 1090, 1103, 1114, 1125, 1134, 1143],
    "H2":  [10300, 13150, 14320, 14470, 14514, 14550, 14600, 14690, 14820, 14985, 15168, 15378, 15590, 15802, 16008],
    "H2O": [np.nan, np.nan, 1866, 1901, 1955, 2017, 2082, 2149, 2218, 2291, 2366, 2436, 2502, 2565, 2625],
    "H":   [np.nan, np.nan, 20621, 20621, 20621, 20621, 20621, 20621, 20621, 20621, 20622, 20622, 20622, 20622, 20622],
    "O":   [np.nan, np.nan, 1370, 1350, 1340, 1330, 1322, 1317, 1313, 1309, 1306, 1305, 1304, 1304, 1303],
    "N":   [np.nan, np.nan, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484, 1484],
    "OH":  [np.nan, np.nan, 1755, 1740, 1746, 1755, 1770, 1785, 1805, 1820, 1833, 1860, 1887, 1913, 1937]
}

# 2. Viscosité dynamique (10^-6 Pa.s)
# Source : NIST REFPROP & N.B. Vargaftik (Gaz purs à 1 bar)
# Les atomes/radicaux sont exclus (mesure macroscopique impossible).
donnees_viscosite = {
    "Ar":  [8.2, 15.9, 22.7, 28.8, 34.3, 39.4, 44.2, 48.8, 53.1, 57.3, 61.2, 65.0, 68.7, 72.2, 75.6],
    "CO":  [6.2, 11.8, 16.6, 20.8, 24.6, 28.1, 31.4, 34.5, 37.4, 40.2, 42.9, 45.4, 47.9, 50.3, 52.6],
    "N2":  [6.9, 12.9, 17.8, 22.0, 25.8, 29.3, 32.5, 35.6, 38.5, 41.3, 44.0, 46.5, 49.0, 51.4, 53.7],
    "CO2": [np.nan, np.nan, 15.0, 19.3, 23.2, 26.9, 30.3, 33.6, 36.7, 39.7, 42.6, 45.3, 48.0, 50.6, 53.1],
    "NO":  [7.2, 13.5, 18.8, 23.3, 27.5, 31.3, 34.9, 38.2, 41.4, 44.4, 47.3, 50.0, 52.7, 55.3, 57.8],
    "O2":  [7.7, 14.7, 20.6, 25.8, 30.4, 34.7, 38.8, 42.6, 46.2, 49.7, 53.1, 56.3, 59.4, 62.4, 65.4],
    "H2":  [4.2, 6.8, 9.0, 10.9, 12.6, 14.3, 15.9, 17.4, 18.8, 20.2, 21.5, 22.8, 24.1, 25.3, 26.5],
    "H2O": [np.nan, np.nan, 9.8, 13.5, 17.3, 21.1, 24.9, 28.6, 32.4, 36.1, 39.8, 43.4, 47.1, 50.7, 54.3],
    "H":   [np.nan]*15, "O": [np.nan]*15, "N": [np.nan]*15, "OH": [np.nan]*15
}

# 3. Conductivité thermique (10^-3 W/m.K)
# Source : NIST REFPROP & N.B. Vargaftik (Gaz purs à 1 bar)
# L'eau et le CO2 sont exclus à 100K/200K (état solide/liquide).
donnees_conductivite = {
    "Ar":  [6.4, 12.4, 17.7, 22.6, 27.2, 31.5, 35.6, 39.5, 43.2, 46.8, 50.2, 53.5, 56.7, 59.8, 62.8],
    "CO":  [8.4, 16.5, 24.1, 31.0, 37.5, 43.7, 49.5, 55.1, 60.5, 65.7, 70.8, 75.7, 80.5, 85.2, 89.8],
    "N2":  [9.6, 18.3, 25.9, 32.3, 38.3, 44.0, 49.5, 54.8, 60.0, 65.1, 70.1, 75.0, 79.8, 84.5, 89.1],
    "CO2": [np.nan, np.nan, 16.8, 24.3, 32.6, 41.2, 49.8, 58.2, 66.4, 74.3, 81.9, 89.3, 96.4, 103.3, 109.9],
    "NO":  [10.1, 18.5, 26.0, 33.0, 39.5, 45.7, 51.7, 57.5, 63.1, 68.5, 73.8, 79.0, 84.0, 88.9, 93.7],
    "O2":  [9.2, 17.4, 26.3, 34.3, 41.9, 49.2, 56.1, 62.8, 69.3, 75.7, 81.8, 87.8, 93.7, 99.4, 105.1],
    "H2":  [69.0, 131.0, 186.0, 230.0, 267.0, 302.0, 336.0, 369.0, 401.0, 432.0, 463.0, 493.0, 523.0, 552.0, 581.0],
    "H2O": [np.nan, np.nan, 18.5, 26.9, 36.3, 46.8, 58.2, 70.6, 83.9, 97.9, 112.5, 127.7, 143.4, 159.4, 175.9],
    "H":   [np.nan]*15, "O": [np.nan]*15, "N": [np.nan]*15, "OH": [np.nan]*15
}

def creer_et_sauvegarder_csv():
    # Création des DataFrames
    df_cp = pd.DataFrame(donnees_cp, index=temperatures).T
    df_mu = pd.DataFrame(donnees_viscosite, index=temperatures).T
    df_k = pd.DataFrame(donnees_conductivite, index=temperatures).T
    
    # Nommage de l'index
    df_cp.index.name = "Espece"
    df_mu.index.name = "Espece"
    df_k.index.name = "Espece"
    
    # Exportation (séparateur point-virgule)
    df_cp.to_csv("cp_janaf_brut.csv", sep=";")
    df_mu.to_csv("viscosite_vargaftik.csv", sep=";")
    df_k.to_csv("conductivite_vargaftik.csv", sep=";")
    
    print("Fichiers 'cp_janaf_brut.csv', 'viscosite_vargaftik.csv' et 'conductivite_vargaftik.csv' générés.")

if __name__ == "__main__":
    creer_et_sauvegarder_csv()

# ============================================================
# vscode_spyder_plots_backend.py — v3 (figures + animations)
#
# Backend matplotlib qui envoie le contenu de plt.show() vers le
# panneau VS Code de l'extension.
#
# Figures statiques : envoyees en plusieurs formats
#     - "plotly" : graphe interactif (priorite, vectoriel)
#     - "svg"    : vectoriel (fallback affichage, net a toute taille)
#     - "png"    : haute resolution (sauvegarde + dernier fallback)
#
# Animations (FuncAnimation / ArtistAnimation) : detectees
# automatiquement. Toutes les frames sont rendues en PNG et
# envoyees ensemble ("frames" + "interval") pour etre rejouees
# dans le panneau (play/pause, navigation frame par frame...).
# ============================================================

import base64
import io
import json
import os
import sys
import weakref
import urllib.request
import urllib.error

from matplotlib.backend_bases import _Backend, FigureManagerBase
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib._pylab_helpers import Gcf


def _register_vendored_styles():
    """Enregistre les styles vendorises (science/ieee/nature) dans la
    librairie de styles matplotlib, par nom, SANS le package scienceplots.
    Best-effort : ne jamais casser le run utilisateur. Appele a l'import du
    backend (donc avant tout trace), pour que plt.style.context('science')
    fonctionne."""
    try:
        import matplotlib.style as mstyle
        styles_dir = os.path.join(os.path.dirname(__file__), "styles")
        for name in ("science", "ieee", "nature"):
            path = os.path.join(styles_dir, name + ".mplstyle")
            try:
                import matplotlib as _mpl
                try:
                    params = _mpl.rc_params_from_file(
                        path, use_default_template=False)
                except AttributeError:
                    params = mstyle.core._rc_params_in_file(path)
                mstyle.core.library[name] = params
            except Exception:
                pass  # un style manquant/illisible ne bloque pas les autres
        mstyle.core.available[:] = sorted(mstyle.core.library.keys())
    except Exception:
        pass  # matplotlib.style indisponible : on ignore silencieusement


_WARNED = False
_SVG_MAX_BYTES = 8 * 1024 * 1024  # au-dela : fallback PNG pour l'affichage


# ------------------------------------------------------------
# Detection du style "science" actif a la construction d'une figure
# ------------------------------------------------------------
# Une figure construite sous `plt.style.context('science')` (ou ieee/nature) est
# rendue proprement par matplotlib (police serif, ticks internes...). On l'estampille
# pour que l'extension propose, par defaut, un export depuis les assets matplotlib
# plutot que depuis l'approximation Plotly. Le Plotly live, lui, reste brut.
_SCIENCE_STYLE_NAMES = ("science", "ieee", "nature")
_STYLE_CONTEXT_STACK = []   # piles de noms de styles des `with plt.style.context(...)`
_STYLE_AMBIENT = []         # dernier `plt.style.use(...)` (hors 'default')


def _style_names_from_arg(style):
    """Aplatit l'argument de style.use/context en liste de noms (str).
    Ignore dicts/Path (styles anonymes : non pertinents pour la detection)."""
    if isinstance(style, (list, tuple)):
        names = []
        for item in style:
            names.extend(_style_names_from_arg(item))
        return names
    if isinstance(style, str):
        return [style]
    return []


def _active_science_style():
    """Nom du style science actif (science/ieee/nature) au moment de l'appel,
    ou None."""
    names = list(_STYLE_AMBIENT)
    for layer in _STYLE_CONTEXT_STACK:
        names.extend(layer)
    science = [n for n in names if n in _SCIENCE_STYLE_NAMES]
    return science[-1] if science else None


def _install_style_hook():
    """Trace le style science actif a la construction des figures.

    - patch `matplotlib.style.context` : empile/depile les noms de styles ;
    - patch `matplotlib.style.use` : retient le dernier style ambiant ;
    - patch `Figure.__init__` : estampille la figure (`_sp_science_style`) avec le
      style science actif a sa creation.
    Best-effort : tout echec laisse le run intact (detection desactivee)."""
    try:
        import contextlib
        import matplotlib.style as mstyle
        import matplotlib.figure as mfigure
    except Exception:
        return

    if not getattr(mstyle, "_spyder_plots_style_hooked", False):
        orig_context = mstyle.context
        orig_use = mstyle.use

        @contextlib.contextmanager
        def patched_context(style, after_reset=False):
            names = _style_names_from_arg(style)
            _STYLE_CONTEXT_STACK.append(names)
            try:
                with orig_context(style, after_reset=after_reset):
                    yield
            finally:
                try:
                    _STYLE_CONTEXT_STACK.remove(names)
                except ValueError:
                    pass

        def patched_use(style):
            result = orig_use(style)
            names = _style_names_from_arg(style)
            if any(name == "default" for name in names):
                _STYLE_AMBIENT[:] = []
            else:
                _STYLE_AMBIENT[:] = names
            return result

        mstyle.context = patched_context
        mstyle.use = patched_use
        mstyle._spyder_plots_style_hooked = True

    if not getattr(mfigure.Figure, "_spyder_plots_style_hooked", False):
        orig_init = mfigure.Figure.__init__

        def patched_fig_init(self, *args, **kwargs):
            orig_init(self, *args, **kwargs)
            try:
                style = _active_science_style()
                if style is not None:
                    self._sp_science_style = style
            except Exception:
                pass

        mfigure.Figure.__init__ = patched_fig_init
        mfigure.Figure._spyder_plots_style_hooked = True

# Animations vivantes, enregistrees a leur creation (cf. _install_animation_hook)
_ANIMATIONS = []
def _anim_max_frames():
    """Plafond de frames capturees par animation (garde-fou memoire).
    Reglable via VSCODE_PLOTS_ANIM_MAX_FRAMES ; 0 (ou negatif) = illimite."""
    try:
        value = int(float(os.environ.get("VSCODE_PLOTS_ANIM_MAX_FRAMES", "600")))
    except ValueError:
        value = 600
    return value if value > 0 else None  # None -> illimite


def _port():
    """Port du serveur de l'extension, depuis l'env injecte (defaut 53210)."""
    return os.environ.get("VSCODE_PLOTS_PORT", "53210")


def _port_file_path():
    """Chemin du fichier tmp ou l'extension publie son port actif (fallback)."""
    import tempfile
    return os.path.join(tempfile.gettempdir(), "chaz-plots-port.json")


def _port_from_file():
    """Port actif ecrit par l'extension (fallback si l'env est perime)."""
    try:
        with open(_port_file_path(), "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return str(int(data.get("port")))
    except Exception:
        return None


def _dpi():
    """DPI de rendu des figures statiques (env VSCODE_PLOTS_DPI, defaut 200)."""
    try:
        return float(os.environ.get("VSCODE_PLOTS_DPI", "200"))
    except ValueError:
        return 200.0


def _pdf_enabled():
    """Generer aussi un PDF vectoriel matplotlib (env VSCODE_PLOTS_PDF, defaut 1).
    Mis a 0 par l'extension si le reglage chazPlots.includePdf est desactive."""
    return os.environ.get("VSCODE_PLOTS_PDF", "1") != "0"


def _pre_render_plotly_png():
    """Rendre aussi un PNG matplotlib pour les figures deja interactives.
    Desactive par defaut : Plotly sait exporter PNG cote webview, ce rendu
    coutait cher a chaque plt.show()."""
    return os.environ.get("VSCODE_PLOTS_PLOTLY_PNG", "0") != "0"


def _pre_render_plotly_pdf():
    """Rendre aussi un PDF matplotlib natif pour les figures deja interactives.
    Desactive par defaut : le webview exporte un PDF raster a la demande."""
    return os.environ.get("VSCODE_PLOTS_PLOTLY_PDF", "0") != "0"


def _anim_dpi():
    """DPI utilise pour les frames d'animation (plus leger que le statique,
    car multiplie par le nombre de frames). Reglable via VSCODE_PLOTS_ANIM_DPI."""
    try:
        return float(os.environ.get("VSCODE_PLOTS_ANIM_DPI", "130"))
    except ValueError:
        return 130.0


# ------------------------------------------------------------
# Detection des animations
# ------------------------------------------------------------
def _install_animation_hook():
    """Enregistre chaque Animation creee, pour pouvoir la retrouver
    depuis sa figure lors du plt.show()."""
    try:
        import matplotlib.animation as manimation
    except Exception:
        return
    if getattr(manimation.Animation, "_spyder_plots_hooked", False):
        return
    original_init = manimation.Animation.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        try:
            _ANIMATIONS.append(weakref.ref(self))
        except Exception:
            pass

    patched_init._spyder_plots_hooked = True
    manimation.Animation.__init__ = patched_init
    manimation.Animation._spyder_plots_hooked = True


def _animations_for_figure(figure):
    """Animations encore vivantes attachees a cette figure."""
    alive = []
    found = []
    for ref in _ANIMATIONS:
        anim = ref()
        if anim is None:
            continue
        alive.append(ref)
        if getattr(anim, "_fig", None) is figure:
            found.append(anim)
    _ANIMATIONS[:] = alive
    return found


def _make_frame_collector(fps, dpi):
    """Construit un writer (sous-classe de l'API publique AbstractMovieWriter)
    qui, au lieu d'ecrire une video, capture chaque frame en PNG base64."""
    import matplotlib.animation as manimation

    class _FrameCollector(manimation.AbstractMovieWriter):
        def __init__(self):
            super().__init__(fps=fps)
            self._dpi = dpi
            self._fig = None
            self.frames = []

        def setup(self, fig, outfile=None, dpi=None, *args, **kwargs):
            self._fig = fig
            if dpi:
                self._dpi = dpi

        def grab_frame(self, **savefig_kwargs):
            if self._fig is None:
                return
            # matplotlib injecte deja facecolor/bbox dans savefig_kwargs selon
            # la version : on respecte ces valeurs et on ne les ecrase pas.
            savefig_kwargs.pop("dpi", None)
            savefig_kwargs.pop("bbox_inches", None)
            savefig_kwargs.setdefault("facecolor", self._fig.get_facecolor())
            savefig_kwargs.setdefault("edgecolor", "none")
            buffer = io.BytesIO()
            self._fig.savefig(buffer, format="png", dpi=self._dpi, **savefig_kwargs)
            self.frames.append(base64.b64encode(buffer.getvalue()).decode("ascii"))

        def finish(self):
            pass

    return _FrameCollector()


def _include_gif():
    """Active l'encodage GIF (PillowWriter). Opt-in 1/0 ; defaut ON
    (cout ~150-300ms par animation, negligeable cote UX)."""
    raw = os.environ.get("VSCODE_PLOTS_GIF")
    if raw is None:
        return True
    return raw == "1"


def _include_mp4():
    """Active l'encodage MP4 (ffmpeg + libx264 via image2pipe). Opt-in 1/0 ;
    defaut OFF car peut bloquer plt.show() plusieurs secondes par animation
    longue. L'utilisateur l'active dans user settings."""
    raw = os.environ.get("VSCODE_PLOTS_MP4")
    if raw is None:
        return False
    return raw == "1"


def _encode_animation_gif(frames_b64, interval_ms):
    """Frames PNG base64 -> GIF base64 via PIL/Pillow. Best-effort : renvoie
    None en cas d'echec (log sur stderr). Pillow est toujours disponible (deja
    dependencia de matplotlib)."""
    if not frames_b64:
        return None
    try:
        from PIL import Image
        import io as _io
        images = []
        for b64 in frames_b64:
            try:
                images.append(Image.open(_io.BytesIO(base64.b64decode(b64))).convert("RGB"))
            except Exception:
                continue
        if not images:
            return None
        # Mode P (palette 256) : GIF impose 8 bits ; quantize par median-cut.
        paletted = [im.quantize(colors=256, method=Image.MEDIANCUT) for im in images]
        out = _io.BytesIO()
        # Pillow : `duration` est en CENTIEMES de seconde (1/100 s), pas en ms.
        # Pour une anim a 50 ms/frame on ecrit 5 (centiemes de seconde) ; sinon
        # le GIF sort 10x trop lent (bug classique). Plancher 2 (20 ms).
        duration = max(2, int(round(interval_ms / 10.0)))
        paletted[0].save(
            out,
            format="GIF",
            save_all=True,
            append_images=paletted[1:],
            duration=duration,
            loop=0,
            disposal=2,
            optimize=False,
        )
        return base64.b64encode(out.getvalue()).decode("ascii")
    except Exception as error:
        sys.stderr.write("[chaz-plots] Echec encodage GIF : " + str(error) + "\n")
        return None


def _ffmpeg_available():
    """Detecte si ffmpeg est utilisable sur le PATH (rapide, 2s timeout)."""
    try:
        import subprocess
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            check=True, timeout=2.0,
        )
        return True
    except Exception:
        return False


def _encode_animation_mp4(frames_b64, interval_ms, fps):
    """Frames PNG base64 -> MP4 base64 en passant par ffmpeg -image2pipe.
    Le demuxer image2pipe de ffmpeg auto-detecte chaque frame comme PNG sur
    stdin et produit un MP4 h264 (libx264) pix_fmt yuv420p, faststart Web.
    Best-effort : None si ffmpeg absent ou en cas d'echec."""
    if not frames_b64:
        return None
    if not _ffmpeg_available():
        sys.stderr.write("[chaz-plots] ffmpeg introuvable sur PATH; MP4 non produit (activez chazPlots.includeMp4 seulement si ffmpeg est installe).\n")
        return None
    try:
        import subprocess
        # pad=ceil(iw/2)*2:ceil(ih/2)*2 : h264 exige des dimensions paires.
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "image2pipe", "-framerate", str(fps),
            "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-movflags", "+faststart",
            "-f", "mp4", "-",
        ]
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        for b64 in frames_b64:
            try:
                proc.stdin.write(base64.b64decode(b64))
            except Exception:
                break
        try:
            proc.stdin.close()
        except Exception:
            pass
        try:
            out_bytes = proc.stdout.read()
        except Exception:
            out_bytes = b""
        try:
            proc.wait(timeout=180)
        except subprocess.TimeoutExpired:
            proc.kill()
            sys.stderr.write("[chaz-plots] ffmpeg timeout ; MP4 abandonne.\n")
            return None
        if proc.returncode != 0 or not out_bytes:
            err = proc.stderr.read() if proc.stderr else b""
            sys.stderr.write("[chaz-plots] ffmpeg a echoue (rc=" + str(proc.returncode) + ") : "
                + (err.decode("utf-8", "replace")[:500] if err else "?") + "\n")
            return None
        return base64.b64encode(out_bytes).decode("ascii")
    except Exception as error:
        sys.stderr.write("[chaz-plots] Echec encodage MP4 : " + str(error) + "\n")
        return None


def _capture_animation(anim):
    """Capture les frames d'une animation, plus eventuellement un GIF (par
    defaut) et un MP4 (opt-in via chazPlots.includeMp4).
    Retourne un dict {frames, interval, gif?, mp4?} ou None en cas d'echec."""
    interval = getattr(anim, "_interval", None) or 200
    try:
        interval = float(interval)
    except (TypeError, ValueError):
        interval = 200.0
    fps = max(1000.0 / max(interval, 1.0), 1.0)

    collector = _make_frame_collector(fps=fps, dpi=_anim_dpi())
    try:
        anim.save("__spyder_plots__.png", writer=collector, dpi=_anim_dpi())
    except Exception as error:
        sys.stderr.write("[chaz-plots] Echec de capture de l'animation : " + str(error) + "\n")
        return None

    frames = collector.frames
    if not frames:
        return None
    cap = _anim_max_frames()
    if cap is not None and len(frames) > cap:
        frames = frames[:cap]
        sys.stderr.write(
            "[chaz-plots] Animation tronquee a "
            + str(cap)
            + " frames (reglez chazPlots.animationMaxFrames, 0 = illimite).\n"
        )
    payload = {"frames": frames, "interval": interval}
    if _include_gif():
        payload["gif"] = _encode_animation_gif(frames, interval)
    if _include_mp4():
        payload["mp4"] = _encode_animation_mp4(frames, interval, fps)
    return payload


# ------------------------------------------------------------
# Envoi reseau
# ------------------------------------------------------------
def _send_figure(payload):
    """Envoie une figure (ou une animation) au serveur local de l'extension.

    Essaie d'abord le port de l'environnement, puis le port lu dans le fichier
    temporaire ecrit par l'extension (fallback si l'env est perime apres un
    redemarrage de l'extension sur un autre port)."""
    global _WARNED
    body = json.dumps(payload).encode("utf-8")
    candidates = [_port()]
    file_port = _port_from_file()
    if file_port is not None and file_port not in candidates:
        candidates.append(file_port)

    for port in candidates:
        url = "http://127.0.0.1:" + port + "/figure"
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(request, timeout=15.0)
            return True
        except (urllib.error.URLError, OSError):
            continue

    if not _WARNED:
        _WARNED = True
        sys.stderr.write(
            "[chaz-plots] Impossible de joindre l'extension VS Code sur le port "
            + _port()
            + ". Verifiez que l'extension est active, puis ouvrez un NOUVEAU terminal.\n"
        )
    return False


# ------------------------------------------------------------
# Provenance : d'ou vient une figure (script, ligne, env, git, date)
# ------------------------------------------------------------
_GIT_CACHE = {}


def _caller_frame():
    """Premiere frame de la pile qui n'appartient ni a ce backend ni a
    matplotlib : c'est le code utilisateur qui a appele plt.show()."""
    frame = sys._getframe()
    while frame is not None:
        name = frame.f_code.co_filename
        in_mpl = (os.sep + "matplotlib" + os.sep) in name
        if name != __file__ and not in_mpl and not name.startswith("<"):
            return frame
        frame = frame.f_back
    return None


def _git_info(cwd):
    """Etat git du depot contenant cwd (commit court, branche, modifie ?).
    Mis en cache par cwd ; tout echec (pas de git, pas un depot) -> None."""
    if cwd in _GIT_CACHE:
        return _GIT_CACHE[cwd]
    info = {"git_commit": None, "git_branch": None, "git_dirty": None}
    try:
        import subprocess

        def run(args):
            return subprocess.run(
                ["git"] + args, cwd=cwd,
                capture_output=True, text=True, timeout=2.0,
            )

        head = run(["rev-parse", "--short", "HEAD"])
        if head.returncode == 0:
            info["git_commit"] = head.stdout.strip()
            branch = run(["rev-parse", "--abbrev-ref", "HEAD"])
            if branch.returncode == 0:
                info["git_branch"] = branch.stdout.strip()
            status = run(["status", "--porcelain"])
            if status.returncode == 0:
                info["git_dirty"] = bool(status.stdout.strip())
    except Exception:
        pass
    _GIT_CACHE[cwd] = info
    return info


def _provenance():
    """Contexte de production des figures du show() courant : script + ligne
    d'appel, cwd, interpreteur, ligne de commande, etat git, date complete.
    Best-effort : chaque champ indisponible reste None."""
    import datetime

    cwd = os.getcwd()
    prov = {
        "timestamp": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "cwd": cwd,
        "python": sys.executable,
        "python_version": sys.version.split()[0],
        "command": " ".join(sys.argv) if sys.argv else None,
        "script": None,
        "source": None,
        "line": None,
        "function": None,
    }
    try:
        if sys.argv and sys.argv[0]:
            prov["script"] = os.path.abspath(sys.argv[0])
    except Exception:
        pass
    frame = _caller_frame()
    if frame is not None:
        prov["source"] = frame.f_code.co_filename
        prov["line"] = frame.f_lineno
        prov["function"] = frame.f_code.co_name
    prov.update(_git_info(cwd))
    return prov


def _figure_title(manager):
    """Titre de la figure : le window title s'il existe, sinon "Figure <num>"."""
    title = None
    try:
        title = manager.get_window_title()
    except Exception:
        title = None
    if title is None or title == "":
        title = "Figure " + str(manager.num)
    return title


def _render_diag(plotly_spec, svg_bytes, plotly_reason, svg_too_big):
    """Diagnostic de rendu transmis a l'UI (badge + raison du repli).

    mode in {"plotly", "svg", "png"} ; pour un repli, code/message/detail
    reprennent la raison renvoyee par le convertisseur (cf. convert_figure_with_reason),
    ou signalent un SVG trop volumineux."""
    if plotly_spec is not None:
        return {"mode": "plotly"}
    base = plotly_reason or {
        "code": "unknown",
        "message": "Rendu interactif indisponible",
        "detail": None,
    }
    if svg_bytes is not None:
        return {
            "mode": "svg",
            "code": base.get("code"),
            "message": base.get("message"),
            "detail": base.get("detail"),
        }
    if svg_too_big:
        return {
            "mode": "png",
            "code": "svg_too_big",
            "message": "Rendu SVG trop volumineux (> 8 Mo)",
            "detail": base.get("message"),
        }
    return {
        "mode": "png",
        "code": base.get("code"),
        "message": base.get("message"),
        "detail": base.get("detail"),
    }


def _render(figure, file_format, dpi):
    """Rend la figure dans le format demande, retourne les octets (ou None)."""
    buffer = io.BytesIO()
    try:
        figure.savefig(
            buffer,
            format=file_format,
            dpi=dpi,
            bbox_inches="tight",
            facecolor=figure.get_facecolor(),
            edgecolor="none",
        )
    except Exception as error:
        sys.stderr.write(
            "[chaz-plots] Echec du rendu " + file_format + " : " + str(error) + "\n"
        )
        return None
    return buffer.getvalue()


# ------------------------------------------------------------
# Backend
# ------------------------------------------------------------
@_Backend.export
class _BackendVSCodeSpyderPlots(_Backend):
    FigureCanvas = FigureCanvasAgg
    FigureManager = FigureManagerBase

    @classmethod
    def show(cls, block=None):
        """Appele par plt.show() : envoie toutes les figures ouvertes, en
        rejouant les animations detectees frame par frame. Ne bloque jamais."""
        _install_animation_hook()
        managers = Gcf.get_all_fig_managers()
        if len(managers) == 0:
            return

        # Provenance commune a toutes les figures de ce plt.show() (meme site
        # d'appel, meme instant, meme etat git).
        provenance = _provenance()

        for manager in managers:
            figure = manager.canvas.figure
            title = _figure_title(manager)

            # --- 1) animation attachee a cette figure ? ---
            anims = _animations_for_figure(figure)
            if anims:
                captured = _capture_animation(anims[0])
                if captured is not None and captured.get("frames") is not None:
                    payload = {
                        "title": title,
                        "frames": captured["frames"],
                        "interval": captured["interval"],
                        "render": {"mode": "animation"},
                        "provenance": provenance,
                    }
                    if captured.get("gif"):
                        payload["gif"] = captured["gif"]
                    if captured.get("mp4"):
                        payload["mp4"] = captured["mp4"]
                    _send_figure(payload)
                    continue
                # echec de capture -> on retombe sur un rendu statique

            # --- 2) figure statique ---
            plotly_spec = None
            plotly_reason = None
            try:
                from _mpl_to_plotly import convert_figure_with_reason
                plotly_spec, plotly_reason = convert_figure_with_reason(figure)
            except Exception as error:
                plotly_spec = None
                plotly_reason = {
                    "code": "exception",
                    "message": "Erreur interne du convertisseur",
                    "detail": str(error),
                }

            science_style = getattr(figure, "_sp_science_style", None)
            pre_render_plotly_png = plotly_spec is not None and (_pre_render_plotly_png() or science_style is not None)
            png_bytes = _render(figure, "png", _dpi()) if (plotly_spec is None or pre_render_plotly_png) else None
            svg_bytes = None
            svg_too_big = False
            if plotly_spec is None:
                svg_bytes = _render(figure, "svg", _dpi())
                if svg_bytes is not None and len(svg_bytes) > _SVG_MAX_BYTES:
                    svg_bytes = None
                    svg_too_big = True

            if plotly_spec is None and svg_bytes is None and png_bytes is None:
                continue

            # PDF vectoriel matplotlib (rendu natif, fidele). Pour les figures
            # Plotly ordinaires, on l'evite par defaut : le webview exporte un
            # PDF raster a la demande, beaucoup plus rapide au plt.show().
            pre_render_plotly_pdf = plotly_spec is not None and (_pre_render_plotly_pdf() or science_style is not None)
            pdf_bytes = _render(figure, "pdf", _dpi()) if (_pdf_enabled() and (plotly_spec is None or pre_render_plotly_pdf)) else None

            render = _render_diag(plotly_spec, svg_bytes, plotly_reason, svg_too_big)

            # PGF/TikZ is intentionally not generated during capture.
            # It is fragile on complex matplotlib artists, while PNG/SVG export
            # is reliable and can be included from LaTeX with \includegraphics.
            _send_figure({
                "title": title,
                "plotly": plotly_spec,
                "pgf": None,
                "svg": base64.b64encode(svg_bytes).decode("ascii") if svg_bytes is not None else None,
                "png": base64.b64encode(png_bytes).decode("ascii") if png_bytes is not None else None,
                "pdf": base64.b64encode(pdf_bytes).decode("ascii") if pdf_bytes is not None else None,
                "render": render,
                "sciencePlot": science_style is not None,
                "scienceStyle": science_style,
                "provenance": provenance,
            })

        # Comme Spyder : les figures sont consommees par show().
        Gcf.destroy_all()


# Enregistre les styles SciencePlots vendorises des l'import du backend, pour
# que `with plt.style.context('science')` fonctionne sans installer scienceplots.
_register_vendored_styles()

# Trace le style science actif a la construction des figures (estampillage), des
# l'import, donc avant que l'utilisateur ne construise ses figures.
_install_style_hook()

# Hook installe des l'import du backend (et re-tente a chaque show()).
_install_animation_hook()
