import json
import os
import sys

# Ensure the nlp directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sklearn.metrics import accuracy_score, classification_report
from nlp_service import NLPPipeline, extract_entities

def test_pipeline():
    print("Loading test data...")
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    TEST_DATA_PATH = os.path.join(BASE_DIR, "nlp_test_data.json")
    
    with open(TEST_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    test_texts = []
    test_labels = []
    for intent_group in data["intents"]:
        intent = intent_group["intent"]
        for example in intent_group["examples"]:
            test_texts.append(example)
            test_labels.append(intent)

    print("\nTraining pipeline on expanded training data...")
    pipeline = NLPPipeline()
    pipeline.train()

    print("\nEvaluating Intent Classification on Holdout Test Set...")
    predicted_labels = []
    for text in test_texts:
        result = pipeline.analyze(text)
        predicted_labels.append(result["intent"])

    acc = accuracy_score(test_labels, predicted_labels)
    print(f"\nOverall Accuracy: {acc * 100:.2f}%\n")
    print("Detailed Classification Report:")
    print(classification_report(test_labels, predicted_labels, zero_division=0))

    print("\n--- Testing Entity Extraction Robustness (Typos) ---")
    typo_examples = [
        ("whats the tempreature of m-01", "temperature", "M-01"),
        ("check vibraton on machine M-03", "vibration", "M-03"),
        ("what is the presure on M-15", "pressure", "M-15"),
    ]
    
    for text, expected_sensor, expected_machine in typo_examples:
        entities = extract_entities(text)
        sensor_pass = expected_sensor in entities.get("sensor_types", [])
        machine_pass = expected_machine in entities.get("machine_ids", [])
        status = "PASS" if sensor_pass and machine_pass else "FAIL"
        print(f"[{status}] Text: '{text}' -> Extracted: {entities}")

if __name__ == "__main__":
    test_pipeline()
