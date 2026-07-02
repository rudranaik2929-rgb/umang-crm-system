import React, { createContext, useContext, useMemo } from 'react';
import { Platform, ViewStyle, useWindowDimensions } from 'react-native';

export const SIDEBAR_WIDTH_EXPANDED = 264;
export const SIDEBAR_WIDTH_COLLAPSED = 76;
export const SIDEBAR_WIDTH_MOBILE = 56;
export const NARROW_BREAKPOINT = 900;

type SidebarLayoutValue = {
  collapsed: boolean;
  width: number;
  isNarrow: boolean;
  contentWidth: number;
};

const SidebarLayoutContext = createContext<SidebarLayoutValue>({
  collapsed: false,
  width: SIDEBAR_WIDTH_EXPANDED,
  isNarrow: false,
  contentWidth: 0,
});

export function SidebarLayoutProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < NARROW_BREAKPOINT;
  const value = useMemo(() => {
    const effectiveCollapsed = isNarrow || collapsed;
    const sidebarWidth = isNarrow
      ? SIDEBAR_WIDTH_MOBILE
      : (effectiveCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED);
    return {
      collapsed: effectiveCollapsed,
      width: sidebarWidth,
      isNarrow,
      contentWidth: Math.max(280, windowWidth - sidebarWidth),
    };
  }, [collapsed, isNarrow, windowWidth]);
  return (
    <SidebarLayoutContext.Provider value={value}>
      {children}
    </SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout() {
  return useContext(SidebarLayoutContext);
}

type OverlayStyleOptions = {
  /** Rendered via createPortal on document.body — offset from sidebar edge. */
  portal?: boolean;
};

/** Full-screen overlay in the main content column (never under the sidebar). */
export function useMainContentOverlayStyle(options?: OverlayStyleOptions): ViewStyle {
  const { width } = useSidebarLayout();
  if (Platform.OS !== 'web') {
    return { flex: 1 };
  }
  if (options?.portal) {
    return {
      position: 'fixed' as any,
      top: 0,
      left: width,
      right: 0,
      bottom: 0,
      width: `calc(100vw - ${width}px)` as any,
      height: '100vh' as any,
      zIndex: 9000,
      overflow: 'hidden' as any,
    };
  }
  return {
    position: 'absolute' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 9000,
    overflow: 'hidden' as any,
  };
}
