# -*- coding: utf-8 -*-
"""Step 9-10: Random Forest baseline + Hybrid LSTM-GRU model."""
import time
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import scipy.stats as stats
import joblib

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (classification_report, confusion_matrix,
                             mean_absolute_error, mean_squared_error, r2_score)
from sklearn.preprocessing import RobustScaler

from config import *
from utils import print_header, print_done, save_or_show


def _train_rf_baseline(ctx):
    """Train Random Forest baseline (classifier + regressor)."""
    X_tr_flat = ctx['X_train'].reshape(ctx['X_train'].shape[0], -1)
    X_te_flat = ctx['X_test'].reshape(ctx['X_test'].shape[0], -1)

    # Classifier
    start = time.time()
    print("  📊 Training RF Classifier...")
    clf_rf = RandomForestClassifier(
        n_estimators=50, max_depth=12, max_features='sqrt',
        min_samples_leaf=10, class_weight='balanced',
        random_state=SEED, n_jobs=2
    )
    clf_rf.fit(X_tr_flat, ctx['y_clf_train'])
    pred_rf_clf = clf_rf.predict(X_te_flat)
    print(f"  ✅ Classifier: {time.time()-start:.1f}s")

    # Regressor
    start = time.time()
    print("  📈 Training RF Regressor...")
    reg_rf = RandomForestRegressor(
        n_estimators=50, max_depth=12, max_features='sqrt',
        min_samples_leaf=10, random_state=SEED, n_jobs=2
    )
    reg_rf.fit(X_tr_flat, ctx['y_reg_train'])
    pred_rf_reg = reg_rf.predict(X_te_flat)
    print(f"  ✅ Regressor: {time.time()-start:.1f}s")

    # Metrics
    print("\n  🔹 Classification Report:")
    print(classification_report(ctx['y_clf_test'], pred_rf_clf, target_names=['Normal', 'Failure']))
    mae_rf = mean_absolute_error(ctx['y_reg_test'], pred_rf_reg)
    rmse_rf = np.sqrt(mean_squared_error(ctx['y_reg_test'], pred_rf_reg))
    r2_rf = r2_score(ctx['y_reg_test'], pred_rf_reg)
    print(f"  🔹 Regression: MAE={mae_rf:.2f} | RMSE={rmse_rf:.2f} | R²={r2_rf:.4f}")

    # Visualize
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    cm = confusion_matrix(ctx['y_clf_test'], pred_rf_clf)
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[0],
                xticklabels=['Normal', 'Failure'], yticklabels=['Normal', 'Failure'])
    axes[0].set_title('Confusion Matrix - RF Baseline')
    axes[1].scatter(ctx['y_reg_test'], pred_rf_reg, alpha=0.4, s=15, color='purple')
    axes[1].plot([ctx['y_reg_test'].min(), ctx['y_reg_test'].max()],
                 [ctx['y_reg_test'].min(), ctx['y_reg_test'].max()], 'r--', label='Ideal')
    axes[1].set_title('RF: Predicted vs Actual RUL'); axes[1].legend(); axes[1].grid(alpha=0.3)
    save_or_show(fig, "09_rf_baseline.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    # Save models
    joblib.dump(clf_rf, os.path.join(MODEL_DIR, 'rf_clf_baseline.pkl'))
    joblib.dump(reg_rf, os.path.join(MODEL_DIR, 'rf_reg_baseline.pkl'))
    print(f"  💾 RF models saved to {MODEL_DIR}/")

    ctx['pred_rf_reg'] = pred_rf_reg
    ctx['r2_rf'] = r2_rf
    ctx['mae_rf'] = mae_rf
    ctx['rmse_rf'] = rmse_rf
    return ctx


def _train_hybrid(ctx):
    """Train Hybrid LSTM-GRU model for RUL prediction."""
    import os as _os
    import random as _random
    import tensorflow as tf
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import Input, LSTM, GRU, Dense, Dropout
    from tensorflow.keras.optimizers import Adam
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint

    # Reproducibility
    _os.environ['PYTHONHASHSEED'] = str(SEED)
    np.random.seed(SEED)
    _random.seed(SEED)
    tf.random.set_seed(SEED)
    tf.keras.utils.set_random_seed(SEED)
    tf.keras.backend.clear_session()

    X_train_input = ctx['X_train_aug']
    y_train_target = ctx['y_reg_train_aug']

    # RUL Capping + Log Transform + Scaling
    y_train_capped = np.clip(y_train_target, 0, MAX_RUL)
    y_test_capped = np.clip(ctx['y_reg_test'], 0, MAX_RUL)

    y_train_log = np.log1p(y_train_capped)
    y_test_log = np.log1p(y_test_capped)

    y_scaler = RobustScaler()
    y_train_scaled = y_scaler.fit_transform(y_train_log.reshape(-1, 1)).flatten()

    # Model
    inputs = Input(shape=(X_train_input.shape[1], X_train_input.shape[2]))
    x = LSTM(LSTM_UNITS, return_sequences=True,
             kernel_regularizer=tf.keras.regularizers.l2(L2_REG))(inputs)
    x = Dropout(DROPOUT_RATE)(x)
    x = GRU(GRU_UNITS, return_sequences=False,
            kernel_regularizer=tf.keras.regularizers.l2(L2_REG))(x)
    x = Dropout(DROPOUT_RATE)(x)
    x = Dense(DENSE_UNITS, activation='relu',
              kernel_regularizer=tf.keras.regularizers.l2(L2_REG))(x)
    outputs = Dense(1, activation='linear')(x)

    model = Model(inputs, outputs)
    model.compile(optimizer=Adam(learning_rate=LEARNING_RATE, clipvalue=1.0),
                  loss='mse', metrics=['mae'])
    print("  ✅ Model compiled!")
    model.summary()

    # Callbacks
    model_path = os.path.join(MODEL_DIR, 'best_hybrid_model.keras')
    callbacks = [
        EarlyStopping(monitor='val_loss', patience=PATIENCE_ES, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=PATIENCE_LR, min_lr=1e-6, verbose=1),
        ModelCheckpoint(model_path, monitor='val_loss', save_best_only=True, verbose=1)
    ]

    # Train
    print("\n  ⏳ Training Hybrid LSTM-GRU...")
    history = model.fit(
        X_train_input, y_train_scaled,
        validation_split=0.15, epochs=EPOCHS,
        batch_size=BATCH_SIZE, shuffle=False,
        callbacks=callbacks, verbose=1
    )

    # Evaluate
    y_pred_scaled = model.predict(ctx['X_test'], verbose=0).flatten()
    y_pred_log = y_scaler.inverse_transform(y_pred_scaled.reshape(-1, 1)).flatten()
    y_pred = np.clip(np.expm1(y_pred_log), 0, None)

    mae_h = mean_absolute_error(y_test_capped, y_pred)
    rmse_h = np.sqrt(mean_squared_error(y_test_capped, y_pred))
    r2_h = r2_score(y_test_capped, y_pred)
    print(f"\n  🔹 MAE: {mae_h:.2f} | RMSE: {rmse_h:.2f} | R²: {r2_h:.4f}")

    # 6 Diagnostic plots
    fig = plt.figure(figsize=(16, 12))
    gs = fig.add_gridspec(3, 2, hspace=0.4, wspace=0.3)

    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(history.history['loss'], label='Train', lw=2)
    ax1.plot(history.history['val_loss'], label='Val', lw=2)
    ax1.set_title('Loss Convergence', fontweight='bold'); ax1.legend(); ax1.grid(alpha=0.3)

    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(history.history['mae'], label='Train', lw=2, color='orange')
    ax2.plot(history.history['val_mae'], label='Val', lw=2, color='orange')
    ax2.set_title('MAE Convergence', fontweight='bold'); ax2.legend(); ax2.grid(alpha=0.3)

    ax3 = fig.add_subplot(gs[1, 0])
    ax3.scatter(y_test_capped, y_pred, alpha=0.4, s=15, color='purple')
    mn, mx = min(y_test_capped.min(), y_pred.min()), max(y_test_capped.max(), y_pred.max())
    ax3.plot([mn, mx], [mn, mx], 'r--', lw=2, label='Ideal')
    ax3.set_title(f'Predicted vs Actual (R²={r2_h:.4f})', fontweight='bold'); ax3.legend(); ax3.grid(alpha=0.3)

    errors = y_test_capped - y_pred
    ax4 = fig.add_subplot(gs[1, 1])
    sns.histplot(errors, bins=40, kde=True, color='teal', ax=ax4)
    ax4.axvline(0, color='red', ls='--', lw=2); ax4.set_title('Error Distribution', fontweight='bold')

    ax5 = fig.add_subplot(gs[2, 0])
    ax5.scatter(y_test_capped, errors, alpha=0.4, s=10, color='orange')
    ax5.axhline(0, color='red', ls='--', lw=2); ax5.set_title('Residuals', fontweight='bold')

    ax6 = fig.add_subplot(gs[2, 1])
    stats.probplot(errors, dist="norm", plot=ax6)
    ax6.set_title('Q-Q Plot', fontweight='bold')

    save_or_show(fig, "10_hybrid_diagnostics.png", SAVE_PLOTS, PLOT_DIR, PLOT_DPI)

    model.save(model_path)
    print(f"  💾 Hybrid model saved: {model_path}")

    ctx['y_pred'] = y_pred
    ctx['r2_hybrid'] = r2_h
    ctx['mae_hybrid'] = mae_h
    ctx['rmse_hybrid'] = rmse_h
    ctx['model_hybrid'] = model
    return ctx


import os

def run(ctx):
    # === STEP 9: RF BASELINE ===
    print_header(9, "RANDOM FOREST BASELINE")
    ctx = _train_rf_baseline(ctx)
    print_done(9)

    # === STEP 10: HYBRID LSTM-GRU ===
    print_header(10, "HYBRID LSTM-GRU MODEL")
    ctx = _train_hybrid(ctx)
    print_done(10)

    return ctx
