#!/bin/bash

# Setup script for Next.js + TypeScript + MUI in Electron

echo "🚀 Setting up Next.js + TypeScript + MUI for PisoNet Management System"
echo ""

# Create renderer directory for Next.js app
echo "📁 Creating project structure..."
mkdir -p renderer

# Navigate to renderer directory
cd renderer

# Create Next.js app with TypeScript
echo "⚛️  Creating Next.js app..."
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Install MUI dependencies
echo "🎨 Installing Material-UI..."
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material

# Install additional dependencies
echo "📦 Installing additional packages..."
npm install @tanstack/react-query dayjs recharts

# Create necessary directories
echo "📂 Creating directory structure..."
mkdir -p src/components
mkdir -p src/hooks
mkdir -p src/types
mkdir -p src/theme
mkdir -p src/lib

# Create TypeScript types file
cat > src/types/index.ts << 'EOF'
export interface Timer {
  unit_id: number;
  remaining_seconds: number;
  total_revenue: number;
  last_updated: string;
}

export interface Unit {
  id: number;
  name: string;
  status: 'idle' | 'active' | 'warning' | 'disconnected';
  totalSeconds: number;
  revenue: number;
  intervalId: NodeJS.Timeout | null;
  warningShown: boolean;
}

export interface PCConfig {
  ip: string;
  method: 'windows-remote' | 'ssh' | 'local';
  username?: string;
  password?: string;
}

export interface ElectronAPI {
  simulateCoin: (unitId: number, coinValue: number) => void;
  getTimers: () => Promise<Timer[]>;
  updateTimer: (unitId: number, remainingSeconds: number, totalRevenue: number) => Promise<void>;
  relayOn: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  relayOff: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  shutdownPC: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  getRevenueToday: () => Promise<number>;
  getRevenueAll: () => Promise<number>;
  getSessionsToday: () => Promise<number>;
  login: (password: string) => Promise<{ success: boolean }>;
  configurePC: (unitId: number, config: PCConfig) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
EOF

# Create MUI theme file
cat > src/theme/index.ts << 'EOF'
import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00ff00',
      light: '#4cff4c',
      dark: '#00b300',
    },
    secondary: {
      main: '#ff8800',
      light: '#ffaa33',
      dark: '#cc6600',
    },
    error: {
      main: '#ff0000',
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a2e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#888888',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
    },
    h2: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundImage: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        },
      },
    },
  },
});

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#00b300',
    },
    secondary: {
      main: '#ff8800',
    },
  },
});
EOF

# Update Next.js config for Electron
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: '../dist',
  images: {
    unoptimized: true,
  },
  // Disable server-side features for Electron
  trailingSlash: true,
};

export default nextConfig;
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. cd renderer"
echo "2. npm run dev (to test Next.js standalone)"
echo "3. npm run build (to build for Electron)"
echo "4. Update main.js to load from dist/index.html"
echo ""
echo "See MIGRATION_PLAN.md for full migration guide"
