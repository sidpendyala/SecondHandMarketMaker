"use client";

import { useState, useEffect, useRef } from "react";

const SCRAMBLE_CHARS =
  "!@#$%^&*()_+-=[]{}|;':\",./<>?~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

/**
 * Text scramble effect (motion-primitives style): reveals text by cycling
 * random characters into the target string. Re-runs when `trigger` changes.
 */
export function useTextScramble(
  text: string,
  trigger?: unknown,
  options?: {
    /** Ms between revealing each character (default 35) */
    stepInterval?: number;
    /** Ms between re-scrambling unrevealed chars (default 40) */
    scrambleInterval?: number;
    /** Run on mount when text is set (default true) */
    runOnMount?: boolean;
  }
) {
  const stepInterval = options?.stepInterval ?? 35;
  const scrambleInterval = options?.scrambleInterval ?? 40;
  const runOnMount = options?.runOnMount ?? true;

  const [display, setDisplay] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const revealedRef = useRef(0);
  const triggerRef = useRef(trigger);
  const textRef = useRef(text);

  useEffect(() => {
    if (!text) {
      setDisplay("");
      setIsComplete(true);
      return;
    }

    const run = () => {
      triggerRef.current = trigger;
      textRef.current = text;
      revealedRef.current = 0;
      setIsComplete(false);
      setDisplay(
        Array.from({ length: text.length }, () => randomChar()).join("")
      );
    };

    if (triggerRef.current !== trigger || textRef.current !== text) {
      run();
    } else if (runOnMount && display === "" && text) {
      run();
    }
  }, [text, trigger, runOnMount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!text || display.length !== text.length) return;

    const stepTimer = setInterval(() => {
      revealedRef.current += 1;
      if (revealedRef.current > text.length) {
        clearInterval(stepTimer);
        setDisplay(text);
        setIsComplete(true);
        return;
      }
      setDisplay((prev) => {
        const next = text.slice(0, revealedRef.current);
        const remaining = text.length - revealedRef.current;
        const scrambled = Array.from(
          { length: remaining },
          () => randomChar()
        ).join("");
        return next + scrambled;
      });
    }, stepInterval);

    return () => clearInterval(stepTimer);
  }, [text, display.length, stepInterval]);

  // Keep unrevealed portion cycling through random chars between steps
  useEffect(() => {
    if (!text || isComplete || revealedRef.current >= text.length) return;

    const scrambleTimer = setInterval(() => {
      setDisplay((prev) => {
        if (revealedRef.current >= text.length) return prev;
        const revealed = text.slice(0, revealedRef.current);
        const remaining = text.length - revealedRef.current;
        const scrambled = Array.from(
          { length: remaining },
          () => randomChar()
        ).join("");
        return revealed + scrambled;
      });
    }, scrambleInterval);

    return () => clearInterval(scrambleTimer);
  }, [text, isComplete, scrambleInterval]);

  return { display, isComplete };
}
