import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const isTablet = short >= 600;
  const isWide = width >= 900;
  const compactLandscape = height < 500;
  const pad = compactLandscape ? 10 : 16;
  return { width, height, isTablet, isWide, compactLandscape, pad };
}
