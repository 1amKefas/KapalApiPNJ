import os
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.regularizers import l2
from sklearn.preprocessing import MinMaxScaler
import joblib

# 1. Setup Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.join(BASE_DIR, 'pipeline')
os.makedirs(PIPELINE_DIR, exist_ok=True) # Ensure the pipeline directory exists

MODEL_PATH = os.path.join(PIPELINE_DIR, 'best_hybrid_model(Ver1).keras')
SCALER_X_PATH = os.path.join(PIPELINE_DIR, 'scaler_X.pkl')
SCALER_Y_PATH = os.path.join(PIPELINE_DIR, 'scaler_y.pkl')

SEQUENCE_LENGTH = 24
NUM_FEATURES = 9

# 2. Generate Synthetic Data 
# (Replace this block with pd.read_csv() if you have actual historical dataset)
print("🛠️ Generating synthetic data for training...")
num_samples = 2000 

# Random features (temperature, vibration, pressure, etc.)
X_dummy = np.random.rand(num_samples * SEQUENCE_LENGTH, NUM_FEATURES) * 100
# Target RUL (Remaining Useful Life) in days
y_dummy = np.random.rand(num_samples, 1) * 60 

# 3. Fit and Save Scalers
print("⚖️ Fitting and saving scalers...")
scaler_X = MinMaxScaler()
scaler_y = MinMaxScaler()

X_scaled = scaler_X.fit_transform(X_dummy)
y_scaled = scaler_y.fit_transform(y_dummy)

joblib.dump(scaler_X, SCALER_X_PATH)
joblib.dump(scaler_y, SCALER_Y_PATH)

# Reshape X for sequence modeling: (samples, sequence_length, features)
X_train = X_scaled.reshape((num_samples, SEQUENCE_LENGTH, NUM_FEATURES))
y_train = y_scaled

# 4. Build a Hybrid Model (LSTM + GRU)
print("🧠 Building the Hybrid Model...")
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, NUM_FEATURES)),
    tf.keras.layers.LSTM(64, return_sequences=True, kernel_regularizer=l2(0.0005)),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.GRU(64, return_sequences=False, kernel_regularizer=l2(0.0005)),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(32, activation='relu', kernel_regularizer=l2(0.0005)),
    tf.keras.layers.Dense(1, activation='linear') # Output RUL
])

optimizer = tf.keras.optimizers.Adam(learning_rate=1e-4)
model.compile(optimizer=optimizer, loss='mse', metrics=['mae'])

# 5. Train the Model
print("🚀 Training the model...")
model.fit(X_train, y_train, epochs=10, batch_size=32, validation_split=0.2)

# 6. Save the Model
print(f"💾 Saving model to {MODEL_PATH}...")
model.save(MODEL_PATH)
print("✅ Training complete! The .keras file and scalers are ready.")