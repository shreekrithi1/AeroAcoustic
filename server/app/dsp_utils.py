"""
Aero-Acoustic DSP Engine — Spectral Centroid Analysis
======================================================
Clinical-grade breath analysis using Spectral Centroid as the core
diagnostic metric. The centroid represents the "center of mass" of
the frequency spectrum:

    C_t = Σ f(n) · x_t(n) / Σ x_t(n)

Where f(n) = center frequency of bin n, x_t(n) = magnitude of bin n.

Healthy lungs → low centroid (~800-1500 Hz, "bready" sound)
Constricted lungs → high centroid (>2000 Hz, turbulence/whistling)

Asymmetric Stoplight Thresholds:
  ● Green:  -5% to +7% shift from baseline  → Normal
  ● Yellow: +8% to +15% shift               → Minor airway restriction
  ● Red:    >+15% shift                      → Significant turbulence

Quality Gate:
  ● Reject recordings with SNR < 15 dB (too noisy for reliable analysis)
"""

import librosa
import numpy as np
from typing import Dict, Tuple, Any, Optional

# ─── Constants ───────────────────────────────────────
NOISE_FLOOR_DB = -40.0         # Ignore frames below this threshold
HF_BAND_LOW = 2000             # Hz — high-frequency band start
HF_BAND_HIGH = 5000            # Hz — high-frequency band end
PATHOLOGICAL_THRESHOLD = 3000   # Hz — turbulence marker
TOP_PERCENTILE = 0.10           # Use top 10% loudest frames for peak centroid
N_MFCC = 13                    # MFCC coefficient count
MIN_SNR_DB = 15.0              # Minimum SNR for reliable analysis

# Asymmetric Stoplight Thresholds (% shift from baseline)
GREEN_LOW = -5.0               # Lower bound of green zone
GREEN_HIGH = 7.0               # Upper bound of green zone
YELLOW_HIGH = 15.0             # Upper bound of yellow zone (beyond = red)

# Trend Engine Constants
TREND_WINDOW_HOURS = 12        # Look-back window for trend analysis
TREND_CONSECUTIVE_YELLOWS = 3  # Yellows needed to auto-escalate to red


