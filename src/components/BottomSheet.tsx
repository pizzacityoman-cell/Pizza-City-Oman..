import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * BottomSheet — mobile-first sheet that slides up from the bottom edge.
 * Drag handle supports swipe-to-dismiss (velocity-aware), backdrop
 * tap-to-close, Escape, and safe-area-inset-bottom padding.
 * Desktop keeps its own centered modal — callers choose per breakpoint.
 */
export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const y = useMotionValue(0);
  // Track the drag offset to detect intent (how far the user pulled down)
  const dragProgress = useTransform(y, [0, 240], [0, 1]);
  const progressRef = useRef(dragProgress);
  progressRef.current = dragProgress;

  // Escape-to-close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleDragEnd = (_: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
    const fling = info.velocity.y > 600;
    const pulled = info.offset.y > 120 || progressRef.current.get() > 0.35;
    if (fling || pulled) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[58] bg-black bottom-sheet-backdrop"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title || "Menu sheet"}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            style={{ y }}
            className="bottom-sheet fixed inset-x-0 bottom-0 z-[59] rounded-t-3xl overflow-y-auto"
          >
            {/* Drag handle */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sheet"
              className="bottom-sheet__handle w-full flex justify-center pt-3 pb-1 cursor-pointer"
            >
              <span className="bottom-sheet__handle-bar" aria-hidden="true" />
            </button>
            {title && (
              <h3 className="bottom-sheet__title">{title}</h3>
            )}
            <div className="bottom-sheet__body">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
