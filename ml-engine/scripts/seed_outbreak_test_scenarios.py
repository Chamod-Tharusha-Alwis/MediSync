import os
import sys
from datetime import datetime, timedelta
import random
from pymongo import MongoClient
from dotenv import load_dotenv

# Load env from server directory
server_env_path = os.path.join(os.path.dirname(__file__), '..', '..', 'server', '.env')
load_dotenv(server_env_path)

PROD_DB_NAME = "test"
TEST_DB_NAME = "medisync_automated_test"

args = sys.argv[1:]
target_db = None
for arg in args:
    if arg.startswith("--target-db="):
        target_db = arg.split("=", 1)[1].strip()

if target_db not in (PROD_DB_NAME, TEST_DB_NAME):
    print(f"[SAFEGUARD] Explicit --target-db={TEST_DB_NAME} (or --target-db={PROD_DB_NAME} --confirm-production-seed) is required.")
    sys.exit(1)

if target_db == PROD_DB_NAME and "--confirm-production-seed" not in args:
    print(f"[SAFEGUARD] Seeding '{PROD_DB_NAME}' requires explicit --confirm-production-seed flag.")
    sys.exit(1)

selected_uri = os.getenv('MONGO_URI_TEST') if target_db == TEST_DB_NAME else os.getenv('MONGO_URI')
if not selected_uri:
    print(f"Error: Required MongoDB URI environment variable for target '{target_db}' is missing.")
    sys.exit(1)

if "127.0.0.1" in selected_uri or "localhost" in selected_uri:
    print("[SAFEGUARD] Local MongoDB is prohibited. MediSync uses MongoDB Atlas Free (M0) only.")
    sys.exit(1)

print(f"Connecting to MongoDB Atlas [target={target_db}]...")
client = MongoClient(selected_uri)
db = client[target_db]
consultations = db['consultations']

now = datetime.utcnow()
recent_start = now - timedelta(days=6)
baseline_start = now - timedelta(days=29)

def insert_scenario(disease, district, recent_count, baseline_count):
    docs = []
    print(f"Seeding {disease} in {district}: {recent_count} recent, {baseline_count} baseline")
    
    # Insert recent (last 7 days)
    for _ in range(recent_count):
        random_recent = recent_start + timedelta(hours=random.randint(0, 140))
        docs.append({
            "consultationId": f"CON-DEMO-{random.randint(1000000, 9999999)}",
            "diagnosis": disease,
            "district": district,
            "createdAt": random_recent,
            "patientNic": "999999999V",
            "doctorId": None,
            "status": "completed",
            "isOutbreakSeed": True,
            "isDemoData": True,
            "isSynthetic": True,
            "datasetVersion": "MEDISYNC_UNIV_DEMO_V2"
        })
        
    # Insert baseline (prev 23 days)
    for _ in range(baseline_count):
        random_baseline = baseline_start + timedelta(days=random.randint(0, 22))
        docs.append({
            "consultationId": f"CON-DEMO-{random.randint(1000000, 9999999)}",
            "diagnosis": disease,
            "district": district,
            "createdAt": random_baseline,
            "patientNic": "999999999V",
            "doctorId": None,
            "status": "completed",
            "isOutbreakSeed": True,
            "isDemoData": True,
            "isSynthetic": True,
            "datasetVersion": "MEDISYNC_UNIV_DEMO_V2"
        })
        
    if docs:
        consultations.insert_many(docs)

# Clear previous scoped outbreak seeds to avoid compounding
deleted = consultations.delete_many({"isOutbreakSeed": True, "isSynthetic": True}).deleted_count
print(f"Cleared {deleted} previous synthetic outbreak seed records.")

# High Severity (Strict >10 cases, >=600% spike for Critical/High)
# Dengue (Danger: High)
insert_scenario("Dengue", "Colombo", 50, 0)
insert_scenario("Cholera", "Kandy", 60, 5)

# Moderate/Low Severity
# Gastroenteritis (Danger: Medium) -> Needs >30 cases and >=300% spike (but <600% for medium)
insert_scenario("Gastroenteritis", "Galle", 40, 10) 
# Common Cold (Danger: Low) -> Needs >100 cases, >=800% spike for medium
insert_scenario("Common Cold", "Matara", 150, 5)

# Normal Baseline (No alerts)
insert_scenario("Asthma", "Jaffna", 5, 20)
insert_scenario("Malaria", "Trincomalee", 2, 2)

print("\nSeeding complete! You can now trigger the outbreak detection API.")
