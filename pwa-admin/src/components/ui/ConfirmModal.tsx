import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar',
  type = 'danger',
  onConfirm, 
  onCancel 
}) => {
  if (!isOpen) return null;

  let btnClass = 'btn';
  if (type === 'danger') btnClass = 'btn border-danger text-danger bg-danger-subtle';
  if (type === 'warning') btnClass = 'btn border-warning text-warning bg-warning-subtle';

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <h3 className="modal-title" style={{ marginBottom: '10px' }}>{title}</h3>
        <p className="text-muted mb-4">{message}</p>
        <div className="d-flex justify-content-center gap-3 mt-4">
          <button className="btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button className={btnClass} onClick={onConfirm} style={type !== 'primary' ? { background: 'transparent' } : {}}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
