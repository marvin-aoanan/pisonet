# Migration Plan: Next.js + TypeScript + MUI

## Overview
Full rewrite of the Management System using modern web technologies while keeping Electron wrapper and all backend functionality.

## Tech Stack
- **Electron** - Desktop app wrapper
- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **MUI (Material-UI)** - Component library
- **Better-SQLite3** - Database (existing)
- **Node.js Backend** - Relay control, shutdown control (existing)

## Project Structure
```
piso-shutdown-listener/
  ├── main.js                    # Electron main process (keep, update to load Next.js)
  ├── preload.js                 # IPC bridge (keep, enhance with types)
  ├── relay-control.js           # Keep as-is
  ├── shutdown-control.js        # Keep as-is
  ├── sync-server-simple.js      # Keep as-is
  ├── package.json               # Update with new dependencies
  │
  ├── renderer/                  # NEW: Next.js app
  │   ├── src/
  │   │   ├── app/
  │   │   │   ├── layout.tsx     # Root layout with MUI theme
  │   │   │   ├── page.tsx       # Dashboard (main view)
  │   │   │   ├── reports/page.tsx
  │   │   │   └── settings/page.tsx
  │   │   ├── components/
  │   │   │   ├── TimerPanel.tsx
  │   │   │   ├── Dashboard.tsx
  │   │   │   ├── RevenueStats.tsx
  │   │   │   └── RelayControls.tsx
  │   │   ├── hooks/
  │   │   │   ├── useTimer.ts
  │   │   │   └── useElectronAPI.ts
  │   │   ├── types/
  │   │   │   └── index.ts
  │   │   └── theme/
  │   │       └── index.ts
  │   ├── public/
  │   ├── next.config.js
  │   ├── tsconfig.json
  │   └── package.json
  │
  └── old/                       # Archive old files
      ├── index.html
      ├── renderer.js
      └── styles.css
```

## Migration Steps

### Phase 1: Setup (Day 1)
- [x] Create Next.js project structure
- [ ] Install dependencies (Next.js, MUI, TypeScript)
- [ ] Configure Electron to load Next.js
- [ ] Set up MUI theme
- [ ] Create TypeScript types

### Phase 2: Core Features (Day 2-3)
- [ ] Timer Panel component
- [ ] Dashboard view
- [ ] Coin insertion simulation
- [ ] Real-time timer updates
- [ ] Revenue tracking

### Phase 3: Advanced Features (Day 4-5)
- [ ] Relay controls
- [ ] Reports page
- [ ] Settings page
- [ ] Network sync integration
- [ ] Authentication

### Phase 4: Polish (Day 6-7)
- [ ] Responsive design
- [ ] Dark/light theme toggle
- [ ] Loading states
- [ ] Error handling
- [ ] Testing

## Key Components to Build

### 1. Dashboard
- Grid of 10 timer panels
- Revenue summary
- System status

### 2. Timer Panel
- PC number
- Countdown display
- Status indicator (active/idle/warning)
- Coin buttons (₱1, ₱5, ₱10)
- Manual controls

### 3. Reports
- Daily revenue
- Usage statistics
- Export functionality

### 4. Settings
- PC configuration
- Network settings
- Admin password

## API Structure (IPC)

### Existing APIs (Keep)
```typescript
interface ElectronAPI {
  simulateCoin: (unitId: number, coinValue: number) => void;
  getTimers: () => Promise<Timer[]>;
  updateTimer: (unitId: number, remainingSeconds: number, totalRevenue: number) => Promise<void>;
  relayOn: (unitId: number) => Promise<{success: boolean}>;
  relayOff: (unitId: number) => Promise<{success: boolean}>;
  shutdownPC: (unitId: number) => Promise<{success: boolean}>;
}
```

## Benefits of New Stack

### Developer Experience
- Hot reload during development
- Better error messages
- TypeScript autocomplete
- Component reusability

### User Experience
- Smoother animations
- Better responsiveness
- Professional UI
- Consistent design

### Maintainability
- Type safety prevents bugs
- Component-based architecture
- Easier to add features
- Better code organization

## Rollback Plan
Old files will be archived in `old/` directory. If issues arise:
1. Stop using new version
2. Revert Electron config to load old index.html
3. Debug and fix issues
4. Continue migration

## Timeline
- **Week 1**: Setup + Core Features
- **Week 2**: Advanced Features + Polish
- **Week 3**: Testing + Deployment
