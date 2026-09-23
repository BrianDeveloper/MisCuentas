import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNative } from './links';

export async function hapticSuccess(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.vibrate({ duration: 25 });
  } catch {
    /* no-op en navegador o dispositivos sin soporte */
  }
}

export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* no-op */
  }
}