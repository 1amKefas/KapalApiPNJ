import os
import time
import json
import psycopg2
import joblib
from dotenv import load_dotenv

# 1. Load Environment Variables
dotenv_path = os.path.join(os.path.dirname(__file__), '../server/.env')
load_dotenv(dotenv_path)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "previs_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

# 2. Load Models
PIPELINE_DIR = os.path.join(os.path.dirname(__file__), 'pipeline')
LDA_PATH = os.path.join(PIPELINE_DIR, 'lda_topic_model.pkl')
TFIDF_PATH = os.path.join(PIPELINE_DIR, 'tfidf_vectorizer.pkl')
DICT_PATH = os.path.join(PIPELINE_DIR, 'nlp_topic_dictionary.json')

print(f"🧠 Loading NLP models from {PIPELINE_DIR}...")
lda_model = joblib.load(LDA_PATH)
tfidf_vectorizer = joblib.load(TFIDF_PATH)
with open(DICT_PATH, 'r') as f:
    topic_dict = json.load(f)

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD
    )

def run_nlp_worker():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch maintenance logs that haven't been processed by NLP yet
        cursor.execute("SELECT log_id, parts_replaced FROM maintenance_logs WHERE nlp_topic IS NULL;")
        rows = cursor.fetchall()
        
        if not rows:
            return
            
        print(f"🔍 NLP Worker processing {len(rows)} new maintenance logs...")
        
        for log_id, text in rows:
            if not text:
                continue
                
            # Transform text using TF-IDF
            X = tfidf_vectorizer.transform([text])
            
            # Predict topic distribution using LDA
            topic_dist = lda_model.transform(X)
            topic_idx = int(topic_dist.argmax(axis=1)[0])
            
            # Topics in dict are usually 1-based (Topic_1, Topic_2, etc) or 0-based
            # Check JSON keys to determine prefix
            topic_key = f"Topic_{topic_idx + 1}"
            if topic_key not in topic_dict:
                # Fallback if 0-indexed or named differently
                topic_key = f"Topic_{topic_idx}"
            
            topic_info = topic_dict.get(topic_key)
            if topic_info:
                desc = topic_info.get('description', 'No description')
            else:
                desc = "Uncategorized topic"
                
            # Update database
            cursor.execute("""
                UPDATE maintenance_logs 
                SET nlp_topic = %s, nlp_topic_desc = %s 
                WHERE log_id = %s;
            """, (topic_key, desc, log_id))
                           
        conn.commit()
        print(f"✅ NLP Worker successfully updated {len(rows)} maintenance logs.")
    except Exception as e:
        conn.rollback()
        print(f"❌ NLP Worker error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    print("🚀 PreVis NLP Worker is running...")
    while True:
        run_nlp_worker()
        time.sleep(60) # Run every minute
