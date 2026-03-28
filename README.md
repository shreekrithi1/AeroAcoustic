# Aero-Acoustic Asthma Predictor (Digital Twin)

A high-fidelity PWA for predictive asthma care moving from "reactive" to "preventive". 

## 🚀 Getting Started

### 1. Requirements
- Python 3.9+
- Node.js 18+

### 2. Run the Backend (FastAPI + DSP)
The backend handles complex signal processing (Spectral Centroid & MFCC extraction).
```bash
cd server
source venv/bin/activate
uvicorn main:app --reload
```

### 3. Run the Frontend (React PWA)
The frontend handles lossless WAV audio capture and real-time visualization.
```bash
cd client
npm run dev
```

## 🧠 Technology & Logic
- **Spectral Centroid Analysis**: Detects airway narrowing (turbulence) by monitoring frequency shifts (>15%).
- **Digital Twin**: Records unique user baseline for high-precision comparison.
- **Web Audio API**: Provides low-latency microphone access with real-time Oscilloscope.
- **PWA**: Optimized for mobile browser usage (no App Store required).

## ⚠️ Disclaimer
This application is a supplementary wellness tool and is NOT a replacement for professional medical advice, diagnosis, or a rescue inhaler.
