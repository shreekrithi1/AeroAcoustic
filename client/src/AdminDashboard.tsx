import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Users, Activity, Search, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  username: string;
  baseline: any;
  history: any[];
}

const AdminDashboard: React.FC = () => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => { fetchPatients(); }, []);

    const fetchPatients = async () => {
        setIsRefreshing(true);
        const token = localStorage.getItem('aa_token');
        try {
            const res = await axios.get('http://localhost:8000/admin/patients', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPatients(res.data);
            setTimeout(() => setIsRefreshing(false), 500);
        } catch (err) { setIsRefreshing(false); }
    };

    const filtered = patients.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.username.toLowerCase().includes(search.toLowerCase())
    );

    const totalScans = patients.reduce((a, b) => a + b.history.length, 0);
    const syncedBaselines = patients.filter(p => p.baseline).length;

    return (
        <div className="dashboard-container">
            
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Admin Dashboard</h1>
                    <p className="page-subtitle">Global respiratory telemetry hub & patient registry</p>
                </div>
                <div className="header-stats">
                    <button onClick={fetchPatients} className="stat-badge clickable">
                        <RefreshCw size={14} className={isRefreshing ? 'spinning' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* 3-Column KPI Row */}
            <div className="three-col-grid">
                {[
                    { icon: <Users size={22} />, label: 'Active Patients', value: patients.length, color: '#6366f1' },
                    { icon: <CheckCircle2 size={22} />, label: 'Synced Baselines', value: syncedBaselines, color: '#06b6d4' },
                    { icon: <Activity size={22} />, label: 'Total Scans', value: totalScans, color: '#10b981' },
                ].map((kpi, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="kpi-card"
                    >
                        <div className="kpi-icon" style={{ color: kpi.color, backgroundColor: kpi.color + '15' }}>{kpi.icon}</div>
                        <div className="kpi-content">
                            <p className="kpi-value">{kpi.value}</p>
                            <p className="kpi-label">{kpi.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Search Bar */}
            <div className="search-bar-wrap">
                <Search size={18} className="search-icon" />
                <input 
                    className="search-input"
                    placeholder="Search patients by name or username..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Patient Registry Table */}
            <div className="table-card">
                <div className="table-header">
                    <h3>Patient Registry</h3>
                    <span className="table-count">{filtered.length} patients</span>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Patient</th>
                                <th>Baseline</th>
                                <th>Avg Score</th>
                                <th>Scans</th>
                                <th>Last Activity</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((patient, i) => {
                                const avgScore = patient.history.length > 0 
                                    ? Math.round(patient.history.reduce((a: any, b: any) => a + b.score, 0) / patient.history.length)
                                    : null;
                                const lastScan = patient.history.length > 0 
                                    ? patient.history[patient.history.length - 1]
                                    : null;

                                return (
                                    <motion.tr 
                                        key={patient.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <td>
                                            <div className="patient-cell">
                                                <div className="patient-avatar">{patient.name[0]}</div>
                                                <div>
                                                    <p className="patient-name">{patient.name}</p>
                                                    <p className="patient-username">{patient.username}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`status-pill ${patient.baseline ? 'active' : 'inactive'}`}>
                                                {patient.baseline ? 'Synced' : 'Missing'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="score-cell" style={{ color: avgScore ? (avgScore > 80 ? '#10b981' : avgScore > 60 ? '#f59e0b' : '#ef4444') : '#4a4c64' }}>
                                                {avgScore !== null ? avgScore : '--'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="scan-count">{patient.history.length}</span>
                                        </td>
                                        <td>
                                            <span className="last-activity">
                                                {lastScan ? new Date(lastScan.timestamp).toLocaleDateString() : 'Never'}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="table-action-btn">
                                                <ExternalLink size={16} />
                                            </button>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
