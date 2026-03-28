from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import shutil
import os
import uuid
import json
from datetime import datetime
from app.dsp_utils import extract_breath_features, calculate_lung_health_score

app = FastAPI(title="Aero-Acoustic Asthma Predictor (Robust v2)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = "data"
USERS_FILE = os.path.join(DATA_DIR, "users.json")
RESULTS_DIR = os.path.join(DATA_DIR, "results")
os.makedirs(RESULTS_DIR, exist_ok=True)

# Basic Mock DB
def load_db():
    if not os.path.exists(USERS_FILE):
        return {"users": {
            "admin": {"id": "admin", "username": "admin", "password": "password", "role": "admin"},
            "patient1": {"id": "patient1", "username": "patient1", "password": "password", "role": "patient", "name": "Test Patient", "baseline": None}
        }}
    with open(USERS_FILE, "r") as f:
        return json.load(f)

def save_db(db):
    with open(USERS_FILE, "w") as f:
        json.dump(db, f, indent=2)

# Models
class User(BaseModel):
    id: str
    username: str
    role: str
    name: Optional[str] = None
    baseline: Optional[Dict[str, Any]] = None

class TestResult(BaseModel):
    id: str
    timestamp: str
    score: int
    recommendation: str
    centroid: float
    peak_centroid: float = 0.0
    deviation_percent: float
    hf_ratio: float = 0.0
    turbulence_flux: float = 0.0
    pathological_ratio: float = 0.0
    bandwidth: float = 0.0
    clinical_zone: Optional[str] = "unknown"  # green, yellow, red
    raw_wave: Optional[List[float]] = None # For overlay comparison

class PatientResponse(BaseModel):
    id: str
    name: str
    username: str
    baseline: Optional[Dict[str, Any]]
    history: List[TestResult] = []

class RegisterRequest(BaseModel):
    username: str
    password: str
    name: str
    role: str # 'patient' or 'admin'

# Auth
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_user(token: str = Depends(oauth2_scheme)):
    db = load_db()
    for user_id, user in db["users"].items():
        if user_id == token: # Simplified: token is the user_id for mock
            return user
    raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = load_db()
    user_key = None
    for k, v in db["users"].items():
        if v["username"] == form_data.username and v["password"] == form_data.password:
            user_key = k
            break
            
    if not user_key:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    return {"access_token": user_key, "token_type": "bearer", "role": db["users"][user_key]["role"]}

@app.post("/register")
async def register(req: RegisterRequest):
    db = load_db()
    for u in db["users"].values():
        if u["username"] == req.username:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    uid = str(uuid.uuid4())
    db["users"][uid] = {
        "id": uid,
        "username": req.username,
        "password": req.password,
        "role": req.role,
        "name": req.name,
        "baseline": None
    }
    save_db(db)
    return {"status": "success", "message": "User registered successfully"}

@app.get("/me", response_model=User)
async def get_me(user: dict = Depends(get_current_user)):
    return user

# Admin Endpoints
@app.get("/admin/patients", response_model=List[PatientResponse])
async def get_patients(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db = load_db()
    patients = []
    for uid, data in db["users"].items():
        if data["role"] == "patient":
            history_file = os.path.join(RESULTS_DIR, f"{uid}.json")
            history = []
            if os.path.exists(history_file):
                with open(history_file, "r") as hf:
                    history = json.load(hf)
            
            patients.append(PatientResponse(
                id=uid,
                name=data.get("name", data["username"]),
                username=data["username"],
                baseline=data.get("baseline"),
                history=history
            ))
    return patients

# Patient Endpoints
@app.post("/record-baseline")
async def record_baseline(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can have a baseline.")
    
    # Process
    tmp_path = f"tmp_base_{uuid.uuid4()}.wav"
    with open(tmp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        features = extract_breath_features(tmp_path)
        db = load_db()
        db["users"][user["id"]]["baseline"] = features
        save_db(db)
        return {"status": "success", "baseline": features}
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)

@app.post("/analyze", response_model=TestResult)
async def analyze_breath(
    file: UploadFile = File(...), 
    mode: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Clinician role cannot perform personal analysis.")
    
    db = load_db()
    baseline = db["users"][user["id"]].get("baseline")
    
    if not baseline and mode != "calibration":
        raise HTTPException(status_code=400, detail="No baseline recorded. Go to Labs first.")

    tmp_path = f"tmp_test_{uuid.uuid4()}.wav"
    with open(tmp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Extract current features
        features = extract_breath_features(tmp_path)
        
        # Quality Gate: SNR check
        if not features.get("quality_ok", True):
            snr = features.get("snr_db", 0)
            raise HTTPException(
                status_code=422,
                detail=f"Recording too noisy (SNR: {snr:.1f}dB). Please find a quieter spot and try again."
            )
        
        # Load existing history for trend engine
        hist_path = os.path.join(RESULTS_DIR, f"{user['id']}.json")
        history = []
        if os.path.exists(hist_path):
            with open(hist_path, "r") as hf:
                history = json.load(hf)
        
        # If in calibration mode, return features without baseline comparison
        if mode == "calibration":
            return TestResult(
                id=str(uuid.uuid4()),
                timestamp=datetime.now().isoformat(),
                score=100,
                recommendation="Calibration capture successful.",
                centroid=round(features["centroid"], 2),
                peak_centroid=round(features.get("peak_centroid", features["centroid"]), 2),
                deviation_percent=0.0,
                clinical_zone="unknown",
            )

        # Calculate score with full feature context + trend engine
        score, rec, clinical_zone = calculate_lung_health_score(
            baseline_centroid=baseline["centroid"],
            current_centroid=features["centroid"],
            baseline_features=baseline,
            current_features=features,
            history=history,
        )
        
        # Centroid deviation percentage
        deviation = (features["centroid"] - baseline["centroid"]) / baseline["centroid"] * 100
        
        result = TestResult(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            score=score,
            recommendation=rec,
            centroid=round(features["centroid"], 2),
            peak_centroid=round(features.get("peak_centroid", features["centroid"]), 2),
            deviation_percent=round(deviation, 2),
            hf_ratio=round(features.get("hf_ratio", 0), 4),
            turbulence_flux=round(features.get("turbulence_flux", 0), 2),
            pathological_ratio=round(features.get("pathological_ratio", 0), 4),
            bandwidth=round(features.get("bandwidth", 0), 2),
            clinical_zone=clinical_zone,
        )
        
        # Save to history
        history.append(result.dict())
        with open(hist_path, "w") as hf:
            json.dump(history, hf, indent=2)
            
        return result
    finally:
        if os.path.exists(tmp_path): os.remove(tmp_path)

@app.get("/history", response_model=List[TestResult])
async def get_history(user: dict = Depends(get_current_user)):
    hist_path = os.path.join(RESULTS_DIR, f"{user['id']}.json")
    if os.path.exists(hist_path):
        with open(hist_path, "r") as hf:
            return json.load(hf)
    return []

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
