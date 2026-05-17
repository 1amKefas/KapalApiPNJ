# -*- coding: utf-8 -*-
"""
Utility functions untuk pipeline ML Predictive Maintenance.
Berisi helper plotting, seeding, dan display.
"""
import os
import random
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import warnings


def setup_environment(seed=42):
    """Setup random seed dan visualisasi global."""
    os.environ['PYTHONHASHSEED'] = str(seed)
    np.random.seed(seed)
    random.seed(seed)

    try:
        import tensorflow as tf
        tf.random.set_seed(seed)
        tf.keras.utils.set_random_seed(seed)
    except ImportError:
        pass

    sns.set_theme(style="whitegrid", palette="muted")
    plt.rcParams['figure.figsize'] = (12, 6)
    plt.rcParams['font.size'] = 11
    warnings.filterwarnings('ignore')


def save_or_show(fig, filename, save=True, plot_dir="plots", dpi=150):
    """Simpan plot ke file atau tampilkan langsung."""
    plt.tight_layout()
    if save:
        os.makedirs(plot_dir, exist_ok=True)
        filepath = os.path.join(plot_dir, filename)
        fig.savefig(filepath, dpi=dpi, bbox_inches='tight')
        print(f"  📊 Plot disimpan: {filepath}")
        plt.close(fig)
    else:
        plt.show()


def print_header(cell_num, title):
    """Print header untuk setiap tahap/cell."""
    print(f"\n{'='*60}")
    print(f"  STEP {cell_num}: {title}")
    print(f"{'='*60}")


def print_done(cell_num):
    """Print pesan selesai untuk setiap tahap."""
    print(f"  ✅ Step {cell_num} Selesai.\n")
