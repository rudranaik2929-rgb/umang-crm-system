import { useWindowDimensions } from 'react-native';

/** Desktop/laptop layout unchanged at 900px and above. */
export const MOBILE_BREAKPOINT = 900;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const contentPadding = isMobile ? 12 : 24;
  const sectionGap = isMobile ? 12 : 20;

  return {
    width,
    height,
    isMobile,
    contentPadding,
    sectionGap,
  };
}
