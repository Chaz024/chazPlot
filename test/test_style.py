import os
import sys
import unittest
import configparser

import matplotlib
matplotlib.use("Agg")
import matplotlib.colors as mcolors
from matplotlib import rcParams

STYLES_DIR = os.path.join(os.path.dirname(__file__), "..", "python", "styles")


def _load_mplstyle_file(path):
    """Load an .mplstyle file and return parsed rcParams as a dict."""
    from matplotlib import rcParamsDefault
    import ast

    if not os.path.exists(path):
        raise FileNotFoundError(f"Style file not found: {path}")

    params = rcParamsDefault.copy()

    # matplotlib mplstyle files are key:value pairs directly (not ConfigParser sections)
    with open(path, 'r') as f:
        for line in f:
            # Skip comments and empty lines
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            # Parse key : value
            if ':' in line:
                key, val = line.split(':', 1)
                key = key.strip()
                val = val.strip()

                if key in params:
                    try:
                        # Try to convert value to the right type
                        if isinstance(params[key], bool):
                            val = val.lower() in ('true', '1', 'yes', 'on')
                        elif isinstance(params[key], (int, float)):
                            val = type(params[key])(val)
                        elif isinstance(params[key], (list, tuple)):
                            # Handle cycler and list values
                            try:
                                val = ast.literal_eval(val)
                            except:
                                pass
                        params[key] = val
                    except Exception:
                        pass

    return params


class VendoredFilesTests(unittest.TestCase):
    def _load(self, name):
        path = os.path.join(STYLES_DIR, name + ".mplstyle")
        return _load_mplstyle_file(path)

    def test_science_loads_key_params(self):
        params = self._load("science")
        self.assertEqual(params["axes.linewidth"], 0.5)
        self.assertEqual(params["xtick.direction"], "in")
        self.assertEqual(params["ytick.direction"], "in")
        self.assertTrue(params["xtick.minor.visible"])
        self.assertTrue(params["ytick.minor.visible"])
        self.assertFalse(params["legend.frameon"])
        self.assertEqual(params["font.family"], ["serif"])
        self.assertFalse(params["text.usetex"])
        colors = [mcolors.to_hex(c["color"]).lower()
                  for c in params["axes.prop_cycle"]]
        self.assertEqual(colors[0], "#0c5da5")

    def test_ieee_loads_delta(self):
        params = self._load("ieee")
        self.assertEqual(params["font.size"], 8.0)
        colors = [mcolors.to_hex(c["color"]).lower()
                  for c in params["axes.prop_cycle"]]
        self.assertEqual(colors[0], "#000000")

    def test_nature_loads_delta(self):
        params = self._load("nature")
        self.assertEqual(params["font.size"], 7.0)
        self.assertEqual(params["font.family"], ["sans-serif"])


if __name__ == "__main__":
    unittest.main()
