export const theme = {
  colors: {
    background: '#0B0C10',       // Deep black/space
    surface: '#12141C',          // Slate gray card background
    surfaceLight: '#1E2230',     // Elevated card background
    primary: '#7C3AED',          // Electric violet
    primaryLight: '#9F67FF',     // Bright violet
    secondary: '#06B6D4',        // Neon cyan
    secondaryLight: '#67E8F9',   // Bright cyan
    accent: '#8B5CF6',           // Royal purple
    success: '#10B981',          // Emerald green
    error: '#EF4444',            // Rose red
    warning: '#F59E0B',          // Amber gold
    textPrimary: '#FFFFFF',      // White
    textSecondary: '#94A3B8',    // Muted slate
    textMuted: '#64748B',        // Muted gray
    border: '#1F2937',           // Dark slate border
    borderFocused: '#7C3AED',    // Violet border focus
    cardShadow: 'rgba(0, 0, 0, 0.5)',
    glowCyan: 'rgba(6, 182, 212, 0.15)',
    glowViolet: 'rgba(124, 58, 237, 0.15)',
  },
  typography: {
    fontFamily: {
      regular: 'System',
      medium: 'System',
      bold: 'System',
    },
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      xxxl: 32,
    },
    weights: {
      regular: '400' as const,
      medium: '500' as const,
      bold: '700' as const,
      heavy: '900' as const,
    },
    lineHeights: {
      xs: 16,
      sm: 20,
      md: 24,
      lg: 28,
      xl: 32,
      xxl: 38,
    }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  roundness: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 2,
    },
    md: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 4.65,
      elevation: 6,
    },
    lg: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 8.3,
      elevation: 10,
    },
    glowCyan: {
      shadowColor: '#06B6D4',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 5,
    },
    glowViolet: {
      shadowColor: '#7C3AED',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 5,
    }
  }
};
