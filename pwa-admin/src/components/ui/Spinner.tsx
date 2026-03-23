import React from 'react';

const Spinner: React.FC<{ size?: string, color?: string }> = ({ size = '24px', color = 'var(--primary)' }) => {
  return (
    <div className="spinner" style={{ width: size, height: size, borderTopColor: color }}></div>
  );
};

export default Spinner;
