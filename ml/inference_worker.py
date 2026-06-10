import os
import time
import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
import tensorflow as tf
import joblib

# 1. Load Environment Variables
dotenv_path = os.path.join(os.path.dirname(__file__), '../server/.env')
load_dotenv(dotenv_path)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "previs_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

# 2. Load Model Keras and Scalers
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'best_hybrid_model_v2.keras')
PIPELINE_DIR = os.path.join(os.path.dirname(__file__), 'pipeline')
SCALER_X_PATH = os.path.join(PIPELINE_DIR, 'scaler_X.pkl')
SCALER_Y_PATH = os.path.join(PIPELINE_DIR, 'scaler_y.pkl')

print(f"🤖 Loading trained AI model from {MODEL_PATH}...")
model = tf.keras.models.load_model(MODEL_PATH)
scaler_X = joblib.load(SCALER_X_PATH)
scaler_y = joblib.load(SCALER_Y_PATH)

SEQUENCE_LENGTH = 24 

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD
    )

# ==========================================
# FUSION LOGIC 2.0 (GABUNGAN RULE-BASED & ML)
# ==========================================
def determine_alert_level(failure_prob, rul):
    """
    Menentukan status mesin berdasarkan 2 lapis keamanan:
    1. Aturan Baku (Rule-Based) dari angka RUL.
    2. Deteksi Dini (Classification) dari probabilitas kegagalan 7 hari.
    """
    # KONDISI 1: DARURAT (CRITICAL)
    # Jika sisa umur benar-benar sudah di bawah 3 hari
    if rul <= 3.0:
        return 'Critical'
    
    # KONDISI 2: PERINGATAN (WARNING)
    # Jika RUL masuk zona kuning (3 sampai 14 hari)
    # ATAU model klasifikasi berteriak ada anomali rusak dalam 7 hari ke depan (>= 0.68)
    elif rul <= 14.0 or failure_prob >= 0.68:
        return 'Warning'
        
    # KONDISI 3: SEHAT (HEALTHY)
    # RUL masih panjang (> 14 hari) DAN tidak ada anomali terdeteksi
    else:
        return 'Healthy'

def run_inference():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Ambil daftar semua machine_id
        cursor.execute("SELECT machine_id FROM machines;")
        machines = [row[0] for row in cursor.fetchall()]
        
        # Ambil riwayat log maintenance terakhir untuk semua mesin
        cursor.execute("SELECT machine_id, MAX(date) FROM maintenance_logs GROUP BY machine_id;")
        maint_dict = {row[0]: row[1] for row in cursor.fetchall()}
        
        for machine_id in machines:
            fetch_limit = SEQUENCE_LENGTH + 24 - 1
            query = """
                SELECT timestamp, temperature, vibration, pressure, rpm, power 
                FROM sensor_telemetry 
                WHERE machine_id = %s 
                ORDER BY timestamp DESC 
                LIMIT %s;
            """
            cursor.execute(query, (machine_id, fetch_limit))
            rows = cursor.fetchall()
            
            if len(rows) < SEQUENCE_LENGTH:
                continue
                
            df = pd.DataFrame(rows, columns=['timestamp', 'temperature', 'vibration', 'pressure', 'rpm', 'power_consumption'])
            df = df.sort_values('timestamp').reset_index(drop=True)
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            
            # Hitung Rolling Features (Bypass Noise)
            df['temperature_roll24h_mean'] = df['temperature'].rolling(window=24, min_periods=1).mean()
            df['vibration_roll24h_mean'] = df['vibration'].rolling(window=24, min_periods=1).mean()
            df['pressure_roll24h_mean'] = df['pressure'].rolling(window=24, min_periods=1).mean()
            
            # Hitung 'days_since_maint'
            last_maint = maint_dict.get(machine_id)
            if last_maint is None:
                df['days_since_maint'] = 0.0
            else:
                last_maint_dt = pd.to_datetime(last_maint)
                df_ts_naive = df['timestamp'].dt.tz_localize(None)
                last_maint_naive = last_maint_dt.tz_localize(None) if last_maint_dt.tzinfo else last_maint_dt
                
                delta_seconds = (df_ts_naive - last_maint_naive).dt.total_seconds()
                df['days_since_maint'] = np.maximum(0, delta_seconds / 86400.0)
            
            # 9 Fitur Sinyal Emas
            expected_cols = [
                'temperature', 'vibration', 'pressure', 'rpm', 'power_consumption', 
                'temperature_roll24h_mean', 'vibration_roll24h_mean', 'pressure_roll24h_mean', 
                'days_since_maint'
            ]
            df_seq = df[expected_cols].tail(SEQUENCE_LENGTH)
            
            # Normalisasi menggunakan scaler_X ASLI (StandardScaler)
            scaled_features = scaler_X.transform(df_seq)
            
            # Bentuk ulang array ke Tensor 3D: [1, 24, 9]
            input_data = np.expand_dims(scaled_features.astype(np.float32), axis=0)
            
            # ==========================================
            # PREDIKSI MULTI-OUTPUT HYBRID MODEL
            # ==========================================
            # Model kita mengembalikan LIST berisi 2 array: [reg_output, clf_output]
            predictions = model.predict(input_data, verbose=0)
            rul_pred_scaled = predictions[0]  # Array Regression
            clf_pred_proba = predictions[1]   # Array Classification
            
            # Denormalisasi RUL
            rul_estimated_unscaled = scaler_y.inverse_transform(rul_pred_scaled)
            rul_estimated = float(rul_estimated_unscaled[0][0])
            rul_estimated = max(0.0, rul_estimated)
            
            # Ekstrak Probabilitas Failure
            failure_prob = float(clf_pred_proba[0][0])
            
            # Tentukan Status Dashboard (Fusion Logic)
            alert_level = determine_alert_level(failure_prob, rul_estimated)
            
            # Simpan hasil prediksi
            insert_query = """
                INSERT INTO predictions (machine_id, timestamp, rul_estimated, failure_prob, alert_level)
                VALUES (%s, NOW(), %s, %s, %s);
            """
            cursor.execute(insert_query, (machine_id, rul_estimated, failure_prob, alert_level))
            
        conn.commit()
        print("✅ Inference real-time sukses. Status Healthy/Warning/Critical telah diupdate!")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Inference error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("🚀 PreVis AI Inference Worker is running...")
    while True:
        run_inference()
        time.sleep(60)