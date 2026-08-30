import time
import requests
import random
import math
from datetime import datetime

# Configuration
API_URL = "http://localhost:4000/api/v1/telemetry/ingest"
API_KEY = "super-secret-api-key-for-esp32-sensor-ingestion"
HIVE_MAC = "EC:94:C4:4D:22:98"

print("==================================================")
print("     HONEYCHAIN ESP32 HARDWARE EMULATOR RUNNER")
print("==================================================")
print(f"Target Gateway: {API_URL}")
print(f"Hive MAC Addr:  {HIVE_MAC}")
print("Simulating DHT22 Climate & HX711 Load Cell...")

# Simulation initial parameters
current_weight = 28.5  # Starting weight in kg
cycles = 0

try:
    while True:
        cycles += 1
        # Simulating time-of-day cycles for temperature and humidity using sine waves
        # Day cycles run over 24 steps
        angle = (cycles % 24) * (2 * math.pi / 24)
        
        # Temp peak at midday (around step 12)
        temperature = 28.0 + 4.5 * math.sin(angle - math.pi/2) + random.uniform(-0.5, 0.5)
        # Humidity valley at midday (inversely proportional)
        humidity = 60.0 - 10.0 * math.sin(angle - math.pi/2) + random.uniform(-1.0, 1.0)
        
        # Simulating slow honey collection (weight accumulation)
        # Beekeeping cluster gains weight as nectar is brought back
        weight_increment = max(-0.05, random.uniform(-0.1, 0.25))  # mostly positive weight gain
        current_weight += weight_increment
        
        # Round parameters for hardware emulation formatting
        payload = {
            "hive_mac": HIVE_MAC,
            "weight_kg": round(current_weight, 2),
            "temperature_c": round(temperature, 1),
            "humidity_pct": round(humidity, 1),
            "api_key": API_KEY
        }
        
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Loop #{cycles}")
        print(f"  -> Sensors: Weight: {payload['weight_kg']}kg | Temp: {payload['temperature_c']}C | Hum: {payload['humidity_pct']}%")
        
        try:
            response = requests.post(API_URL, json=payload, timeout=5)
            if response.status_code == 200:
                res_data = response.json()
                print("  -> Ingestion Gateway Status: 200 OK")
                if 'mlPrediction' in res_data and res_data['mlPrediction']:
                    ml = res_data['mlPrediction']
                    print(f"  -> ML Predictor Forecast: Yield: {ml['predicted_yield_kg']}kg | ETAH: {ml['estimated_harvest_days']} days | Confidence: {int(ml['confidence_score']*100)}%")
            else:
                print(f"  -> Gateway Error {response.status_code}: {response.text}")
        except requests.exceptions.ConnectionError:
            print("  -> Ingestion Gateway Error: Offline. Cannot connect to API gateway server.")
        
        # Run every 5 seconds for demonstration purposes
        time.sleep(5)

except KeyboardInterrupt:
    print("\nEmulator stopped by operator.")
