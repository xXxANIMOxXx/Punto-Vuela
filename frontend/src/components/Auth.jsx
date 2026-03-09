import React, { useState } from 'react';
import { PlaneTakeoff, User, FileText } from 'lucide-react';

export default function Auth({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [dni, setDni] = useState('');
  const [supportNumber, setSupportNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    
    try {
      const res = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dni, support_number: supportNumber })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error de autenticación');
      }

      if (isRegister) {
        // Auto login after register
        const loginRes = await fetch(`http://localhost:3000/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dni, support_number: supportNumber })
        });
        const loginData = await loginRes.json();
        onLogin(loginData.user, loginData.token);
      } else {
        onLogin(data.user, data.token);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="glass-panel auth-card animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <PlaneTakeoff size={48} color="var(--primary)" />
        </div>
        <h1>Punto Vuela Citas</h1>
        <p>Sistema de gestión de citas Guadalinfo</p>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px', fontSize: '0.875rem', padding: '8px', backgroundColor: '#fee2e2', borderRadius: '8px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} /> DNI
            </label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Ej: 12345678A"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} /> Número de Soporte (Contraseña)
            </label>
            <input 
              type="password" 
              className="input-field" 
              placeholder="Número de soporte de tu DNI"
              value={supportNumber}
              onChange={(e) => setSupportNumber(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Cargando...' : (isRegister ? 'Registrarse' : 'Iniciar Sesión')}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {isRegister ? '¿Ya tienes cuenta?' : '¿Es tu primera vez aquí?'}
          <button 
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: '4px', textDecoration: 'underline' }}
          >
            {isRegister ? 'Inicia sesión' : 'Regístrate'}
          </button>
        </div>
      </div>
    </div>
  );
}
