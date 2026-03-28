import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import PatientDashboard from './PatientDashboard';
import AdminDashboard from './AdminDashboard';
import { LogOut, Wind, User, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AppContent: React.FC = () => {
    const { user, logout, isLoading } = useAuth();
    const [mobileMenu, setMobileMenu] = useState(false);

    if (isLoading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (!user) return <LoginPage />;

    return (
        <div className="app-shell">
            {/* Top Navigation Header */}
            <header className="app-header">
                <div className="header-inner">
                    <div className="header-brand">
                        <div className="header-logo">
                            <Wind size={20} />
                        </div>
                        <span className="header-title">AeroLab AI</span>
                        <div className="header-badge">{user.role === 'admin' ? 'Admin' : 'Patient'}</div>
                    </div>

                    <nav className="header-nav">
                        <button className="nav-link active">Dashboard</button>
                        <button className="nav-link">History</button>
                        <button className="nav-link">Settings</button>
                    </nav>

                    <div className="header-actions">
                        <div className="header-user">
                            <div className="user-avatar">
                                <User size={16} />
                            </div>
                            <span className="user-name">{user.username}</span>
                        </div>
                        <button onClick={logout} className="btn-logout">
                            <LogOut size={16} />
                            Sign Out
                        </button>
                        <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}>
                            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenu && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mobile-nav"
                    >
                        <button className="mobile-nav-link active">Dashboard</button>
                        <button className="mobile-nav-link">History</button>
                        <button className="mobile-nav-link">Settings</button>
                        <button onClick={logout} className="mobile-nav-link logout">Sign Out</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="app-main">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={user.role}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                    >
                        {user.role === 'admin' ? <AdminDashboard /> : <PatientDashboard />}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
};

const App: React.FC = () => (
    <AuthProvider>
        <AppContent />
    </AuthProvider>
);

export default App;
