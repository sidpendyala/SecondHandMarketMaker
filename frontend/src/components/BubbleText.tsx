"use client";

interface BubbleTextProps {
  text: string;
  className?: string;
  as?: "span" | "div";
}

/**
 * Bubble text effect (21st.dev thanh style): each character in a soft 3D
 * bubble with subtle hover lift. Use for headings or the home button.
 */
export default function BubbleText({
  text,
  className = "",
  as: Component = "span",
}: BubbleTextProps) {
  return (
    <Component className={`bubble-text ${className}`.trim()}>
      {Array.from(text).map((char, i) => (
        <span key={`${i}-${char}`} className="bubble-char">
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </Component>
  );
}
