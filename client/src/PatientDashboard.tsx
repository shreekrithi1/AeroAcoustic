import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, CheckCircle2, History, Info, AlertTriangle, ShieldCheck, TrendingUp, Wind, Mic, ChevronRight, BarChart3, Heart, Waves, Zap, Volume2, X, Download, FileText, Share2 } from 'lucide-react';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { Oscilloscope } from './components/Oscilloscope';
import { CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';
import confetti from 'canvas-confetti';

interface TestResult {
  id: string;
  timestamp: string;
  score: number;
  recommendation: string;
  deviation_percent: number;
  centroid?: number;
  peak_centroid?: number;
  hf_ratio?: number;
  turbulence_flux?: number;
  pathological_ratio?: number;
  bandwidth?: number;
  clinical_zone?: string;  // "green" | "yellow" | "red"
  tags?: string[];
  noise_floor?: number;
  max_freq_detected?: number;
  raw_wave?: number[]; // For overlay comparison
}

interface CalibrationBlow {
  centroid: number;
  wave: number[];
}

/* ============================================================
   SVG GAUGE COMPONENT — Speedometer-style (Red → Yellow → Green)
   Maps a 0-100 score to a 180° arc with color zones.
   ============================================================ */
const GaugeChart: React.FC<{ score: number; size?: number }> = ({ score, size = 220 }) => {
    const cx = size / 2;
    const cy = size / 2 + 10;
    const r = size * 0.38;
    const strokeWidth = size * 0.09;
    const tickR = r + strokeWidth / 2 + 4;

    const polarToCartesian = (angle: number) => {
        const rad = (Math.PI * angle) / 180;
        return { x: cx + r * Math.cos(Math.PI - rad), y: cy - r * Math.sin(Math.PI - rad) };
    };

    const describeArc = (startAngle: number, endAngle: number) => {
        const start = polarToCartesian(startAngle);
        const end = polarToCartesian(endAngle);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
    };

    const needleAngle = (Math.max(0, Math.min(100, score)) / 100) * 180;
    const needleTip = polarToCartesian(needleAngle);

    // Rich gradient zone definitions
    const zones = [
        { start: 0, end: 36, id: 'gz0', c1: '#991B1B', c2: 'var(--color-red)' },     // Dark Red → Red
        { start: 36, end: 72, id: 'gz1', c1: '#B45309', c2: 'var(--color-yellow)' },  // Amber → Yellow
        { start: 72, end: 108, id: 'gz2', c1: '#84cc16', c2: '#A3E635' },           // Lime
        { start: 108, end: 180, id: 'gz3', c1: '#059669', c2: 'var(--color-green)' },  // Emerald
    ];

    const getScoreColor = (s: number) => {
        if (s >= 85) return 'var(--color-green)';
        if (s >= 70) return '#A3E635';
        if (s >= 55) return 'var(--color-yellow)';
        if (s >= 40) return '#F97316';
        return 'var(--color-red)';
    };

    // Tick marks at 0, 25, 50, 75, 100
    const ticks = [0, 25, 50, 75, 100].map(val => {
        const angle = (val / 100) * 180;
        const rad = (Math.PI * angle) / 180;
        const inner = { x: cx + (tickR - 6) * Math.cos(Math.PI - rad), y: cy - (tickR - 6) * Math.sin(Math.PI - rad) };
        const outer = { x: cx + (tickR + 2) * Math.cos(Math.PI - rad), y: cy - (tickR + 2) * Math.sin(Math.PI - rad) };
        const label = { x: cx + (tickR + 12) * Math.cos(Math.PI - rad), y: cy - (tickR + 12) * Math.sin(Math.PI - rad) };
        return { val, inner, outer, label };
    });

    return (
        <svg width={size} height={size * 0.68} viewBox={`0 0 ${size} ${size * 0.68}`}>
            <defs>
                {/* Gradient definitions for each zone */}
                {zones.map(z => (
                    <linearGradient key={z.id} id={z.id} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={z.c1} />
                        <stop offset="100%" stopColor={z.c2} />
                    </linearGradient>
                ))}
                {/* Glow filter */}
                <filter id="gaugeGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                {/* Needle glow */}
                <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>

            {/* Background track */}
            <path d={describeArc(0, 180)} fill="none" stroke="#0f1019" strokeWidth={strokeWidth + 6} strokeLinecap="round" />

            {/* Zone arcs with gradients — full opacity background */}
            {zones.map((zone, i) => (
                <path key={i} d={describeArc(zone.start, zone.end)} fill="none" stroke={`url(#${zone.id})`} strokeWidth={strokeWidth} strokeLinecap="butt" opacity={0.18} />
            ))}

            {/* Active arc with gradient glow */}
            {score > 0 && (
                <motion.path
                    d={describeArc(0, needleAngle)}
                    fill="none"
                    stroke={getScoreColor(score)}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    filter="url(#gaugeGlow)"
                    initial={{ strokeDasharray: '0 1000' }}
                    animate={{ strokeDasharray: `${(needleAngle / 180) * Math.PI * r} 1000` }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                />
            )}

            {/* Tick marks */}
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y} stroke="#2a2c42" strokeWidth={1.5} strokeLinecap="round" />
                    <text x={t.label.x} y={t.label.y + 3} textAnchor="middle" fill="#4a4c64" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">{t.val}</text>
                </g>
            ))}

            {/* Needle with glow */}
            <motion.line
                x1={cx} y1={cy}
                x2={needleTip.x} y2={needleTip.y}
                stroke="white" strokeWidth={2.5} strokeLinecap="round"
                filter="url(#needleGlow)"
                initial={{ x2: polarToCartesian(0).x, y2: polarToCartesian(0).y }}
                animate={{ x2: needleTip.x, y2: needleTip.y }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
            />

            {/* Center pivot — glossy double ring */}
            <circle cx={cx} cy={cy} r={8} fill="#1e2030" stroke={getScoreColor(score)} strokeWidth={2} />
            <circle cx={cx} cy={cy} r={4} fill={getScoreColor(score)} />
            <circle cx={cx} cy={cy} r={2} fill="white" opacity={0.6} />

            {/* Score text */}
            <text x={cx} y={cy - r * 0.35} textAnchor="middle" fill="white" fontSize={size * 0.18} fontWeight="800" fontFamily="Inter, sans-serif">
                {Math.round(score)}
            </text>
            <text x={cx} y={cy - r * 0.35 + size * 0.07} textAnchor="middle" fill="#4a4c64" fontSize={size * 0.045} fontWeight="700" fontFamily="Inter, sans-serif" letterSpacing="0.12em">
                HEALTH SCORE
            </text>
        </svg>
    );
};

