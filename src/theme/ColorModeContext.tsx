import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import type { ColorMode } from '../../ipc-contract';
import { api } from '../services/api';

type ColorModeContextValue = {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function applyDomTheme(mode: ColorMode) {
  if (mode === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function ColorModeProvider({
  initialMode,
  children,
}: {
  initialMode: ColorMode;
  children: React.ReactNode;
}) {
  const [colorMode, setColorModeState] = useState<ColorMode>(initialMode);

  useLayoutEffect(() => {
    applyDomTheme(colorMode);
  }, [colorMode]);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    applyDomTheme(mode);
    void api.setPreferences({ colorMode: mode });
  }, []);

  const value = useMemo(
    () => ({ colorMode, setColorMode }),
    [colorMode, setColorMode]
  );

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) {
    throw new Error('useColorMode must be used within ColorModeProvider');
  }
  return ctx;
}
