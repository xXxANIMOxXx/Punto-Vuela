import React, { useState, useEffect } from 'react';
import { Trash2, UserSearch, Calendar as CalendarIcon, Power, CalendarDays, Megaphone, Download } from 'lucide-react';
import CalendarComponent from './CalendarComponent';

export default function AdminDashboard({ user }) {
  const [allAppointments, setAllAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceStatus, setServiceStatus] = useState('available');
  const [customMessageActive, setCustomMessageActive] = useState(false);
  const [customMessageText, setCustomMessageText] = useState('');
  const [dniToDelete, setDniToDelete] = useState('');
  const [deleteUserMsg, setDeleteUserMsg] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchServiceStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServiceStatus(data.status);
        setCustomMessageActive(data.customMessageActive);
        setCustomMessageText(data.customMessageText);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminAppointments = async () => {
    try {
      const res = await fetch('/api/admin/appointments', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setAllAppointments(await res.json());
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminAppointments();
    fetchServiceStatus();
  }, []);

  const handleToggleStatus = async () => {
    const newStatus = serviceStatus === 'available' ? 'unavailable' : 'available';
    try {
      const res = await fetch('/api/admin/status', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setServiceStatus(newStatus);
      }
    } catch (err) {
      console.error('Error toggling status', err);
    }
  };

  const handleSaveMessage = async () => {
    try {
      const res = await fetch('/api/admin/message', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify({ active: customMessageActive, text: customMessageText })
      });
      if (res.ok) {
        alert('Mensaje guardado correctamente');
      } else {
        alert('Error al guardar el mensaje');
      }
    } catch (err) {
      console.error('Error saving message', err);
    }
  };

  const handleDeleteById = async (id) => {
    if(!window.confirm('¿Seguro que quieres anular esta cita?')) return;

    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) fetchAdminAppointments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBlock = async (dateStr, timeStr) => {
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ date: dateStr, time: timeStr })
      });

      if (res.ok) {
        fetchAdminAppointments();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportHistory = async () => {
    try {
      const res = await fetch('/api/admin/history/export', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Error al exportar');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'historial_citas.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      alert('Hubo un error al exportar el historial');
      console.error(err);
    }
  };

  const handleDeleteUser = async () => {
    if (!dniToDelete.trim()) return;
    try {
      const res = await fetch(`/api/admin/users/${dniToDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteUserMsg(data.error || 'Error al borrar');
      } else {
        setDeleteUserMsg('Usuario borrado correctamente');
        setDniToDelete('');
        fetchAdminAppointments();
      }
    } catch (err) {
      setDeleteUserMsg('Error de red al borrar');
    }
  };

  // Filtrar las citas que son bloqueos del administrador
  const adminAppointments = allAppointments.filter(app => app.dni === 'admin');

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <div className="mobile-col" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', gap: '24px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--primary)' }}>
            <UserSearch size={28} /> Panel de Administración
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Vista global de todas las citas activas en el sistema. Puedes eliminar las citas de los usuarios si es necesario.
          </p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ 
            padding: '16px', 
            backgroundColor: 'var(--surface)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            minWidth: '300px'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>ESTADO DEL SERVICIO</div>
            <button 
              onClick={handleToggleStatus}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: serviceStatus === 'available' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: serviceStatus === 'available' ? 'var(--success)' : 'var(--danger)',
                transition: 'all 0.2s',
                width: '100%',
                justifyContent: 'center'
              }}
            >
              <Power size={16} />
              {serviceStatus === 'available' ? 'Disponible (Activo)' : 'Cerrado (Inactivo)'}
            </button>
          </div>

          <div style={{ 
            padding: '16px', 
            backgroundColor: 'var(--surface)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '300px'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>GESTIÓN DE USUARIOS</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
               <input 
                 type="text" 
                 className="input-field" 
                 placeholder="DNI a borrar" 
                 value={dniToDelete}
                 onChange={(e) => setDniToDelete(e.target.value)}
                 style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--text-main)' }}
               />
               <button 
                 onClick={handleDeleteUser} 
                 className="btn btn-danger"
                 style={{ padding: '8px 16px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
               >
                 <Trash2 size={16} /> Borrar
               </button>
            </div>
            {deleteUserMsg && <div style={{ fontSize: '0.875rem', textAlign: 'center', color: deleteUserMsg.includes('Error') || deleteUserMsg.includes('No encontrado') || deleteUserMsg.includes('No se puede') ? 'var(--danger)' : 'var(--success)' }}>{deleteUserMsg}</div>}
          </div>
        </div>
      </div>

      <div style={{ 
        padding: '16px', 
        backgroundColor: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '8px',
        marginBottom: '32px'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px' }}>MENSAJE DE AVISO</div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea 
              className="input-field"
              value={customMessageText}
              onChange={(e) => setCustomMessageText(e.target.value)}
              placeholder="Ej: No hacemos Certificados Digitales"
              style={{ width: '100%', resize: 'vertical', minHeight: '60px', fontFamily: 'inherit' }}
            />
            <button 
              onClick={handleSaveMessage}
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: '4px', width: 'max-content' }}
            >
              Guardar Texto
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button 
              onClick={async () => {
                const newState = !customMessageActive;
                setCustomMessageActive(newState);
                try {
                  const res = await fetch('/api/admin/message', {
                    method: 'PUT',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('token')}` 
                    },
                    body: JSON.stringify({ active: newState, text: customMessageText })
                  });
                  if (!res.ok) alert('Error al cambiar el estado del mensaje');
                } catch (err) {
                  console.error(err);
                }
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                height: '100%',
                backgroundColor: customMessageActive ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: customMessageActive ? '#eab308' : 'var(--danger)',
                transition: 'all 0.2s',
                minWidth: '160px'
              }}
            >
              <Megaphone size={24} />
              {customMessageActive ? 'Mostrando' : 'Oculto'}
            </button>
          </div>
        </div>
      </div>

        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--primary)' }}>
            <CalendarDays size={28} /> Bloqueo de Horarios
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Selecciona una fecha y hora para bloquear ese hueco, indicando que el administrador no estará disponible.
          </p>
          
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
             <CalendarComponent 
              appointments={allAppointments} 
              myAppointments={adminAppointments}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onCreate={handleCreateBlock}
              onDelete={handleDeleteById}
            />
          </div>
        </div>

        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--primary)' }}>
               <CalendarIcon size={28} /> Listado de Todas las Citas Activas
            </h2>
            <button 
              onClick={handleExportHistory}
              className="btn"
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer' }}
            >
              <Download size={18} /> Descargar Histórico (CSV)
            </button>
          </div>
          {loading ? (
            <p>Cargando datos del servidor...</p>
          ) : allAppointments.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-muted)' }}>
              <CalendarIcon size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
              <div>No hay ninguna cita registrada en el sistema actualmente.</div>
            </div>
          ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {allAppointments.map(app => (
            <div key={app.id} className="admin-list-item" style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '16px 24px', 
              backgroundColor: 'var(--surface)', 
              borderRadius: '8px', 
              border: '1px solid var(--border)' 
            }}>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  {app.date} a las {app.time}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
                  {app.dni === 'admin' ? (
                    <span>Nombre: Administrador</span>
                  ) : (
                    <>
                      <span>DNI: {app.dni}</span>
                      <span>Nombre: {app.nombre_completo || 'N/A'}</span>
                    </>
                  )}
                  <span>ID Reserva: #{app.id}</span>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteById(app.id)}
                className="btn btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Trash2 size={16} /> Forzar Anulación
              </button>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
