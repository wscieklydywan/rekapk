export function useTapHighlight(onPress?: (...args: any[]) => void) {
  const handlePress = (...args: any[]) => {
    try { onPress?.(...args); } catch (e) { /* ignore */ }
  };
  return { isPressed: false, handlePress };
}

export default useTapHighlight;
