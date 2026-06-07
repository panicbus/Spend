import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { FirstRunWizard } from './FirstRunWizard';

type OnboardingGateProps = {
  children: React.ReactNode;
};

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [showWizard, setShowWizard] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await api.getPreferences();
        if (cancelled) return;
        if (!prefs.firstRunComplete) {
          // Mark wizard active before any setup steps mutate the database,
          // so returning-data migration cannot close the wizard mid-flow.
          await api.setPreferences({ wizardSeen: true });
          if (!cancelled) setShowWizard(true);
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onWizardComplete = useCallback(() => {
    setShowWizard(false);
  }, []);

  if (!ready) return null;

  return (
    <>
      {children}
      {showWizard ? <FirstRunWizard onComplete={onWizardComplete} /> : null}
    </>
  );
}
