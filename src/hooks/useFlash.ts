import { useContext } from 'react';
import { FlashContext } from '../context/FlashContext';

export function useFlash() {
  const value = useContext(FlashContext);
  if (!value) {
    throw new Error('useFlash must be used inside FlashProvider');
  }
  return value;
}
