import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const short = Math.min(width, height);
  const level = width < 700 ? 'compact' : width < 1100 ? 'medium' : 'wide';
  const isTablet = short >= 600 || level !== 'compact';
  const isWide = level === 'wide';
  const isMedium = level === 'medium';
  const compactLandscape = width > height && height < 500;
  const pad = compactLandscape ? 10 : isWide ? 24 : isMedium ? 20 : 16;
  const maxContentWidth = level === 'compact' ? 760 : level === 'medium' ? 920 : 1240;
  return { width, height, level, isTablet, isMedium, isWide, compactLandscape, pad, maxContentWidth };
}
