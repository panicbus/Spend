import React, { useEffect } from 'react';
/** Inlined so the icon loads in packaged Electron (file://) builds. */
import spendLogoUrl from '../../assets/spend-icon.png?inline';
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
          alt="Spend app icon"
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

        <div className="about-modal__description">
          <p>
            A simple budget tracker that stays out of your way. Import your bank
            data, see where your money's going, and keep your spending in
            check—all from your Mac.
          </p>
          <p>
            No accounts, no subscriptions, no data leaving your machine. Your
            money, your eyes only.
          </p>
          <p>
            Report a bug, send feedback,{' '}
            <a
              className="about-modal__link"
              href="mailto:cedarlanedev@gmail.com?subject=Spend.%20feedback"
            >
              email me
            </a>
            .
          </p>
          <p>
            <a
              className="about-modal__link"
              href="https://ko-fi.com/nicocrisafulli"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy me a coffee!
            </a>
          </p>
        </div>

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
