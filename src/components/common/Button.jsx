import React from 'react';
import './Button.css';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