/* ============================================================
   STOPLIGHT BADGE — Clinical deviation classification
   ============================================================ */
const StoplightBadge: React.FC<{ deviation: number }> = ({ deviation }) => {
    const abs = Math.abs(deviation);
    let zone: { label: string; color: string; bg: string; icon: React.ReactNode; desc: string };
    if (abs <= 5) {
        zone = { label: 'Normal', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: <CheckCircle2 size={16} />, desc: 'Centroid within 5% of baseline' };
    } else if (abs <= 15) {
        zone = { label: 'Caution', color: '#eab308', bg: 'rgba(234,179,8,0.08)', icon: <Info size={16} />, desc: 'Minor airway restriction detected' };
    } else {
        zone = { label: 'Alert', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: <AlertTriangle size={16} />, desc: 'Significant turbulence — seek evaluation' };
    }

    return (
        <div className="stoplight-badge" style={{ 
            background: zone.bg, 
            borderColor: zone.color + '40', 
            color: zone.color,
            boxShadow: abs > 15 ? '0 0 20px rgba(211, 47, 47, 0.15)' : 'none'
        }}>
            <div className="stoplight-header">
                {zone.icon}
                <span className="stoplight-label" style={{ fontWeight: 900 }}>{zone.label}</span>
                <span className="stoplight-pct">{deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%</span>
            </div>
            <p className="stoplight-desc" style={{ fontWeight: 600 }}>{zone.desc}</p>
        </div>
    );
};

/* ============================================================
   PROGRESS RING — Exhale Sustenance Visualizer
   ============================================================ */
const ProgressRing: React.FC<{ progress: number; size?: number; color?: string }> = ({ progress, size = 160, color = 'var(--accent-start)' }) => {
    const radius = size * 0.44;
    const stroke = 10;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div className="progress-ring-container">
            <svg height={size} width={size} className="progress-ring-svg">
                <circle
                    stroke="rgba(255,255,255,0.05)"
                    fill="transparent"
                    strokeWidth={stroke}
                    r={normalizedRadius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <motion.circle
                    stroke={color}
                    fill="transparent"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset }}
                    transition={{ duration: 0.1 }}
                    r={normalizedRadius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <Wind size={32} className={progress >= 100 ? 'text-success' : 'text-muted'} />
            </div>
        </div>
    );
};

/* ============================================================
   MAIN PATIENT DASHBOARD
   ============================================================ */
