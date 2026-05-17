# -*- coding: utf-8 -*-
"""Step 11-12: GRU classification with focal loss + final comparison."""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.metrics import (classification_report, confusion_matrix,
                             precision_recall_curve, average_precision_score,
                             f1_score, mean_absolute_error, mean_squared_error, r2_score)

from config import *
from utils import print_header, print_done, save_or_show


def _train_classification(ctx):
    """GRU with focal loss + threshold optimization."""
    import tensorflow as tf
    from tensorflow.keras.layers import Input, GRU, Dense, Dropout
    from tensorflow.keras.optimizers import Adam
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

    def focal_loss(gamma=FOCAL_LOSS_GAMMA, alpha=FOCAL_LOSS_ALPHA):
        def loss_fn(y_true, y_pred):
            y_true = tf.cast(y_true, tf.float32)
            bce = tf.keras.losses.binary_crossentropy(y_true, y_pred)
            p_t = y_true * y_pred + (1 - y_true) * (1 - y_pred)
            return tf.reduce_mean(alpha * tf.pow(1 - p_t, gamma) * bce)
        return loss_fn

    X_aug = ctx['X_train_aug']
    y_aug = ctx['y_clf_train_aug']

    model = tf.keras.Sequential([
        Input(shape=(X_aug.shape[1], X_aug.shape[2])),
        GRU(64, return_sequences=False, kernel_regularizer=tf.keras.regularizers.l2(0.001)),
        Dropout(0.4),
        Dense(32, activation='relu'),
        Dropout(0.3),
        Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer=Adam(learning_rate=5e-5, clipvalue=1.0),
                  loss=focal_loss(), metrics=['accuracy'])

    callbacks = [
        EarlyStopping(monitor='val_loss', patience=4, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=2, min_lr=1e-6, verbose=1),
    ]

    print("  ⏳ Training GRU (Focal Loss)...")
    model.fit(X_aug, y_aug, validation_split=0.2, epochs=CLF_EPOCHS,
              batch_size=BATCH_SIZE, class_weight=CLF_CLASS_WEIGHT,
              callbacks=callbacks, verbose=1)

    # Threshold optimization
    y_proba = model.predict(ctx['X_test'], verbose=0).flatten()
    prec, rec, ths = precision_recall_curve(ctx['y_clf_test'], y_proba)
    f1s = 2 * (prec * rec) / (prec + rec + 1e-8)
    best_th = ths[np.argmax(f1s)]
    y_pred_clf = (y_proba >= best_th).astype(int)

    print(f"\n  📊 Best threshold: {best_th:.3f}")
    print(f"  📊 F1 (Failure): {f1_score(ctx['y_clf_test'], y_pred_clf, pos_label=1):.4f}")
    print(classification_report(ctx['y_clf_test'], y_pred_clf, target_names=['Normal', 'Failure']))

    # Visualize
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    ap = average_precision_score(ctx['y_clf_test'], y_proba)
    axes[0].plot(rec, prec, marker='.', label=f'AP={ap:.3f}')
    axes[0].set_title('Precision-Recall Curve'); axes[0].legend(); axes[0].grid(alpha=0.3)
    axes[1].plot(ths, f1s[:-1], marker='o', color='orange')
    axes[1].axvline(best_th, color='red', ls='--', label=f'Best: {best_th:.3f}')
    axes[1].set_title('F1 vs Threshold'); axes[1].legend(); axes[1].grid(alpha=0.3)
    save_or_show(fig, "11_classification.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    import os
    model.save(os.path.join(MODEL_DIR, 'best_gru_clf.keras'))
    print(f"  💾 Classification model saved.")
    return ctx


def _final_comparison(ctx):
    """Compare RF baseline vs Hybrid LSTM-GRU."""
    df_compare = pd.DataFrame({
        'Model': ['Random Forest (Baseline)', 'Hybrid LSTM-GRU'],
        'MAE (Hari)': [ctx.get('mae_rf', 0), ctx.get('mae_hybrid', 0)],
        'RMSE (Hari)': [ctx.get('rmse_rf', 0), ctx.get('rmse_hybrid', 0)],
        'R² Score': [ctx.get('r2_rf', 0), ctx.get('r2_hybrid', 0)]
    })
    print("\n  📋 Perbandingan Performa:")
    print(df_compare.to_string(index=False))

    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    if 'pred_rf_reg' in ctx:
        axes[0].scatter(ctx['y_reg_test'], ctx['pred_rf_reg'], alpha=0.4, s=15, color='purple')
        axes[0].plot([ctx['y_reg_test'].min(), ctx['y_reg_test'].max()],
                     [ctx['y_reg_test'].min(), ctx['y_reg_test'].max()], 'r--', label='Ideal')
        axes[0].set_title(f"Random Forest\nR²={ctx['r2_rf']:.4f}", fontweight='bold')
        axes[0].legend(); axes[0].grid(alpha=0.3)

    if 'y_pred' in ctx:
        axes[1].scatter(ctx['y_reg_test'], ctx['y_pred'], alpha=0.4, s=15, color='orange')
        axes[1].plot([ctx['y_reg_test'].min(), ctx['y_reg_test'].max()],
                     [ctx['y_reg_test'].min(), ctx['y_reg_test'].max()], 'r--', label='Ideal')
        axes[1].set_title(f"Hybrid LSTM-GRU\nR²={ctx['r2_hybrid']:.4f}", fontweight='bold', color='green')
        axes[1].legend(); axes[1].grid(alpha=0.3)

    save_or_show(fig, "12_comparison.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    print("\n  🏆 Pipeline ML Predictive Maintenance Selesai!")
    print(f"  📁 Models saved in: {MODEL_DIR}/")
    print(f"  📊 Plots saved in: {PLOT_DIR}/")


def run(ctx):
    # === STEP 11: CLASSIFICATION ===
    print_header(11, "GRU CLASSIFICATION (FOCAL LOSS)")
    ctx = _train_classification(ctx)
    print_done(11)

    # === STEP 12: FINAL COMPARISON ===
    print_header(12, "FINAL COMPARISON & SUMMARY")
    _final_comparison(ctx)
    print_done(12)

    return ctx
