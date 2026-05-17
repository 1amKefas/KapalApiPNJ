# -*- coding: utf-8 -*-
"""Step 1-4: Load, inspect, clean, and merge datasets."""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from config import *
from utils import print_header, print_done, save_or_show


def run(ctx):
    # === STEP 1: LOAD DATA ===
    print_header(1, "LOAD & INSPECT DATA")
    df_sensor = pd.read_csv(SENSOR_CSV)
    df_maint = pd.read_csv(MAINTENANCE_CSV)
    print(f"  📊 Sensor: {df_sensor.shape} | Maintenance: {df_maint.shape}")

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    axes[0].hist(df_sensor['temperature'], bins=30, color='skyblue', edgecolor='black', alpha=0.7)
    axes[0].set_title('Distribusi Temperature'); axes[0].set_xlabel('°C')
    df_maint['maintenance_type'].value_counts().plot(kind='bar', ax=axes[1], color=['coral', 'steelblue'], edgecolor='black')
    axes[1].set_title('Jenis Maintenance'); axes[1].tick_params(axis='x', rotation=0)
    df_sensor['machine_id'].value_counts().sort_index().head(10).plot(kind='bar', ax=axes[2], color='seagreen', edgecolor='black')
    axes[2].set_title('Data per Mesin (Top 10)'); axes[2].tick_params(axis='x', rotation=45)
    save_or_show(fig, "01_data_overview.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(1)

    # === STEP 2: CLEANING & SORTING ===
    print_header(2, "DATA CLEANING & SORTING")
    df_sensor['timestamp'] = pd.to_datetime(df_sensor['timestamp'], errors='coerce')
    df_maint['date'] = pd.to_datetime(df_maint['date'], errors='coerce')
    df_sensor['machine_id'] = df_sensor['machine_id'].astype(str).str.strip()
    df_maint['machine_id'] = df_maint['machine_id'].astype(str).str.strip()
    df_sensor.dropna(subset=['machine_id', 'timestamp'], inplace=True)
    df_maint.dropna(subset=['machine_id', 'date'], inplace=True)
    df_maint['parts_replaced'] = df_maint['parts_replaced'].fillna('None')
    df_sensor = df_sensor.sort_values(['machine_id', 'timestamp']).reset_index(drop=True)
    df_maint = df_maint.sort_values(['machine_id', 'date']).reset_index(drop=True)
    print(f"  ✅ Rows setelah cleaning: Sensor={len(df_sensor)}, Maint={len(df_maint)}")

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].plot(df_sensor.groupby('timestamp').size(), color='purple', linewidth=1.5)
    axes[0].set_title('Frekuensi Data per Timestamp')
    missing = pd.DataFrame({'Sensor': df_sensor.isnull().sum(), 'Maintenance': df_maint.isnull().sum()})
    missing.plot(kind='bar', ax=axes[1], color=['skyblue', 'coral'])
    axes[1].set_title('Missing Values per Kolom'); axes[1].tick_params(axis='x', rotation=90)
    save_or_show(fig, "02_cleaning.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(2)

    # === STEP 3: EDA ===
    print_header(3, "EDA & VISUALIZATION")
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    # Distribusi fitur sensor by failure
    for i, feat in enumerate(SENSOR_COLS):
        r, c = i // 2, i % 2
        sns.histplot(data=df_sensor, x=feat, hue='failure', bins=50, kde=True,
                     ax=axes[r, c], palette=['#2ecc71', '#e74c3c'], alpha=0.6)
        axes[r, c].set_title(f'Distribusi {feat.capitalize()}')
    save_or_show(fig, "03a_sensor_distributions.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    # Correlation matrix
    fig2, ax = plt.subplots(figsize=(12, 8))
    numeric_cols = df_sensor.select_dtypes(include=[np.number]).columns
    corr = df_sensor[numeric_cols].corr()
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt=".2f", cmap='coolwarm', vmin=-1, vmax=1, square=True, ax=ax)
    ax.set_title('Korelasi Antar Fitur Sensor & Kegagalan')
    save_or_show(fig2, "03b_correlation.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    # Maintenance logs
    fig3, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
    sns.countplot(data=df_maint, x='maintenance_type', palette='Set2', ax=ax1)
    ax1.set_title('Frekuensi Jenis Maintenance')
    if 'cost_idr' in df_maint.columns:
        cost_by_type = df_maint.groupby('maintenance_type')['cost_idr'].sum().reset_index()
        sns.barplot(data=cost_by_type, x='maintenance_type', y='cost_idr', palette='Set2', ax=ax2)
        ax2.set_title('Total Biaya Maintenance per Tipe (IDR)')
    save_or_show(fig3, "03c_maintenance.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    # Failure class balance
    normal_count = df_sensor[df_sensor['failure'] == 0].shape[0]
    failure_count = df_sensor[df_sensor['failure'] == 1].shape[0]
    total = df_sensor.shape[0]
    print(f"  Normal: {(normal_count/total)*100:.2f}% | Failure: {(failure_count/total)*100:.2f}%")
    print_done(3)

    # === STEP 4: MERGE DATASETS ===
    print_header(4, "MERGE SENSOR + MAINTENANCE")
    # Verifikasi sorting
    is_sensor_ok = df_sensor.groupby('machine_id')['timestamp'].apply(lambda x: x.is_monotonic_increasing).all()
    is_maint_ok = df_maint.groupby('machine_id')['date'].apply(lambda x: x.is_monotonic_increasing).all()
    print(f"  Sensor sorting valid: {is_sensor_ok} | Maint sorting valid: {is_maint_ok}")

    if not (is_sensor_ok and is_maint_ok):
        df_sensor = df_sensor.groupby('machine_id', group_keys=False).apply(lambda x: x.sort_values('timestamp')).reset_index(drop=True)
        df_maint = df_maint.groupby('machine_id', group_keys=False).apply(lambda x: x.sort_values('date')).reset_index(drop=True)

    try:
        df_merged = pd.merge_asof(
            df_sensor, df_maint[['date', 'machine_id', 'maintenance_type', 'downtime_hours']],
            left_on='timestamp', right_on='date', by='machine_id', direction='backward'
        )
        print("  ✅ Merge asof berhasil!")
    except ValueError as e:
        print(f"  ⚠️ Merge asof gagal: {e}. Fallback ke manual merge...")
        def get_last_maint(row):
            mask = (df_maint['machine_id'] == row['machine_id']) & (df_maint['date'] <= row['timestamp'])
            subset = df_maint.loc[mask]
            if subset.empty:
                return pd.Series([pd.NaT, None, 0.0], index=['date', 'maintenance_type', 'downtime_hours'])
            last = subset.iloc[-1]
            return pd.Series([last['date'], last['maintenance_type'], last['downtime_hours']],
                             index=['date', 'maintenance_type', 'downtime_hours'])
        maint_info = df_sensor.apply(get_last_maint, axis=1)
        df_merged = pd.concat([df_sensor, maint_info], axis=1)

    df_merged['days_since_maint'] = (df_merged['timestamp'] - df_merged['date']).dt.total_seconds() / (24 * 3600)
    df_merged['days_since_maint'] = df_merged['days_since_maint'].fillna(999)
    print(f"  📊 Dataset merged: {df_merged.shape}")

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.hist(df_merged['days_since_maint'].clip(0, 100), bins=40, color='orange', edgecolor='black', alpha=0.7)
    ax.axvline(df_merged['days_since_maint'].median(), color='red', linestyle='--', linewidth=2,
               label=f"Median: {df_merged['days_since_maint'].median():.1f} hari")
    ax.set_title('Distribusi Hari Sejak Maintenance Terakhir')
    ax.legend(); ax.grid(alpha=0.3)
    save_or_show(fig, "04_days_since_maint.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(4)

    ctx['df_merged'] = df_merged
    ctx['df_maint'] = df_maint
    return ctx
