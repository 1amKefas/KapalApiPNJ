# -*- coding: utf-8 -*-
"""
Main Pipeline - Predictive Maintenance ML
==========================================
Converted from Google Colab notebook to local Python.

Usage:
    cd ml/
    python pipeline.py

Pastikan file CSV sudah ada di folder ml/data/:
  - sensor_readings.csv
  - maintenance_logs.csv
"""
import sys
import os
import time

# Tambahkan ml/ ke path agar import config/utils bisa jalan
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import SENSOR_CSV, MAINTENANCE_CSV, SEED
from utils import setup_environment, print_header


def check_data():
    """Cek apakah file CSV ada."""
    missing = []
    for f in [SENSOR_CSV, MAINTENANCE_CSV]:
        if not os.path.exists(f):
            missing.append(f)
    if missing:
        print("❌ File data tidak ditemukan:")
        for f in missing:
            print(f"   - {f}")
        print(f"\n💡 Taruh file CSV di folder: {os.path.dirname(SENSOR_CSV)}/")
        sys.exit(1)


def main():
    start = time.time()

    print("🚀 Predictive Maintenance ML Pipeline")
    print("=" * 60)

    # Setup
    setup_environment(SEED)
    check_data()

    import tensorflow as tf
    print(f"  Python: {sys.version.split()[0]}")
    print(f"  TensorFlow: {tf.__version__}")
    print(f"  GPU: {'Ya' if tf.config.list_physical_devices('GPU') else 'Tidak (CPU)'}")

    # Context dictionary untuk passing data antar steps
    ctx = {}

    # Step 1-4: Load, clean, EDA, merge
    from steps.step_data import run as run_data
    ctx = run_data(ctx)

    # Step 5-8: Features, labels, split, sequences
    from steps.step_features import run as run_features
    ctx = run_features(ctx)

    # Step 9-10: RF baseline + Hybrid model
    from steps.step_models import run as run_models
    ctx = run_models(ctx)

    # Step 11-12: Classification + comparison
    from steps.step_evaluate import run as run_evaluate
    ctx = run_evaluate(ctx)

    elapsed = time.time() - start
    print(f"\n⏱️  Total waktu: {elapsed/60:.1f} menit")


if __name__ == "__main__":
    main()
