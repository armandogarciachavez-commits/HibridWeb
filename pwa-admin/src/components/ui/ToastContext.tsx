import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {toasts.map((toast) => {
          let bgColor = 'var(--surface)';
          let borderColor = '#333';
          let textColor = 'var(--text)';
          
          if (toast.type === 'success') { borderColor = '#00ff88'; textColor = '#00ff88'; }
          if (toast.type === 'error') { borderColor = 'var(--danger)'; textColor = 'var(--danger)'; }
          if (toast.type === 'warning') { borderColor = '#ffbb00'; textColor = '#ffbb00'; }
          if (toast.type === 'info') { borderColor = 'var(--primary)'; textColor = 'var(--primary)'; }

          return (
            <div key={toast.id} style={{
              background: bgColor,
              border: `1px solid ${borderColor}`,
              color: textColor,
              padding: '12px 20px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              animation: 'slideIn 0.3s ease-out forwards',
              fontSize: '0.9rem',
              fontWeight: 500,
              minWidth: '250px'
            }}>
              {toast.message}
            </div>
          );
        })}
      </div>
      <style>
        {`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}
      </style>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
