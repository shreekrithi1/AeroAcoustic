import React, { createContext, useContext, useState, useEffect } from 'react';

type UserRole = 'patient' | 'admin';

interface User {
  id: string;
  username: string;
  role: UserRole;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, role: UserRole) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('aa_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // Mock fetch user profile
      const role = localStorage.getItem('aa_role') as UserRole;
      setUser({ id: token, username: token, role });
    }
    setIsLoading(false);
  }, [token]);

  const login = (newToken: string, role: UserRole) => {
    setToken(newToken);
    localStorage.setItem('aa_token', newToken);
    localStorage.setItem('aa_role', role);
    setUser({ id: newToken, username: newToken, role });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('aa_token');
    localStorage.removeItem('aa_role');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
