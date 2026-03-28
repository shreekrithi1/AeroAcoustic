import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, ArrowRight, User, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import axios from 'axios';

const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('patient');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);
            const res = await axios.post('http://localhost:8000/token', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            setTimeout(() => {
                login(res.data.access_token, res.data.role);
                setIsLoading(false);
            }, 600);
        } catch {
            setIsLoading(false);
            setError('Invalid credentials. Please check your username and password.');
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await axios.post('http://localhost:8000/register', { username, password, name, role });
            setIsRegister(false);
            setUsername('');
            setPassword('');
            setName('');
            setIsLoading(false);
        } catch (err: any) {
            setIsLoading(false);
            setError(err.response?.data?.detail || 'Registration failed. Please try again.');
        }
    };

    const fillDemo = (user: string) => {
        setUsername(user);
        setPassword('password');
        setError(null);
    };

    return (
        <div className="login-page">
            {/* LEFT PANEL - Brand & Testimonial */}
            <div className="login-left">
                <div className="login-left-inner">
                    <div className="brand-header">
                        <div className="brand-logo">
                            <Wind size={28} />
                        </div>
                        <div>
                            <div className="brand-name">AeroLab AI</div>
                            <div className="brand-sub">Acoustic Intelligence Platform</div>
                        </div>
                    </div>

                    <div className="testimonial-block">
                        <p className="testimonial-quote">
                            "AeroLab AI detected early-stage airway narrowing 
                            in our patients <strong>48 hours</strong> before symptoms appeared, 
                            fundamentally changing how we approach preventive respiratory care."
                        </p>
                        <div className="testimonial-author">
                            <div className="author-avatar">EC</div>
                            <div>
                                <div className="author-name">Dr. Elena Chen</div>
                                <div className="author-title">Chief Medical Officer, RespiTech Labs</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL - Login/Register Form */}
            <div className="login-right">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={isRegister ? 'register' : 'login'}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.3 }}
                        className="login-card"
                    >
                        <div className="card-header">
                            <h1 className="card-title">{isRegister ? 'Create your account' : 'Welcome'}</h1>
                            <p className="card-subtitle">
                                {isRegister 
                                    ? 'Set up your clinical registry profile'
                                    : 'Sign in to your AeroLab AI account'}
                            </p>
                        </div>

                        <form onSubmit={isRegister ? handleRegister : handleLogin} className="login-form">
                            {error && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }} 
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="form-error"
                                >
                                    {error}
                                </motion.div>
                            )}

                            {isRegister && (
                                <div className="form-group">
                                    <label className="form-label">Full name</label>
                                    <input
                                        className="form-input"
                                        placeholder="Dr. John Doe"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <input
                                    className="form-input"
                                    placeholder="your-username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <div className="label-row">
                                    <label className="form-label">Password</label>
                                </div>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            {isRegister && (
                                <div className="form-group">
                                    <label className="form-label">Account type</label>
                                    <select
                                        className="form-input form-select"
                                        value={role}
                                        onChange={e => setRole(e.target.value)}
                                    >
                                        <option value="patient">Patient</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className="btn-primary">
                                {isLoading ? (
                                    <span className="btn-spinner" />
                                ) : (
                                    <>
                                        {isRegister ? 'Create Account' : 'Sign In'}
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="form-footer">
                            <span className="footer-text">
                                {isRegister ? 'Already have an account?' : "Don't have an account?"}
                            </span>
                            <button className="footer-link" onClick={() => { setIsRegister(!isRegister); setError(null); }}>
                                {isRegister ? 'Sign in' : 'Create one'}
                            </button>
                        </div>

                        <div className="divider">
                            <span>or sign in as</span>
                        </div>

                        <div className="demo-buttons">
                            <button className="btn-demo" onClick={() => fillDemo('admin')}>
                                <ShieldCheck size={18} />
                                Admin
                            </button>
                            <button className="btn-demo" onClick={() => fillDemo('patient1')}>
                                <User size={18} />
                                Patient
                            </button>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default LoginPage;
