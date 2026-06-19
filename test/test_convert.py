import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from _mpl_to_plotly import convert_figure


class ConvertBaseTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_simple_line_one_scatter_trace(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1, 2], [3, 4, 5])
        spec = convert_figure(fig)
        self.assertIsNotNone(spec)
        self.assertEqual(len(spec["data"]), 1)
        self.assertEqual(spec["data"][0]["type"], "scatter")
        self.assertEqual(spec["data"][0]["mode"], "lines")

    def test_log_scale(self):
        fig, ax = plt.subplots()
        ax.plot([1, 10, 100], [1, 2, 3])
        ax.set_xscale("log")
        spec = convert_figure(fig)
        self.assertEqual(spec["layout"]["xaxis"]["type"], "log")

    def test_bar_orientation(self):
        fig, ax = plt.subplots()
        ax.barh(["a", "b"], [1, 2])
        spec = convert_figure(fig)
        bars = [t for t in spec["data"] if t["type"] == "bar"]
        self.assertTrue(bars and bars[0]["orientation"] == "h")

    def test_unsupported_fill_between_returns_none(self):
        fig, ax = plt.subplots()
        ax.fill_between([0, 1, 2], [0, 1, 0])
        self.assertIsNone(convert_figure(fig))

    def test_unsupported_text_returns_none(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [0, 1])
        ax.text(0.5, 0.5, "note")
        self.assertIsNone(convert_figure(fig))

    def test_two_subplots_two_axis_pairs(self):
        fig, (ax1, ax2) = plt.subplots(1, 2)
        ax1.plot([0, 1], [0, 1])
        ax2.plot([0, 1], [1, 0])
        spec = convert_figure(fig)
        self.assertIn("xaxis", spec["layout"])
        self.assertIn("xaxis2", spec["layout"])
        # non-régression twinx : aucun axe en overlay
        for key, val in spec["layout"].items():
            if key.startswith("yaxis"):
                self.assertNotIn("overlaying", val)


if __name__ == "__main__":
    unittest.main()
