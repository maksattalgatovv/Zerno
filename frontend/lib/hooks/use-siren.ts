"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LOW_HZ = 660;
const HIGH_HZ = 880;
const STEP_MS = 450;
const VIBRATION = [500, 200];

/** A loud two-tone alarm on this device. Browsers only allow it to start from a tap. */
export function useSiren() {
  const [active, setActive] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    void audio.current?.close();
    audio.current = null;
    navigator.vibrate?.(0);
    setActive(false);
  }, []);

  const start = useCallback(() => {
    if (audio.current) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = HIGH_HZ;
    const volume = context.createGain();
    volume.gain.value = 0.25;
    oscillator.connect(volume).connect(context.destination);
    oscillator.start();
    audio.current = context;

    let high = true;
    navigator.vibrate?.(VIBRATION);
    timer.current = window.setInterval(() => {
      high = !high;
      oscillator.frequency.value = high ? HIGH_HZ : LOW_HZ;
      navigator.vibrate?.(VIBRATION);
    }, STEP_MS);
    setActive(true);
  }, []);

  useEffect(() => stop, [stop]);

  return { active, start, stop };
}
