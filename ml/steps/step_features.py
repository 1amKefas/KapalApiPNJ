# -*- coding: utf-8 -*-
"""Step 5-8: Feature engineering, label engineering, temporal split, sequences."""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from config import *
from utils import print_header, print_done, save_or_show


def _feature_engineering(df_merged):
    """Rolling stats dan lag features."""
    for col in SENSOR_COLS:
        df_merged[f'{col}_roll_mean'] = df_merged.groupby('machine_id')[col].transform(
            lambda x: x.rolling(ROLLING_WINDOW).mean())
        df_merged[f'{col}_roll_std'] = df_merged.groupby('machine_id')[col].transform(
            lambda x: x.rolling(ROLLING_WINDOW).std())
        df_merged[f'{col}_lag1'] = df_merged.groupby('machine_id')[col].shift(1)
    df_merged = df_merged.ffill().bfill()
    return df_merged


def _label_engineering(df_merged):
    """Buat failure_7d dan RUL_days."""
    df_merged['failure_7d'] = df_merged.groupby('machine_id')['failure'].transform(
        lambda x: x.shift(-FAILURE_HORIZON_HOURS).fillna(0)).astype(int)

    def calc_rul(g):
        idx_fail = g[g['failure'] == 1].index
        if len(idx_fail) == 0:
            return pd.Series([len(g)] * len(g), index=g.index)
        return pd.Series(np.maximum(0, (idx_fail[0] - g.index) / 24.0), index=g.index)

    df_merged['RUL_days'] = df_merged.groupby('machine_id').apply(calc_rul).reset_index(level=0, drop=True)
    return df_merged


def _create_sequences(df, feature_cols, seq_len=SEQUENCE_LENGTH):
    """Buat sequence 3D dari dataframe."""
    X, y_clf, y_reg = [], [], []
    for m_id in df['machine_id'].unique():
        m_data = df[df['machine_id'] == m_id].sort_values('timestamp')
        vals = m_data[feature_cols].values.astype(np.float32)
        clf = m_data['failure_7d'].values.astype(np.int8)
        reg = m_data['RUL_days'].values.astype(np.float32)
        if len(vals) <= seq_len:
            continue
        for i in range(len(vals) - seq_len):
            X.append(vals[i:i + seq_len])
            y_clf.append(clf[i + seq_len])
            y_reg.append(reg[i + seq_len])
    return np.array(X, np.float32), np.array(y_clf, np.int8), np.array(y_reg, np.float32)


def _augment(X, y_clf, y_reg, factor=AUGMENT_FACTOR, noise_std=NOISE_STD):
    """Augmentasi data failure dengan jitter noise."""
    fail_idx = np.where(y_clf == 1)[0]
    norm_idx = np.where(y_clf == 0)[0]

    X_a = [X[norm_idx], X[fail_idx]]
    yc_a = [y_clf[norm_idx], y_clf[fail_idx]]
    yr_a = [y_reg[norm_idx], y_reg[fail_idx]]

    for idx in fail_idx:
        for _ in range(factor - 1):
            seq = X[idx].copy() + np.random.normal(0, noise_std, X[idx].shape)
            X_a.append(np.clip(seq, 0, 1).reshape(1, seq.shape[0], seq.shape[1]))
            yc_a.append(np.array([y_clf[idx]]))
            yr_a.append(np.array([y_reg[idx]]))

    return np.concatenate(X_a), np.concatenate(yc_a), np.concatenate(yr_a)


