// Farm Phone AI Office — Shared UI Components & Utilities

export const UI_VERSION = '1.0.0';

export interface UITheme {
  colors: {
    darkNavy: string;
    navy800: string;
    navy700: string;
    cyberBlue: string;
    neonCyan: string;
    statusGreen: string;
    warningOrange: string;
    errorRed: string;
  };
}

export const theme: UITheme = {
  colors: {
    darkNavy: '#0a0e1a',
    navy800: '#0f1724',
    navy700: '#1a2332',
    cyberBlue: '#00d4ff',
    neonCyan: '#00f0ff',
    statusGreen: '#00ff88',
    warningOrange: '#ff8c00',
    errorRed: '#ff3366',
  },
};