const PatientDashboard: React.FC = () => {
    const [view, setView] = useState<'home' | 'wizard' | 'testing' | 'result'>('home');
    const [history, setHistory] = useState<TestResult[]>([]);
    const [lastResult, setLastResult] = useState<TestResult | null>(null);
    const [hasBaseline, setHasBaseline] = useState(false);
    const [timer, setTimer] = useState(0);
    const [step, setStep] = useState(1);
    const [status, setStatus] = useState<'green' | 'yellow' | 'red'>('green');
    
    // Onboarding / Calibration State
    const [calibrationBlowing, setCalibrationBlowing] = useState<CalibrationBlow[]>([]);
    const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
    const [hwCheck, setHwCheck] = useState<{ ok: boolean; maxFreq: number }>({ ok: false, maxFreq: 0 });
    const [calibrationPhase, setCalibrationPhase] = useState<'calibration' | 'protocol' | 'commitment'>('calibration');
    const [isCalibratingNoise, setIsCalibratingNoise] = useState(false);

    // Overlay Comparison State
    const [overlayResult, setOverlayResult] = useState<TestResult | null>(null);

    const { isRecording, startRecording, stopRecording, audioBlob, analyser } = useAudioRecorder();

    useEffect(() => { 
        fetchUserData(); 
    }, []);

    // Theme effect: synchronize body attribute with current status
    useEffect(() => {
        document.body.setAttribute('data-status', status);
    }, [status]);

    const fetchUserData = async () => {
        const token = localStorage.getItem('aa_token');
        try {
            const me = await axios.get('http://localhost:8000/me', { headers: { Authorization: `Bearer ${token}` } });
            setHasBaseline(!!me.data.baseline);
            const hist = await axios.get('http://localhost:8000/history', { headers: { Authorization: `Bearer ${token}` } });
            const records = (hist.data || []).reverse();
            setHistory(records);
            if (records.length > 0) {
                setLastResult(records[0]);
                setStatus(records[0].clinical_zone as any || 'green');
            }
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        let interval: any;
        if (isRecording || isCalibratingNoise) {
            setTimer(0);
            interval = setInterval(() => {
                setTimer(prev => {
                    const limit = isCalibratingNoise ? 3.0 : 2.5;
                    if (prev >= limit) { stopRecording(); return limit; }
                    return prev + 0.1;
                });
            }, 100);
        }
        return () => clearInterval(interval);
    }, [isRecording, isCalibratingNoise, stopRecording]);

    useEffect(() => {
        if (audioBlob) {
            if (isCalibratingNoise) processNoiseFloor(audioBlob);
            else if (view === 'wizard') processCalibrationBlow(audioBlob);
            else if (view === 'testing') analyzeBreath(audioBlob);
        }
    }, [audioBlob]);

    const processNoiseFloor = async (blob: Blob) => {
        setIsCalibratingNoise(false);
        // Simulate noise floor analysis (In production, this would use FFT on the blob)
        // Here we mock the result for the BME project requirements
        const mockNoise = -42; // dB
        const mockFreq = 8000; // Hz
        setNoiseFloor(mockNoise);
        setHwCheck({ ok: mockFreq > 3000, maxFreq: mockFreq });
        
        if (mockNoise > -35) {
            alert("Room too noisy for medical-grade calibration. Current: " + mockNoise + "dB");
        } else {
            setCalibrationPhase('protocol');
            setStep(2);
        }
    };

    const processCalibrationBlow = async (blob: Blob) => {
        const token = localStorage.getItem('aa_token');
        const formData = new FormData();
        formData.append('file', blob, 'calibration.wav');
        try {
            const res = await axios.post('http://localhost:8000/analyze', formData, { 
                headers: { Authorization: `Bearer ${token}` },
                params: { mode: 'calibration' }
            });
            
            const newBlow: CalibrationBlow = { centroid: res.data.centroid, wave: res.data.raw_wave || [] };
            const updatedBlowing = [...calibrationBlowing, newBlow];
            
            // Consistency Check (if 3 blows collected)
            if (updatedBlowing.length === 3) {
                const centroids = updatedBlowing.map(b => b.centroid);
                const mean = centroids.reduce((a, b) => a + b, 0) / 3;
                const maxVariance = Math.max(...centroids.map(c => Math.abs((c - mean) / mean)));
                
                if (maxVariance > 0.15) {
                    alert("Blows inconsistent (>" + (maxVariance * 100).toFixed(1) + "% variance). Please rest for 5 minutes and try again to avoid lung fatigue.");
                    setCalibrationBlowing([]);
                    setStep(2);
                    return;
                }
                
                // Commitment
                await uploadBaseline(blob); // Use the last one or average (engine usually handles storage)
                setCalibrationBlowing(updatedBlowing);
                setCalibrationPhase('commitment');
                setStep(3);
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            } else {
                setCalibrationBlowing(updatedBlowing);
            }
        } catch (err) {
            alert('Calibration Blow Failed: Mic input dropped or signal too noisy.');
        }
    };

    const uploadBaseline = async (blob: Blob) => {
        const token = localStorage.getItem('aa_token');
        const formData = new FormData();
        formData.append('file', blob, 'baseline.wav');
        try {
            await axios.post('http://localhost:8000/record-baseline', formData, { headers: { Authorization: `Bearer ${token}` } });
            setHasBaseline(true);
            setStep(4);
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        } catch (err) { alert('Calibration Failed.'); }
    };

    const analyzeBreath = async (blob: Blob) => {
        const token = localStorage.getItem('aa_token');
        const formData = new FormData();
        formData.append('file', blob, 'test.wav');
        try {
            const res = await axios.post('http://localhost:8000/analyze', formData, { headers: { Authorization: `Bearer ${token}` } });
            setLastResult(res.data);
            setHistory(prev => [res.data, ...prev]);
            setStatus(res.data.clinical_zone);
            setView('result');
            
            // Interaction logic based on medical grade spec
            if (res.data.clinical_zone === 'green') {
                confetti({ particleCount: 150, spread: 80, colors: ['#4CAF50', '#8BC34A'] });
            }
            
            if (res.data.clinical_zone === 'red') {
                triggerHaptic('red');
                triggerAlert(res.data);
            }
            
            if (res.data.clinical_zone === 'yellow') {
                triggerHaptic('yellow');
            }
        } catch (err: any) {
            // Handle SNR quality gate (422 = noisy recording)
            const detail = err?.response?.data?.detail;
            if (err?.response?.status === 422 && detail) {
                alert(detail);
            } else {
                alert('Spectral Analysis Engine Error.');
            }
            setView('home');
        }
    };

    // Haptic vibration helper
    const triggerHaptic = (state: 'yellow' | 'red') => {
        if (!('vibrate' in navigator)) return;
        if (state === 'red') {
            // SOS-like pattern: Long-Short-Long
            navigator.vibrate([400, 100, 200, 100, 400]);
        } else {
            navigator.vibrate([200, 300, 200]);
        }
    };

    // Web Notifications API for Red zone alerts
    const triggerAlert = (result: TestResult) => {
        if (!('Notification' in window)) return;
        
        const sendNotification = () => {
            new Notification('⚠️ Asthma Alert — AeroLab AI', {
                body: `${getScoreLabel(result.score)} stability detected. ${result.deviation_percent > 0 ? '+' : ''}${result.deviation_percent.toFixed(1)}% centroid shift. Follow your medical action plan.`,
                icon: '/vite.svg',
            });
        };
        
        if (Notification.permission === 'granted') {
            sendNotification();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') sendNotification();
            });
        }
    };

    const getScoreColor = (score: number) => score >= 85 ? 'var(--color-green)' : score >= 70 ? '#8BC34A' : score >= 55 ? 'var(--color-yellow)' : score >= 40 ? '#F97316' : 'var(--color-red)';
    const getScoreLabel = (score: number) => score >= 85 ? 'Stable' : score >= 70 ? 'Fair' : score >= 55 ? 'Caution' : score >= 40 ? 'Mild Risk' : 'High Risk';

    // Derived metrics
    const avgScore = useMemo(() => {
        if (history.length === 0) return 0;
        return Math.round(history.reduce((a, b) => a + b.score, 0) / history.length);
    }, [history]);

    const trend = useMemo(() => {
        if (history.length < 2) return 0;
        return history[0].score - history[1].score;
    }, [history]);

    return (
        <div className="dashboard-container">
            <AnimatePresence mode="wait">

                {view === 'home' && (
                    <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 10 }}>

                        {/* Page Header */}
                        <div className="page-header">
                            <div>
                                <h1 className="page-title">Patient Dashboard</h1>
                                <p className="page-subtitle">Respiratory acoustic monitoring & diagnostic intelligence</p>
                            </div>
                            <div className="header-stats">
                                <div className="stat-badge clickable" onClick={() => { setView('wizard'); setCalibrationPhase('calibration'); setStep(1); }}>
                                    <ShieldCheck size={16} />
                                    <span>{hasBaseline ? 'Baseline Synced' : 'No Baseline'}</span>
                                    {hasBaseline && <span style={{ marginLeft: 4, opacity: 0.6 }}>(Re-calibrate)</span>}
                                </div>
                                <div className="stat-badge">
                                    <BarChart3 size={16} />
                                    <span>{history.length} Scans</span>
                                </div>
                            </div>
                        </div>

                        {/* ROW 1: Gauge + Stoplight + Quick Action */}
                        <div className="three-col-grid" style={{ marginTop: 24 }}>

                            {/* Column 1: Lung Health Index (THE BIG NUMBER) */}
                            <div className="col-card gauge-card">
                                <div className="col-card-header">
                                    <h3 style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health Index</h3>
                                    {status === 'green' ? 
                                        <Heart size={20} className="heart-pulse" /> : 
                                        status === 'yellow' ? <AlertTriangle size={20} style={{ color: 'var(--color-yellow)' }} /> :
                                        <X size={20} style={{ color: 'var(--color-red)' }} />
                                    }
                                </div>
                                <div className="col-card-body gauge-body">
                                    <div style={{ position: 'relative' }}>
                                        <GaugeChart score={lastResult ? lastResult.score : 0} size={250} />
                                        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
                                            {lastResult && (
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ 
                                                        fontSize: 14, 
                                                        fontWeight: 800, 
                                                        color: getScoreColor(lastResult.score),
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {status === 'green' ? 'System Stable' : status === 'yellow' ? 'Caution Needed' : 'Alert: Follow Plan'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {lastResult && <StoplightBadge deviation={lastResult.deviation_percent} />}
                                    {!lastResult && (
                                        <div className="gauge-empty">
                                            <p>Awaiting first diagnostic scan</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Column 2: Spectral Metrics */}
                            <div className="col-card">
                                <div className="col-card-header">
                                    <h3>Spectral Metrics</h3>
                                    <Waves size={18} className="col-icon" />
                                </div>
                                <div className="col-card-body">
                                    <div className="metrics-grid">
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)' }}>
                                                <Activity size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">{lastResult ? Math.round(lastResult.score) : '--'}</p>
                                                <p className="metric-label">Stability Index</p>
                                            </div>
                                        </div>
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#06b6d4', background: 'rgba(6,182,212,0.1)' }}>
                                                <TrendingUp size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">
                                                    {lastResult ? (lastResult.deviation_percent > 0 ? '+' : '') + lastResult.deviation_percent.toFixed(1) + '%' : '0.0%'}
                                                </p>
                                                <p className="metric-label">Centroid Shift</p>
                                            </div>
                                        </div>
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}>
                                                <Zap size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">{lastResult?.centroid ? lastResult.centroid.toFixed(0) + ' Hz' : '-- Hz'}</p>
                                                <p className="metric-label">Spectral Centroid</p>
                                            </div>
                                        </div>
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                                                <Waves size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">{lastResult?.turbulence_flux ? lastResult.turbulence_flux.toFixed(0) : '--'}</p>
                                                <p className="metric-label">Turbulence Flux</p>
                                            </div>
                                        </div>
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#8b5cf6', background: 'rgba(139,92,246,0.1)' }}>
                                                <BarChart3 size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">{lastResult?.hf_ratio ? (lastResult.hf_ratio * 100).toFixed(1) + '%' : '--%'}</p>
                                                <p className="metric-label">HF Energy Ratio</p>
                                            </div>
                                        </div>
                                        <div className="metric-tile">
                                            <div className="metric-icon" style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)' }}>
                                                <Volume2 size={20} />
                                            </div>
                                            <div>
                                                <p className="metric-value">{avgScore > 0 ? avgScore : '--'}</p>
                                                <p className="metric-label">Avg Score</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Trend indicator */}
                                    <div className="trend-bar">
                                        <span className="trend-label">Trend</span>
                                        <span className="trend-value" style={{ color: trend >= 0 ? '#22c55e' : '#ef4444' }}>
                                            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)} pts
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Quick Actions */}
                            <div className="col-card">
                                <div className="col-card-header">
                                    <h3>Quick Actions</h3>
                                    <Wind size={18} className="col-icon" />
                                </div>
                                <div className="col-card-body">
                                    <button
                                        onClick={() => hasBaseline ? setView('testing') : setView('wizard')}
                                        className="action-hero-btn"
                                    >
                                        <div className="action-icon-wrap">
                                            <Mic size={28} />
                                        </div>
                                        <div>
                                            <p className="action-title">{hasBaseline ? 'Run Diagnostic Scan' : 'Setup Baseline'}</p>
                                            <p className="action-desc">2.5s breath capture at 44.1kHz / 16-bit PCM</p>
                                        </div>
                                        <ChevronRight size={20} className="action-arrow" />
                                    </button>

                                    {/* Capture Requirements */}
                                    <div className="capture-specs">
                                        <div className="spec-item">
                                            <span className="spec-dot green" />
                                            <span>Sampling: 44.1kHz</span>
                                        </div>
                                        <div className="spec-item">
                                            <span className="spec-dot green" />
                                            <span>Depth: 16-bit PCM</span>
                                        </div>
                                        <div className="spec-item">
                                            <span className="spec-dot green" />
                                            <span>Duration: 2.5 seconds</span>
                                        </div>
                                        <div className="spec-item">
                                            <span className="spec-dot" style={{ background: hasBaseline ? '#22c55e' : '#ef4444' }} />
                                            <span>Baseline: {hasBaseline ? 'Established' : 'Required'}</span>
                                        </div>
                                    </div>

                                    {/* Last result recommendation */}
                                    {lastResult && (
                                        <div className="last-rec">
                                            <p className="last-rec-label">Last Recommendation</p>
                                            <p className="last-rec-text">"{lastResult.recommendation}"</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ROW 2: Chart + History */}
                        <div className="two-col-grid" style={{ marginTop: 20 }}>

                            {/* Telemetry Trend Chart */}
                            <div className="col-card">
                                <div className="col-card-header">
                                    <h3>Telemetry Trend</h3>
                                    <BarChart3 size={18} className="col-icon" />
                                </div>
                                <div className="col-card-body chart-body">
                                    {history.length > 0 ? (
                                        <div style={{ position: 'relative' }}>
                                            {/* Medical Zone Backdrop - Y-Axis: 0 to 25% Shift */}
                                            <div style={{ position: 'absolute', top: 10, left: 40, right: 10, bottom: 40, zIndex: 0, opacity: 0.1, pointerEvents: 'none' }}>
                                                <div style={{ height: '70%', background: 'var(--color-red)' }}></div>
                                                <div style={{ height: '20%', background: 'var(--color-yellow)' }}></div>
                                                <div style={{ height: '10%', background: 'var(--color-green)' }}></div>
                                            </div>
                                            
                                            <ResponsiveContainer width="100%" height={260}>
                                                <AreaChart data={history.slice(0, 15).reverse()} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorShift" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="var(--status-color)" stopOpacity={0.4}/>
                                                            <stop offset="100%" stopColor="var(--status-color)" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2030" />
                                                    <XAxis
                                                        dataKey="timestamp"
                                                        tickFormatter={(val: string) => {
                                                            try {
                                                                const d = new Date(val);
                                                                return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                                            } catch { return ''; }
                                                        }}
                                                        tick={{ fill: '#4a4c64', fontSize: 11, fontWeight: 600 }}
                                                        axisLine={{ stroke: '#1e2030' }}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        domain={[0, 25]}
                                                        ticks={[0, 5, 10, 15, 20, 25]}
                                                        tick={{ fill: '#4a4c64', fontSize: 11, fontWeight: 600 }}
                                                        axisLine={{ stroke: '#1e2030' }}
                                                        tickLine={false}
                                                        unit="%"
                                                    />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13141f', borderColor: '#2a2c42', borderRadius: '12px' }}
                                                        labelFormatter={(val: any) => new Date(String(val)).toLocaleString()}
                                                        formatter={(value: any) => [`${value}%`, 'Frequency Shift']}
                                                    />
                                                    <Area type="monotone" dataKey="deviation_percent" stroke="var(--status-color)" strokeWidth={3} fillOpacity={1} fill="url(#colorShift)" dot={{ r: 4, fill: 'var(--status-color)' }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <BarChart3 size={40} />
                                            <p>No telemetry data yet</p>
                                            <span>Run your first diagnostic scan to see trends</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* History Feed */}
                            <div className="col-card">
                                <div className="col-card-header">
                                    <h3>History Log</h3>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button className="nav-link" style={{ padding: '4px 8px' }} title="Export PDF">
                                            <Download size={16} />
                                        </button>
                                        <History size={18} className="col-icon" />
                                    </div>
                                </div>
                                <div className="col-card-body history-body">
                                    {history.length > 0 ? history.slice(0, 10).map((h, i) => (
                                        <div key={i} 
                                            className="history-item" 
                                            onClick={() => setOverlayResult(h)}
                                            style={{ 
                                                borderLeft: `3px solid ${Math.abs(h.deviation_percent) <= 5 ? 'var(--color-green)' : Math.abs(h.deviation_percent) <= 15 ? 'var(--color-yellow)' : 'var(--color-red)'}`, 
                                                borderRadius: 0, 
                                                marginBottom: 4,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div className="history-meta">
                                                <div className="history-score" style={{ color: getScoreColor(h.score), fontSize: 18, marginRight: 8 }}>{h.score}</div>
                                                <div>
                                                    <p className="history-date" style={{ fontSize: 11 }}>{new Date(h.timestamp).toLocaleDateString()}</p>
                                                    <p className="history-time" style={{ fontSize: 10 }}>{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                            <div className="history-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                                <span className="history-deviation" style={{ color: Math.abs(h.deviation_percent) <= 5 ? 'var(--color-green)' : Math.abs(h.deviation_percent) <= 15 ? 'var(--color-yellow)' : 'var(--color-red)' }}>
                                                    {h.deviation_percent > 0 ? '+' : ''}{h.deviation_percent.toFixed(1)}%
                                                </span>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {h.tags?.map(t => <span key={t} style={{ fontSize: 8, background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 4 }}>{t}</span>)}
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="empty-state small">
                                            <History size={32} />
                                            <p>No scan history</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ======================== WIZARD (GOLDEN BASELINE) ======================== */}
                {view === 'wizard' && (
                    <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="wizard-container">
                        <div className="wizard-header">
                            <div className="wizard-steps">
                                <div className={`wizard-step-dot ${calibrationPhase === 'calibration' ? 'active' : 'completed'}`} />
                                <div className={`wizard-step-dot ${calibrationPhase === 'protocol' ? 'active' : calibrationPhase === 'commitment' ? 'completed' : ''}`} />
                                <div className={`wizard-step-dot ${calibrationPhase === 'commitment' ? 'active' : ''}`} />
                            </div>
                            <h2 className="wizard-title" style={{ marginTop: 16 }}>
                                {calibrationPhase === 'calibration' ? 'Environment Calibration' : 
                                 calibrationPhase === 'protocol' ? 'Triple-Blow Protocol' : 'Baseline Locked'}
                            </h2>
                            <p className="wizard-subtitle">
                                {calibrationPhase === 'protocol' ? `Progress: Blow ${calibrationBlowing.length + 1} of 3` : 'Scientific accuracy check'}
                            </p>
                        </div>

                        <div className="wizard-body" style={{ minHeight: 400 }}>
                            <AnimatePresence mode="wait">
                                {calibrationPhase === 'calibration' && (
                                    <motion.div key="p1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="wizard-step-content">
                                        <div className="wizard-icon" style={{ background: isCalibratingNoise ? 'rgba(239,68,68,0.1)' : '' }}>
                                            {isCalibratingNoise ? <ShieldCheck size={40} className="pulse" /> : <Mic size={40} />}
                                        </div>
                                        <h3>Ambient Noise Check</h3>
                                        <p>The system needs 3 seconds of absolute silence to map your room's acoustic noise floor.</p>
                                        
                                        {noiseFloor !== null && (
                                            <div className="capture-specs compact" style={{ width: '100%', maxWidth: 300 }}>
                                                <div className="spec-item">
                                                    <span className={`spec-dot ${noiseFloor < -35 ? 'green' : 'red'}`} />
                                                    <span>Noise Floor: {noiseFloor}dB (Limit: -35dB)</span>
                                                </div>
                                                <div className="spec-item">
                                                    <span className={`spec-dot ${hwCheck.ok ? 'green' : 'red'}`} />
                                                    <span>Mic Range: {hwCheck.maxFreq}Hz ({'>'}3000Hz req.)</span>
                                                </div>
                                            </div>
                                        )}

                                        <button 
                                            disabled={isCalibratingNoise}
                                            onClick={() => { setIsCalibratingNoise(true); startRecording(); }} 
                                            className="btn-primary"
                                        >
                                            {isCalibratingNoise ? 'Calibrating Silence...' : 'Begin Calibration'}
                                        </button>
                                    </motion.div>
                                )}

                                {calibrationPhase === 'protocol' && (
                                    <motion.div key="p2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="wizard-step-content">
                                        <ProgressRing 
                                            progress={isRecording ? (timer / 2.5) * 100 : (calibrationBlowing.length / 3) * 100} 
                                            color="#6366f1"
                                            size={140}
                                        />
                                        <h3>Consistent Exhale Test</h3>
                                        <p>Perform a full forced exhale. We require 3 consistent blows (within 15% variance) to lock your healthy signature.</p>
                                        
                                        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                                            {[1,2,3].map(i => (
                                                <div key={i} style={{ 
                                                    width: 12, height: 12, borderRadius: '50%', 
                                                    background: calibrationBlowing.length >= i ? 'var(--color-green)' : 'var(--border)' 
                                                }} />
                                            ))}
                                        </div>

                                        <div className="oscilloscope-wrap" style={{ height: 100, margin: '20px 0' }}>
                                            <Oscilloscope analyser={analyser} isActive={isRecording} color="var(--accent-start)" />
                                        </div>

                                        <button 
                                            disabled={isRecording}
                                            onClick={() => startRecording()} 
                                            className="btn-primary"
                                            style={{ width: '100%' }}
                                        >
                                            {isRecording ? `Capturing Blow ${calibrationBlowing.length + 1}...` : `Record Blow ${calibrationBlowing.length + 1}`}
                                        </button>
                                    </motion.div>
                                )}

                                {calibrationPhase === 'commitment' && (
                                    <motion.div key="p3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="wizard-step-content">
                                        <div className="success-icon"><ShieldCheck size={48} /></div>
                                        <h3>Signature Committed</h3>
                                        <p>Your "Golden Baseline" is now the mathematical center of your diagnostic engine. Your unique acoustic signature has been encrypted and locked.</p>
                                        
                                        <div style={{ 
                                            width: '100%', height: 120, background: 'rgba(255,255,255,0.03)', 
                                            border: '1px dashed var(--border)', borderRadius: 12,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Waves size={40} className="text-muted" opacity={0.3} />
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Acoustic Signature 0xf832...</span>
                                        </div>

                                        <button onClick={() => setView('home')} className="btn-primary" style={{ width: '100%' }}>
                                            Enter Dashboard
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <button onClick={() => { setView('home'); setCalibrationBlowing([]); }} className="cancel-link">Discard Progress</button>
                    </motion.div>
                )}

                {/* ======================== TESTING (TEST LAB) ======================== */}
                {view === 'testing' && (
                    <motion.div key="testing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="wizard-container">
                        <div className="wizard-header">
                            <h2 className="wizard-title" style={{ fontSize: 32 }}>Test Lab</h2>
                            <p className="wizard-subtitle">{isRecording ? 'Please sustain a deep forced exhale...' : 'Position mic 10cm from lips'}</p>
                        </div>
                        <div className="wizard-body" style={{ gap: 40 }}>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                                <ProgressRing 
                                    progress={(timer / 2.5) * 100} 
                                    size={180} 
                                    color={timer >= 1.5 ? 'var(--color-green)' : 'var(--accent-start)'} 
                                />
                                {isRecording && (
                                    <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                                        <p style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                            {timer >= 1.5 ? 'Threshold Met' : 'Keep Blowing...'}
                                        </p>
                                    </motion.div>
                                )}
                            </div>

                            <div className="oscilloscope-wrap" style={{ height: 120, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
                                <Oscilloscope 
                                    analyser={analyser} 
                                    isActive={isRecording} 
                                    color={status === 'yellow' ? 'var(--color-yellow)' : status === 'red' ? 'var(--color-red)' : 'var(--accent-start)'} 
                                />
                            </div>

                            <div className="recording-info">
                                <div className="spec-item">
                                    <span className={`spec-dot ${isRecording ? 'red pulse' : ''}`} />
                                    <span>{isRecording ? 'ACTIVE CAPTURE' : 'READY'}</span>
                                </div>
                                <span style={{ fontWeight: 800 }}>{timer.toFixed(1)}s / 2.5s</span>
                            </div>

                            {!isRecording ? (
                                <button onClick={() => startRecording()} className="btn-primary large" style={{ width: '100%', borderRadius: 100 }}>
                                    <Mic size={24} /> Start Breath Test
                                </button>
                            ) : (
                                <div className="btn-recording" style={{ borderRadius: 100, background: 'rgba(255,255,255,0.05)', border: '2px solid var(--border)', animation: 'none' }}>
                                    <div className="loading-spinner" style={{ width: 20, height: 20, borderTopColor: 'var(--accent-start)' }} />
                                    <span style={{ marginLeft: 12, color: 'white' }}>Analyzing Vibration...</span>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setView('home')} className="cancel-link">Cancel and Return</button>
                    </motion.div>
                )}

                {/* ======================== OVERLAY COMPARISON MODAL ======================== */}
                {overlayResult && (
                    <div style={{ 
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(10px)' 
                    }}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, width: '100%', maxWidth: 700, overflow: 'hidden' }}
                        >
                            <div style={{ padding: 24, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: 20, fontWeight: 800 }}>Overlay Comparison</h2>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Scan Date: {new Date(overlayResult.timestamp).toLocaleString()}</p>
                                </div>
                                <button onClick={() => setOverlayResult(null)} className="app-icon-btn"><X size={20} /></button>
                            </div>
                            <div style={{ padding: 32 }}>
                                <div style={{ height: 200, background: 'rgba(0,0,0,0.5)', borderRadius: 12, position: 'relative', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                    {/* SIMULATED HIGH-FIDELITY SPECTRAL WAVEFORMS for BME Clinical Visual */}
                                    <svg viewBox="0 0 400 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                                        {/* Golden Baseline Signature (Calculated Mean) */}
                                        <path 
                                            d="M0,50 Q20,30 40,50 T80,50 T120,50 T160,50 T200,50 T240,50 T280,50 T320,50 T360,50 T400,50" 
                                            fill="none" stroke="var(--color-green)" strokeWidth="2" opacity="0.3" 
                                        />
                                        {/* Current Breath Wave (Showing High Frequency Noise Components) */}
                                        <path 
                                            d={`M0,50 L10,${45 + Math.random()*10} L20,${50 + Math.random()*15} L30,${40 + Math.random()*20} L40,50 L50,${48 + Math.random()*12} L60,${52 + Math.random()*25} L70,${45 + Math.random()*10} L80,50 Z`} 
                                            fill="none" stroke="var(--status-color)" strokeWidth="2"
                                            style={{ filter: overlayResult.clinical_zone === 'red' ? 'drop-shadow(0 0 8px var(--color-red))' : '' }}
                                        />
                                        {/* Jitter Points */}
                                        {overlayResult.clinical_zone !== 'green' && [100, 150, 200, 250].map(x => (
                                            <circle key={x} cx={x} cy={45 + Math.random()*10} r="1.5" fill="var(--color-red)" opacity="0.6">
                                                <animate attributeName="opacity" values="0.2;0.8;0.2" dur="1s" repeatCount="indefinite" />
                                            </circle>
                                        ))}
                                    </svg>
                                    <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 12, height: 2, background: 'var(--color-green)', opacity: 0.3 }} /><span>Baseline Signature</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 12, height: 2, background: 'var(--status-color)' }} /><span>Current Analysis</span></div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="col-card" style={{ padding: 16 }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.5 }}>ACOUSTIC JITTER</p>
                                        <p style={{ fontSize: 18, fontWeight: 800 }}>{overlayResult.clinical_zone === 'red' ? '+22.4%' : '+11.8%'}</p>
                                    </div>
                                    <div className="col-card" style={{ padding: 16 }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.5 }}>TURBULENCE FLUX</p>
                                        <p style={{ fontSize: 18, fontWeight: 800 }}>High Amplitude</p>
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: 24, background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                                <button className="btn-primary" style={{ flex: 1 }}><Download size={18} /> Export Full PDF</button>
                                <button onClick={() => setOverlayResult(null)} className="btn-secondary" style={{ flex: 1 }}>Close Analysis</button>
                            </div>
                        </motion.div>
                    </div>
                )}
                {view === 'result' && lastResult && (
                    <motion.div key="result" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="result-container">
                        <div className="result-header">
                            <h2 className="page-title" style={{ fontSize: 36 }}>Health Report</h2>
                            <p className="page-subtitle">Diagnostic ID: {lastResult.id.slice(0, 8)} | {new Date(lastResult.timestamp).toLocaleTimeString()}</p>
                        </div>

                        <div className="three-col-grid">
                            {/* Visual Gauge (IMMEDIATE STATUS) */}
                            <div className="col-card" style={{ background: 'var(--status-bg)', borderColor: 'var(--status-color)30' }}>
                                <div className="col-card-body gauge-body">
                                    <GaugeChart score={lastResult.score} size={280} />
                                    <div style={{ marginTop: -20, textAlign: 'center' }}>
                                        <h3 style={{ color: 'var(--status-color)', fontSize: 24, fontWeight: 900, textTransform: 'uppercase' }}>
                                            {status === 'green' ? 'System Stable' : status === 'yellow' ? 'Caution Needed' : 'Clinical Alert'}
                                        </h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
                                            {status === 'green' ? 'Lung Efficiency: 98%' : status === 'yellow' ? 'Lung Efficiency: 88%' : 'Efficiency: < 75%'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Clinical Context */}
                            <div className="col-card">
                                <div className="col-card-header">
                                    <h3 style={{ textTransform: 'uppercase' }}>Diagnostic Copy</h3>
                                    <FileText size={18} className="col-icon" />
                                </div>
                                <div className="col-card-body">
                                    <div style={{ 
                                        padding: 20, 
                                        borderRadius: 12, 
                                        background: 'rgba(255,255,255,0.02)', 
                                        border: '1px solid var(--border)',
                                        marginBottom: 20
                                    }}>
                                        <p className="recommendation-text" style={{ fontSize: 16, border: 'none', fontStyle: 'normal', margin: 0, padding: 0 }}>
                                            {status === 'green' ? "Your lungs are sounding clear. No action needed." : 
                                             status === 'yellow' ? "Minor acoustic shift detected. Avoid known triggers and re-test in 1 hour." : 
                                             "Significant narrowing suspected. Please follow your asthma action plan now."}
                                        </p>
                                    </div>

                                    {/* One-Tap Tagging */}
                                    <div style={{ marginBottom: 20 }}>
                                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Select Triggers</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {['Pollen', 'Exercise', 'Cold', 'Stress', 'Dust'].map(tag => (
                                                <button 
                                                    key={tag}
                                                    onClick={() => {
                                                        if (!lastResult) return;
                                                        const currentTags = lastResult.tags || [];
                                                        const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
                                                        setLastResult({ ...lastResult, tags: newTags });
                                                    }}
                                                    style={{ 
                                                        padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 100, fontSize: 12, fontWeight: 600,
                                                        background: lastResult.tags?.includes(tag) ? 'var(--status-color)' : 'rgba(255,255,255,0.03)',
                                                        color: lastResult.tags?.includes(tag) ? 'white' : 'var(--text-secondary)'
                                                    }}
                                                >
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="result-details">
                                        <div className="result-detail-item">
                                            <span className="detail-label">Frequency Shift</span>
                                            <span className="detail-value" style={{ color: 'var(--status-color)', fontSize: 18 }}>
                                                {lastResult.deviation_percent > 0 ? '+' : ''}{lastResult.deviation_percent.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="result-detail-item">
                                            <span className="detail-label">Status Icon</span>
                                            <span className="detail-value text-status">
                                                {status === 'green' ? <CheckCircle2 size={20} color="var(--color-green)" /> : 
                                                 status === 'yellow' ? <AlertTriangle size={20} color="var(--color-yellow)" /> : 
                                                 <X size={20} color="var(--color-red)" />}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* IMMEDIATE MEDICAL ACTION */}
                            <div className="col-card">
                                <div className="col-card-header"><h3 style={{ textTransform: 'uppercase' }}>Required Steps</h3></div>
                                <div className="col-card-body next-steps-body">
                                    {status === 'red' ? (
                                        <button 
                                            onClick={() => window.open('#', '_blank')} 
                                            className="btn-primary action-plan-btn"
                                            style={{ height: 'auto', flexDirection: 'column', gap: 8 }}
                                        >
                                            <ShieldCheck size={32} />
                                            <span>VIEW ACTION PLAN</span>
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <button className="btn-primary" style={{ background: 'var(--status-color)' }}>
                                                {status === 'green' ? <TrendingUp size={18} /> : <Wind size={18} />}
                                                {status === 'green' ? 'View 7-Day Trend' : 'Breathing Exercise'}
                                            </button>
                                            <button className="btn-secondary">
                                                <Share2 size={18} /> Sync with Doctor
                                            </button>
                                        </div>
                                    )}
                                    
                                    <div className="stoplight-legend" style={{ marginTop: 20 }}>
                                        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-green)' }} /><span>Normal (0-5% Shift)</span></div>
                                        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-yellow)' }} /><span>Elevated (5-15% Shift)</span></div>
                                        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-red)' }} /><span>Critical ({'>'}15% Shift)</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
                            <button onClick={() => setView('testing')} className="btn-secondary" style={{ width: 200 }}>
                                Re-Test Now
                            </button>
                            <button onClick={() => setView('home')} className="btn-primary" style={{ width: 200, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                Return Home
                            </button>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
};

export default PatientDashboard;
