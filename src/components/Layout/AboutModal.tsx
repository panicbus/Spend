import React, { useEffect } from 'react';
import spendLogoUrl from '../../../spend-icon-1024.png';
import './AboutModal.css';

const appVersion = import.meta.env.VITE_APP_VERSION ?? '';

type AboutModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="about-modal__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="about-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
      >
        <button
          type="button"
          className="about-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <img
          className="about-modal__logo"
          src={spendLogoUrl}
          alt=""
          width={72}
          height={72}
        />

        <h2 id="about-modal-title" className="about-modal__title">
          <span className="about-modal__title-text">Spend</span>
          <span className="about-modal__title-dot">.</span>
        </h2>

        <p className="about-modal__tagline">Know where it goes.</p>

        {appVersion ? (
          <p className="about-modal__version">v{appVersion}</p>
        ) : null}

        <p className="about-modal__description">
          A personal budget tracker that lives on your Mac. Import from your bank
          or favorite money app, track spending by category, see trends over time,
          and stay on pace — all without an account, a subscription, or your data
          ever leaving your machine.
        </p>

        <hr className="about-modal__divider" />

        <footer className="about-modal__credits">
          <p>Developed with ❤️ by Nico Crisafulli</p>
          <p>alongside Claude AI 🤖</p>
          <p className="about-modal__location">Alameda, CA</p>
          <p>© 2026</p>
        </footer>
      </div>
    </div>
  );
}
