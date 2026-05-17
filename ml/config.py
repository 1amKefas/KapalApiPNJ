# -*- coding: utf-8 -*-
"""
Konfigurasi global untuk pipeline ML Predictive Maintenance.
Semua parameter yang bisa diubah ada di sini.
"""
import os

# ==========================================
# PATH
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_DIR = os.path.join(BASE_DIR, "models")
PLOT_DIR = os.path.join(BASE_DIR, "plots")

# Buat folder jika belum ada
for d in [DATA_DIR, MODEL_DIR, PLOT_DIR]:
    os.makedirs(d, exist_ok=True)

# File paths
SENSOR_CSV = os.path.join(DATA_DIR, "sensor_readings.csv")
MAINTENANCE_CSV = os.path.join(DATA_DIR, "maintenance_logs.csv")

# ==========================================
# RANDOM SEED
# ==========================================
SEED = 42

# ==========================================
# FEATURE ENGINEERING
# ==========================================
SENSOR_COLS = ['temperature', 'vibration', 'pressure', 'rpm']
ROLLING_WINDOW = 24  # jam
SEQUENCE_LENGTH = 24  # jam

FEATURE_COLS = [
    'temperature', 'vibration', 'pressure', 'rpm',
    'temperature_roll_mean', 'temperature_roll_std',
    'days_since_maint'
]

# ==========================================
# LABEL ENGINEERING
# ==========================================
FAILURE_HORIZON_HOURS = 168  # 7 hari * 24 jam
MAX_RUL = 125  # Cap RUL (standar industri NASA C-MAPSS)

# ==========================================
# SPLIT
# ==========================================
TRAIN_RATIO = 0.8

# ==========================================
# AUGMENTATION
# ==========================================
AUGMENT_FACTOR = 15
NOISE_STD = 0.02

# ==========================================
# MODEL
# ==========================================
LSTM_UNITS = 64
GRU_UNITS = 64
DENSE_UNITS = 32
DROPOUT_RATE = 0.3
L2_REG = 0.0005
LEARNING_RATE = 1e-4
BATCH_SIZE = 128
EPOCHS = 150
PATIENCE_ES = 10
PATIENCE_LR = 4

# ==========================================
# CLASSIFICATION
# ==========================================
FOCAL_LOSS_GAMMA = 2.0
FOCAL_LOSS_ALPHA = 0.75
CLF_EPOCHS = 15
CLF_CLASS_WEIGHT = {0: 1.0, 1: 25.0}

# ==========================================
# VISUALIZATION
# ==========================================
SAVE_PLOTS = True  # True = simpan ke file, False = plt.show()
PLOT_DPI = 150