def run(ctx):
    df_merged = ctx['df_merged']

    # === STEP 5: FEATURE ENGINEERING ===
    print_header(5, "FEATURE ENGINEERING")
    df_merged = _feature_engineering(df_merged)

    sample = df_merged[df_merged['machine_id'] == df_merged['machine_id'].unique()[0]].tail(150)
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(sample['timestamp'], sample['vibration'], alpha=0.5, label='Original')
    ax.plot(sample['timestamp'], sample['vibration_roll_mean'], color='red', linewidth=2, label='Rolling Mean')
    ax.fill_between(sample['timestamp'],
                    sample['vibration_roll_mean'] - sample['vibration_roll_std'],
                    sample['vibration_roll_mean'] + sample['vibration_roll_std'],
                    color='red', alpha=0.2, label='±1 Std')
    ax.set_title('Vibration: Original vs Rolling'); ax.legend(); ax.grid(alpha=0.3)
    save_or_show(fig, "05_feature_eng.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(5)

    # === STEP 6: LABEL ENGINEERING ===
    print_header(6, "LABEL ENGINEERING")
    df_merged = _label_engineering(df_merged)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    df_merged['failure_7d'].value_counts().plot(kind='bar', ax=axes[0], color=['skyblue', 'coral'], edgecolor='black')
    axes[0].set_title('Distribusi failure_7d'); axes[0].tick_params(axis='x', rotation=0)
    axes[1].hist(df_merged[df_merged['RUL_days'] < 30]['RUL_days'], bins=30, color='green', edgecolor='black')
    axes[1].axvline(7, color='red', linestyle='--', label='Threshold 7 Hari'); axes[1].legend()
    axes[1].set_title('Distribusi RUL (0-30 Hari)')
    save_or_show(fig, "06_labels.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(6)

    # === STEP 7: TEMPORAL SPLIT ===
    print_header(7, "TEMPORAL TRAIN-TEST SPLIT")
    split_idx = int(len(df_merged) * TRAIN_RATIO)
    train_df = df_merged.iloc[:split_idx].copy()
    test_df = df_merged.iloc[split_idx:].copy()
    print(f"  📊 Train: {len(train_df)} | Test: {len(test_df)}")
    print(f"  📅 Split date: {df_merged.iloc[split_idx]['timestamp']}")

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    axes[0, 0].axvline(df_merged.iloc[split_idx]['timestamp'], color='red', linestyle='--', label='Split')
    axes[0, 0].plot(train_df['timestamp'], train_df['temperature'], color='green', alpha=0.5, label='Train')
    axes[0, 0].plot(test_df['timestamp'], test_df['temperature'], color='orange', alpha=0.5, label='Test')
    axes[0, 0].set_title('Temporal Split'); axes[0, 0].legend()
    for ax, col in zip([axes[0, 1], axes[1, 0]], ['temperature', 'pressure']):
        ax.hist(train_df[col], bins=30, alpha=0.5, label='Train', color='green')
        ax.hist(test_df[col], bins=30, alpha=0.5, label='Test', color='orange')
        ax.set_title(f'Distribusi {col}'); ax.legend()
    fr_tr = train_df['failure_7d'].mean() * 100
    fr_te = test_df['failure_7d'].mean() * 100
    axes[1, 1].bar(['Train', 'Test'], [fr_tr, fr_te], color=['green', 'orange'], edgecolor='black')
    axes[1, 1].set_title('Failure Rate: Train vs Test'); axes[1, 1].set_ylabel('%')
    save_or_show(fig, "07_split.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(7)

    # === STEP 8: SEQUENCE CREATION & AUGMENTATION ===
    print_header(8, "SEQUENCE CREATION & AUGMENTATION")
    feat_cols = [c for c in FEATURE_COLS if c in df_merged.columns]
    X_train, y_clf_train, y_reg_train = _create_sequences(train_df, feat_cols)
    X_test, y_clf_test, y_reg_test = _create_sequences(test_df, feat_cols)
    print(f"  📊 Sequences -> Train: {X_train.shape}, Test: {X_test.shape}")

    X_train_aug, y_clf_train_aug, y_reg_train_aug = _augment(X_train, y_clf_train, y_reg_train)
    print(f"  ✅ After augmentation: {X_train_aug.shape} | Failure: {int(np.sum(y_clf_train_aug))}")

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    before = [int(np.sum(y_clf_train == 0)), int(np.sum(y_clf_train == 1))]
    after = [int(np.sum(y_clf_train_aug == 0)), int(np.sum(y_clf_train_aug == 1))]
    axes[0].bar(['Normal', 'Failure'], before, color=['skyblue', 'coral'])
    axes[0].set_title('Sebelum Augmentasi')
    for i, v in enumerate(before):
        axes[0].text(i, v + 100, str(v), ha='center', fontweight='bold')
    axes[1].bar(['Normal', 'Failure'], after, color=['skyblue', 'red'])
    axes[1].set_title('Sesudah Augmentasi')
    for i, v in enumerate(after):
        axes[1].text(i, v + 100, str(v), ha='center', fontweight='bold')
    save_or_show(fig, "08_augmentation.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)
    print_done(8)

    ctx.update({
        'X_train': X_train, 'X_test': X_test,
        'X_train_aug': X_train_aug,
        'y_clf_train': y_clf_train, 'y_clf_test': y_clf_test,
        'y_clf_train_aug': y_clf_train_aug,
        'y_reg_train': y_reg_train, 'y_reg_test': y_reg_test,
        'y_reg_train_aug': y_reg_train_aug,
    })
    return ctx