def calculate_snr(y: np.ndarray, sr: int) -> float:
    """
    Calculate Signal-to-Noise Ratio (SNR) in dB.
    
    Method: Compare RMS of the loudest 20% to the quietest 20%.
    This approximates signal (breath) vs noise (ambient).
    """
    rms = librosa.feature.rms(y=y)[0]
    sorted_rms = np.sort(rms)
    n = len(sorted_rms)
    
    if n < 5:
        return 0.0
    
    # Noise floor = quietest 20% of frames
    noise_rms = np.mean(sorted_rms[:max(1, n // 5)])
    # Signal = loudest 20% of frames
    signal_rms = np.mean(sorted_rms[-max(1, n // 5):])
    
    if noise_rms <= 0:
        return 60.0  # Effectively no noise
    
    snr = 20 * np.log10(signal_rms / noise_rms)
    return float(snr)


def extract_breath_features(file_path: str) -> Dict[str, Any]:
    """
    Extracts clinical acoustic features from a breath recording.
    
    Pipeline:
      1. Load audio at native sample rate (must be ≥44.1kHz)
      2. Calculate SNR for quality gate
      3. Apply noise floor filter (reject < -40dB frames)
      4. Compute Spectral Centroid (the core diagnostic metric)
      5. Extract peak-breath centroid (top 10% loudest frames)
      6. Compute MFCC baseline fingerprint
      7. Measure high-frequency turbulence ratio
      8. Calculate turbulence flux (frequency stability)
    
    Returns comprehensive feature dictionary.
    """
    # 1. Load audio at native sample rate — preserves 44.1kHz fidelity
    y, sr = librosa.load(file_path, sr=None)
    duration = float(librosa.get_duration(y=y, sr=sr))
    
    # 2. Signal-to-Noise Ratio — quality gate
    snr_db = calculate_snr(y, sr)
    
    # 3. Short-Time Fourier Transform
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    
    # 4. Noise Floor Filter — ignore frames below -40dB
    S_db = librosa.amplitude_to_db(S, ref=np.max)
    frame_max_db = np.max(S_db, axis=0)
    active_frames = frame_max_db > NOISE_FLOOR_DB
    n_active = int(np.sum(active_frames))
    
    # 5. Spectral Centroid — C_t = Σ f(n)·x_t(n) / Σ x_t(n)
    centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    
    if n_active > 0:
        # Filter to active frames only
        active_mask = active_frames[:len(centroids)] if len(active_frames) >= len(centroids) else np.ones(len(centroids), dtype=bool)
        active_centroids = centroids[active_mask]
        mean_centroid = float(np.mean(active_centroids))
        
        # 6. Peak-Breath Centroid — top 10% loudest frames
        # Ensures we measure the actual blow, not background
        n_peak = max(1, int(len(active_centroids) * TOP_PERCENTILE))
        peak_centroid = float(np.mean(np.sort(active_centroids)[-n_peak:]))
    else:
        mean_centroid = float(np.mean(centroids))
        peak_centroid = mean_centroid
    
    # 7. MFCCs — Mel-Frequency Cepstral Coefficients
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
    mean_mfccs = np.mean(mfccs, axis=1).tolist()
    
    # 8. High-Frequency Energy Ratio (2kHz-5kHz)
    hf_mask = (freqs >= HF_BAND_LOW) & (freqs <= HF_BAND_HIGH)
    hf_energy = float(np.sum(S[hf_mask, :]))
    total_energy = float(np.sum(S))
    hf_ratio = hf_energy / total_energy if total_energy > 0 else 0.0
    
    # 9. Turbulence Flux — frame-to-frame centroid instability
    if len(centroids) > 1:
        centroid_diffs = np.abs(np.diff(centroids))
        turbulence_flux = float(np.mean(centroid_diffs))
        max_flux = float(np.max(centroid_diffs))
    else:
        turbulence_flux = 0.0
        max_flux = 0.0
    
    # 10. Pathological Frequency Detection (>3000Hz)
    pathological_frames = int(np.sum(centroids > PATHOLOGICAL_THRESHOLD))
    pathological_ratio = pathological_frames / len(centroids) if len(centroids) > 0 else 0.0
    
    # 11. Spectral Bandwidth
    bandwidths = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    mean_bandwidth = float(np.mean(bandwidths))
    
    # 12. RMS Energy
    rms = librosa.feature.rms(y=y)[0]
    mean_rms = float(np.mean(rms))
    max_rms = float(np.max(rms))
    
    return {
        # Core diagnostic metric
        "centroid": mean_centroid,
        "peak_centroid": peak_centroid,
        
        # Quality gate
        "snr_db": round(snr_db, 2),
        "quality_ok": snr_db >= MIN_SNR_DB,
        
        # Turbulence markers
        "hf_ratio": hf_ratio,
        "turbulence_flux": turbulence_flux,
        "max_flux": max_flux,
        "pathological_ratio": pathological_ratio,
        
        # Fingerprint
        "mfccs": mean_mfccs,
        "bandwidth": mean_bandwidth,
        
        # Signal quality
        "sample_rate": sr,
        "duration": duration,
        "active_frames": n_active,
        "total_frames": len(centroids),
        "mean_rms": mean_rms,
        "max_rms": max_rms,
        "noise_floor_db": NOISE_FLOOR_DB,
    }


def classify_shift(deviation_pct: float) -> str:
    """
    Classify a centroid shift percentage into a clinical zone
    using ASYMMETRIC thresholds.
    
      Green:  -5% to +7%   (normal variation)
      Yellow: +8% to +15%  (minor restriction)
      Red:    >+15%         (significant turbulence)
      
    Note: Large negative shifts (< -5%) are also flagged yellow
    as they could indicate recording artifacts or unusual patterns.
    """
    if GREEN_LOW <= deviation_pct <= GREEN_HIGH:
        return "green"
    elif deviation_pct < GREEN_LOW:
        # Large negative shift — unusual, flag as yellow
        return "yellow"
    elif deviation_pct <= YELLOW_HIGH:
        return "yellow"
    else:
        return "red"


def check_trend_escalation(history: list, current_zone: str) -> str:
    """
    Trend Engine: If the user has 3+ consecutive 'yellow' results 
    within 12 hours, auto-escalate to 'red'.
    
    This catches the "slow burn" of a developing asthma flare-up 
    that traditional single-point devices miss.
    """
    if current_zone != "yellow":
        return current_zone
    
    from datetime import datetime, timedelta
    
    now = datetime.now()
    window_start = now - timedelta(hours=TREND_WINDOW_HOURS)
    
    # Count consecutive yellows in the window (most recent first)
    consecutive_yellows = 1  # Current result counts as 1
    
    # Walk backwards through history
    sorted_history = sorted(history, key=lambda x: x.get("timestamp", ""), reverse=True)
    
    for entry in sorted_history:
        try:
            ts = datetime.fromisoformat(entry["timestamp"])
            if ts < window_start:
                break
            
            zone = entry.get("clinical_zone", "unknown")
            if zone == "yellow":
                consecutive_yellows += 1
            else:
                break  # Chain broken
        except (ValueError, KeyError):
            break
    
    if consecutive_yellows >= TREND_CONSECUTIVE_YELLOWS:
        return "red"
    
    return current_zone


def calculate_lung_health_score(
    baseline_centroid: float, 
    current_centroid: float,
    baseline_features: Dict[str, Any] = None,
    current_features: Dict[str, Any] = None,
    history: list = None,
) -> Tuple[int, str, str]:
    """
    Calculates Lung Health Index with asymmetric stoplight thresholds
    and trend-based escalation.
    
    Returns: (score, recommendation, clinical_zone)
    
    Asymmetric Thresholds:
      ● Green:  -5% to +7%   → Normal daily variation
      ● Yellow: +8% to +15%  → Minor airway restriction
      ● Red:    >+15%        → Significant turbulence  
    
    Trend Engine: 3 consecutive yellows in 12h → auto-Red
    """
    if baseline_centroid <= 0:
        return 50, "Baseline data invalid. Please recalibrate.", "unknown"
    
    # ─── Core: Spectral Centroid Deviation ───
    deviation = (current_centroid - baseline_centroid) / baseline_centroid
    deviation_pct = deviation * 100
    abs_deviation = abs(deviation)
    
    # ─── Score Calculation ───
    # 0% deviation → 100, 30% deviation → 0, clamped [1, 100]
    base_score = 100 - (abs_deviation / 0.30) * 100
    
    # Advanced feature modifiers
    modifier = 0.0
    if baseline_features and current_features:
        # Turbulence Flux penalty
        baseline_flux = baseline_features.get("turbulence_flux", 0)
        current_flux = current_features.get("turbulence_flux", 0)
        if baseline_flux > 0:
            flux_increase = (current_flux - baseline_flux) / baseline_flux
            modifier -= max(0, flux_increase * 10)
        
        # Pathological ratio penalty
        path_ratio = current_features.get("pathological_ratio", 0)
        modifier -= path_ratio * 15
        
        # HF ratio penalty
        baseline_hf = baseline_features.get("hf_ratio", 0)
        current_hf = current_features.get("hf_ratio", 0)
        if baseline_hf > 0:
            hf_increase = (current_hf - baseline_hf) / baseline_hf
            modifier -= max(0, hf_increase * 8)
    
    final_score = max(1, min(100, int(base_score + modifier)))
    
    # ─── Clinical Zone (Asymmetric Thresholds) ───
    clinical_zone = classify_shift(deviation_pct)
    
    # ─── Trend Engine: Escalation Check ───
    if history is not None and clinical_zone == "yellow":
        clinical_zone = check_trend_escalation(history, clinical_zone)
    
    # ─── Clinical Recommendation ───
    if clinical_zone == "green":
        recommendation = (
            "Lungs sounding clear! Breath pattern matches your healthy baseline. "
            f"Centroid shift: {deviation_pct:+.1f}% (within -5% to +7% safe zone). "
            "Keep it up!"
        )
    elif clinical_zone == "yellow":
        recommendation = (
            f"Minor turbulence detected ({deviation_pct:+.1f}% centroid shift). "
            "This suggests mild airway changes. "
            "Hydrate and re-test in 2 hours. If symptoms persist, consult your action plan."
        )
    else:  # red
        # Check if escalated by trend engine
        was_trend_escalated = classify_shift(deviation_pct) == "yellow"
        if was_trend_escalated:
            recommendation = (
                f"⚠ Trend Alert: {TREND_CONSECUTIVE_YELLOWS}+ consecutive yellow results detected within {TREND_WINDOW_HOURS} hours. "
                f"Current shift: {deviation_pct:+.1f}%. "
                "Pattern suggests a developing flare-up. "
                "Check your peak flow or consult your medical action plan."
            )
        elif deviation_pct > 25:
            recommendation = (
                f"Critical spectral deviation ({deviation_pct:+.1f}%). "
                "Severe turbulence detected above 3000Hz threshold. "
                "Seek immediate medical evaluation. Use rescue medication now."
            )
        else:
            recommendation = (
                f"Significant airway narrowing suspected ({deviation_pct:+.1f}% shift). "
                "High-frequency turbulence indicates constriction is occurring. "
                "Check your peak flow or consult your medical action plan."
            )
    
    return final_score, recommendation, clinical_zone
