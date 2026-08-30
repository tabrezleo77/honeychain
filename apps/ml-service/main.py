import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np
import pandas as pd
from datetime import datetime

app = FastAPI(
    title="HoneyChain ML Prediction Service",
    description="Microservice for yield prediction and optimal harvesting window estimation",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TelemetryRecord(BaseModel):
    weight_kg: float
    temperature_c: float
    humidity_pct: float
    timestamp: str

class YieldPredictionInput(BaseModel):
    hive_id: str
    telemetry_history: List[TelemetryRecord]

class YieldPredictionOutput(BaseModel):
    predicted_yield_kg: float
    estimated_harvest_days: int
    confidence_score: float

@app.get("/")
def read_root():
    return {"status": "online", "service": "HoneyChain ML Service"}

@app.post("/predict/yield", response_model=YieldPredictionOutput)
async def predict_yield(payload: YieldPredictionInput):
    history = payload.telemetry_history
    if not history:
        raise HTTPException(status_code=400, detail="Telemetry history cannot be empty")
    
    # Sort history by timestamp
    try:
        sorted_history = sorted(
            history, 
            key=lambda x: datetime.fromisoformat(x.timestamp.replace("Z", "+00:00"))
        )
    except Exception as e:
        # Fallback to general sorting if format varies
        sorted_history = history

    # Extract values for processing
    weights = [r.weight_kg for r in sorted_history]
    temps = [r.temperature_c for r in sorted_history]
    humidities = [r.humidity_pct for r in sorted_history]
    
    # Calculate short term features (simulating XGBoost yield delta calculation)
    # Feature 1: Weight delta (dW/dt)
    if len(weights) > 1:
        weight_delta = weights[-1] - weights[0]
        recent_delta = weights[-1] - weights[-2]
    else:
        weight_delta = 0.0
        recent_delta = 0.0

    # Feature 2: Climate health indices (Hives produce more when Temp is 25-35 C, Humid 50-70%)
    avg_temp = np.mean(temps)
    avg_humidity = np.mean(humidities)
    
    temp_score = max(0.0, 1.0 - abs(avg_temp - 30.0) / 15.0)  # Peak at 30C
    humidity_score = max(0.0, 1.0 - abs(avg_humidity - 60.0) / 30.0)  # Peak at 60%
    climate_factor = (temp_score + humidity_score) / 2.0

    # Simulating XGBoost inference: base yield + climate + rolling delta
    base_yield = weights[-1] if weights else 10.0
    predicted_yield = base_yield + (weight_delta * 1.5) + (climate_factor * 2.0)
    # Ensure predicted yield is not less than current weight
    predicted_yield = max(predicted_yield, base_yield)

    # Simulating Prophet seasonality forecast
    # Determine the day of the year to simulate seasonal nectar flow (spring/summer peaks)
    try:
        last_dt = datetime.fromisoformat(sorted_history[-1].timestamp.replace("Z", "+00:00"))
        day_of_year = last_dt.timetuple().tm_yday
    except:
        day_of_year = 150  # Fallback to late May

    # Seasonal flower multiplier (sine wave peak around June, day 172)
    seasonality = np.sin((day_of_year - 80) / 365.0 * 2.0 * np.pi)
    
    # Estimate days until optimal harvest (ETAH)
    # Typically, harvest when weight hits around 45-50 kg.
    target_weight = 45.0
    current_weight = weights[-1]
    
    if current_weight >= target_weight:
        eta_days = 0
    else:
        growth_rate = max(0.1, recent_delta if recent_delta > 0 else 0.2)
        # Apply seasonality modifier to growth rate
        growth_rate = growth_rate * (1.0 + 0.5 * seasonality)
        eta_days = int((target_weight - current_weight) / growth_rate)
        # Cap ETA at 60 days
        eta_days = min(max(eta_days, 1), 60)

    # Compute confidence score based on the volume of historical data
    # (more logs = more confident model prediction)
    data_volume_factor = min(1.0, len(history) / 100.0)  # Max confidence at 100+ points
    confidence = 0.5 + (data_volume_factor * 0.4) + (climate_factor * 0.1)
    confidence = min(max(confidence, 0.1), 0.99)

    return YieldPredictionOutput(
        predicted_yield_kg=round(float(predicted_yield), 2),
        estimated_harvest_days=int(eta_days),
        confidence_score=round(float(confidence), 2)
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
