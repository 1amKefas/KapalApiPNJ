import os
import time
import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
import tensorflow as tf

# 1. Load Environment Variables
dotenv_path = os.path.join(os.path.dirname(__file__), '../server/.env')
load_dotenv(dotenv_path)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "previs_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

# 2. Load Model Keras
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models/best_hybrid_model.keras')
print(f"🤖 Loading trained AI model dari {MODEL_PATH}...")
model = tf.keras.models.load_model(MODEL_PATH)

SEQUENCE_LENGTH = 24 

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD
    )

def determine_alert_level(failure_prob, rul):
    if failure_prob >= 0.7 or rul <= 7:
        return 'Critical'
    elif failure_prob >= 0.3 or rul <= 21:
        return 'Warning'
    else:
        return 'Normal'

def run_inference():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Ambil daftar semua machine_id
        cursor.execute("SELECT machine_id FROM machines;")
        machines = [row[0] for row in cursor.fetchall()]
        
        # Ambil riwayat log maintenance terakhir untuk semua mesin (untuk kalkulasi days_since_maint)
        cursor.execute("SELECT machine_id, MAX(date) FROM maintenance_logs GROUP BY machine_id;")
        maint_dict = {row[0]: row[1] for row in cursor.fetchall()}
        
        for machine_id in machines:
            # Kita fetch 47 baris (24 timesteps + 23 riwayat masa lalu) 
            # agar perhitungan rolling_window 24 valid dan tidak ada nilai NaN
            fetch_limit = SEQUENCE_LENGTH + 24 - 1
            query = """
                SELECT timestamp, temperature, vibration, pressure, rpm 
                FROM sensor_telemetry 
                WHERE machine_id = %s 
                ORDER BY timestamp DESC 
                LIMIT %s;
            """
            cursor.execute(query, (machine_id, fetch_limit))
            rows = cursor.fetchall()
            
            if len(rows) < SEQUENCE_LENGTH:
                continue
                
            # Konversi ke Pandas DataFrame agar bisa diproses persis seperti saat training
            df = pd.DataFrame(rows, columns=['timestamp', 'temperature', 'vibration', 'pressure', 'rpm'])
            df = df.sort_values('timestamp').reset_index(drop=True)
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            
            # Hitung Rolling Features dari temperature
            df['temperature_roll_mean'] = df['temperature'].rolling(window=24, min_periods=1).mean()
            df['temperature_roll_std'] = df['temperature'].rolling(window=24, min_periods=1).std().fillna(0)
            
            # Hitung 'days_since_maint'
            last_maint = maint_dict.get(machine_id)
            if last_maint is None:
                df['days_since_maint'] = 0.0
            else:
                last_maint_dt = pd.to_datetime(last_maint)
                # Menghilangkan zona waktu (tz-naive) agar bisa dikurangkan
                df_ts_naive = df['timestamp'].dt.tz_localize(None)
                last_maint_naive = last_maint_dt.tz_localize(None) if last_maint_dt.tzinfo else last_maint_dt
                
                delta_seconds = (df_ts_naive - last_maint_naive).dt.total_seconds()
                df['days_since_maint'] = np.maximum(0, delta_seconds / 86400.0) # 86400 detik = 1 hari
            
            # Pilih hanya 7 kolom fitur yang diminta oleh model dan ambil 24 baris terakhir
            expected_cols = ['temperature', 'vibration', 'pressure', 'rpm', 'temperature_roll_mean', 'temperature_roll_std', 'days_since_maint']
            df_seq = df[expected_cols].tail(SEQUENCE_LENGTH)
            
            # Bentuk ulang array ke bentuk (1, 24, 7) untuk Keras
            input_features = df_seq.values.astype(np.float32)
            input_data = np.expand_dims(input_features, axis=0)
            
            # Jalankan prediksi
            predictions = model.predict(input_data, verbose=0) 
            
            # Model ternyata HANYA mengeluarkan 1 nilai (prediksi RUL)
            flat_preds = np.ravel(predictions)
            rul_raw = float(flat_preds[0])
            
            # Hitung RUL dan PAKSA kembali menjadi float bawaan Python 
            # agar psycopg2 PostgreSQL tidak kebingungan
            if rul_raw > 0:
                rul_estimated = float(np.expm1(rul_raw))
            else:
                rul_estimated = float(max(0.0, rul_raw))
            
            # Karena model tidak mengeluarkan failure_prob, kita hitung otomatis (Logika Heuristik)
            if rul_estimated <= 7.0:
                failure_prob = 0.85  # RUL di bawah 7 hari -> 85% Risiko (Critical)
            elif rul_estimated <= 21.0:
                failure_prob = 0.40  # RUL di bawah 21 hari -> 40% Risiko (Warning)
            else:
                failure_prob = 0.05  # RUL di atas 21 hari -> 5% Risiko (Sehat)
                
            # Pastikan probabilitas tidak kurang dari 0 atau lebih dari 1 (pastikan juga float Python)
            failure_prob = float(max(0.0, min(1.0, failure_prob)))
            
            alert_level = determine_alert_level(failure_prob, rul_estimated)
            
            # Simpan hasil prediksi
            insert_query = """
                INSERT INTO predictions (machine_id, timestamp, rul_estimated, failure_prob, alert_level)
                VALUES (%s, NOW(), %s, %s, %s);
            """
            cursor.execute(insert_query, (machine_id, rul_estimated, failure_prob, alert_level))
            
        conn.commit()
        print("✅ Inference real-time sukses. Model (shape: 24x7) memprediksi data terbaru.")
        
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
        time.sleep(60) # Berjalan otomatis tiap menit