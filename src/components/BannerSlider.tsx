import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, ArrowRight, Flame, Shield, Truck } from "lucide-react";
import { HeroBanner } from "../types";
import { getBannerAltText } from "../lib/altText";
import { getMediaUrl } from "../lib/images";

interface BannerSliderProps {
  onOrderNow: () => void;
  banners: HeroBanner[];
  isLoading: boolean;
}

export default function BannerSlider({ onOrderNow, banners, isLoading }: BannerSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for left, 1 for right

  // Touch gesture state for mobile swiping
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);

  // Auto slide effect
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [currentIndex, banners.length]);

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchEndY(null);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null || touchStartY === null || touchEndY === null) return;
    const distanceX = touchStartX - touchEndX;
    const distanceY = touchStartY - touchEndY;
    const minSwipeDistance = 40;

    // Trigger swipe if horizontal displacement exceeds vertical displacement & minimum threshold
    if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
      if (distanceX > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-[260px] bg-neutral-900 rounded-[50px] flex items-center justify-center border border-red-500/10">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-gray-400 animate-pulse">Pre-heating Oven & Loading Banners...</span>
        </div>
      </div>
    );
  }

  if (banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentIndex];

  const handleBannerClick = () => {
    if (!currentBanner.buttonLink) return;
    if (currentBanner.buttonLink === "#menu") {
      onOrderNow();
    } else {
      const el = document.querySelector(currentBanner.buttonLink);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      } else {
        if (currentBanner.buttonLink.startsWith("http")) {
          window.location.href = currentBanner.buttonLink;
        } else {
          onOrderNow();
        }
      }
    }
  };

  // Slide transition variants
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? "100%" : "-100%",
      opacity: 0,
    }),
  };

  const isFullImage = currentBanner?.stylePattern === "fullImage";
  const isModern = currentBanner?.stylePattern === "modern";
  const sliderHeightClass = isFullImage 
    ? "h-[220px] xs:h-[300px] sm:h-[300px] md:h-[400px] lg:h-[480px] xl:h-[550px]"
    : "h-[460px] xs:h-[480px] sm:h-[300px] md:h-[480px] lg:h-[520px] xl:h-[550px]";

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full max-w-7x1 mx-full rounded-[10px] sm:rounded-[0px] md:rounded-[0px] overflow-hidden group shadow-2xl bg-neutral-900 dark:bg-[var(--pc-gray-900)] border border-[#F26522]/15 select-none touch-pan-y"
    >
      
      {/* Slides Area */}
      <div className={`relative ${sliderHeightClass} w-full select-none overflow-hidden transition-all duration-300`}>
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentBanner._id || currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.25 },
            }}
            className="absolute inset-0 w-full h-full"
          >
            {currentBanner.stylePattern === "fullImage" ? (
              <div 
                onClick={handleBannerClick}
                className="absolute inset-0 w-full h-full cursor-pointer overflow-hidden group/fullimage"
                title={currentBanner.title}
              >
                <img
                  src={getMediaUrl(currentBanner.image, 1200) || currentBanner.image}
                  alt={getBannerAltText(currentBanner)}
                  referrerPolicy="no-referrer"
                  fetchPriority={currentIndex === 0 ? "high" : "low"}
                  loading={currentIndex === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="w-full h-full object-cover group-hover/fullimage:scale-[1.015] transition-transform duration-700 ease-out"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
            ) : (
              <>
                {/* Ambient Background Glow Layer */}
                <div className={`absolute inset-0 pointer-events-none ${isModern ? "bg-radial-gradient from-[#F26522]/15 sm:from-[#F26522]/10 to-[var(--pc-gray-900)]" : "bg-radial-gradient from-[#2A0F0A]/40 to-[var(--pc-gray-900)]"}`} />

                {/* If there's an image, render it as background cover with dark overlay */}
                {currentBanner.image && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={getMediaUrl(currentBanner.image, 1200) || currentBanner.image}
                      alt={getBannerAltText(currentBanner)}
                      referrerPolicy="no-referrer"
                      fetchPriority={currentIndex === 0 ? "high" : "low"}
                      loading={currentIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className={`w-full h-full object-cover scale-105 transition-transform duration-[8000ms] ${isModern ? "opacity-60 sm:opacity-50" : "opacity-50 sm:opacity-40"}`}
                      onError={(e) => { e.currentTarget.closest("div.overflow-hidden")?.remove(); }}
                    />
                    <div className={`absolute inset-0 ${isModern ? "bg-gradient-to-t from-[#090302]/90 via-[#090302]/60 to-[#090302]/40 sm:bg-gradient-to-r sm:from-[#090302]/90 sm:via-[#090302]/70 sm:to-transparent" : "bg-gradient-to-r from-[#090302]/95 via-[#090302]/85 to-transparent"}`} />
                  </div>
                )}

                {/* Slider Content Layer */}
                <div className="absolute inset-0 container mx-auto px-5 sm:px-12 md:px-16 flex flex-col justify-center">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
                    
                    {/* Text Content Block (Left column) */}
                    <div className={`lg:col-span-7 flex flex-col justify-center space-y-4 sm:space-y-4 lg:space-y-5 text-left z-10 pt-6 pb-8 md:pt-4 md:pb-6 px-0 ${isModern ? "sm:bg-black/20 sm:backdrop-blur-sm sm:p-6 sm:rounded-2xl sm:border sm:border-white/5" : ""}`}>
                      
                      {/* Category / Badge overlay */}
                      {currentBanner.badge && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="inline-flex self-start items-center gap-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 font-black text-[9px] sm:text-xs uppercase tracking-widest px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full border border-yellow-500/30"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                          {currentBanner.badge}
                        </motion.div>
                      )}

                      {/* Big Promotional Title */}
                      <motion.h1
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="font-Bebas Neue font-bold text-[28px] xs:text-4xl sm:text-4xl md:text-5xl lg:text-[54px] text-white leading-[1.1] tracking-tight"
                      >
                        {/* Recreations style with colored highlights */}
                        {currentBanner.title.split(/(Moments\.|Perfect|Sourdough|BOLD|Difference)/gi).map((part, index) => {
                          const matchWords = ["Moments.", "Perfect", "Sourdough", "BOLD", "Difference"];
                          const isMatch = matchWords.some(w => w.toLowerCase() === part.toLowerCase());
                          return isMatch ? (
                            <span key={index} className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-[var(--pc-amber-400)]">
                              {" "}{part}{" "}
                            </span>
                          ) : part;
                        })}
                      </motion.h1>

                      {/* Subtitle description */}
                      <motion.p
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-orange-100/80 text-sm sm:text-sm md:text-base leading-relaxed max-w-xl font-normal"
                      >
                        {currentBanner.subtitle}
                      </motion.p>

                      {/* App badges & Highlight tags for user Attached flyer style - HIDDEN on small screens */}
                      {currentBanner.stylePattern === "attached" && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="hidden sm:block space-y-4 pt-1"
                        >
                          {/* App download icons */}
                          <div className="flex flex-wrap gap-2.5 items-center">
                            <a
                              href="#"
                              onClick={(e) => e.preventDefault()}
                              className="flex items-center gap-2 px-3.5 py-1.5 bg-black/50 hover:bg-black/80 border border-white/10 rounded-xl text-white transition-colors"
                            >
                              <span className="text-[10px] uppercase font-bold tracking-wider">App Store</span>
                            </a>
                            <a
                              href="#"
                              onClick={(e) => e.preventDefault()}
                              className="flex items-center gap-2 px-3.5 py-1.5 bg-black/50 hover:bg-black/80 border border-white/10 rounded-xl text-white transition-colors"
                            >
                              <span className="text-[10px] uppercase font-bold tracking-wider">Google Play</span>
                            </a>
                          </div>

                          {/* Highlight feature grid */}
                          <div className="grid grid-cols-3 gap-3 border-t border-orange-500/10 pt-4 max-w-lg">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-400 text-xs">
                                🥦
                              </span>
                              <span className="text-[10px] sm:text-xs font-black uppercase text-gray-300 leading-tight">Fresh Ingredients</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 text-xs text-center">
                                🔥
                              </span>
                              <span className="text-[10px] sm:text-xs font-black uppercase text-gray-300 leading-tight">Oven Baked</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-xs">
                                🛵
                              </span>
                              <span className="text-[10px] sm:text-xs font-black uppercase text-gray-300 leading-tight">Fast Delivery</span>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Standard features tags for classic/modern styles - icons on mobile, full labels on desktop */}
                      {currentBanner.stylePattern !== "attached" && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="flex flex-wrap gap-2 sm:gap-4 pt-1"
                        >
                          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-orange-100 font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                            <Flame size={12} className="text-orange-400 animate-pulse sm:size-14" />
                            <span className="hidden xs:inline sm:inline">Oven-Baked Fresh</span>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-orange-100 font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                            <Shield size={12} className="text-amber-400 sm:size-14" />
                            <span className="hidden xs:inline sm:inline">Premium Base</span>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-orange-100 font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                            <Truck size={12} className="text-red-400 sm:size-14" />
                            <span className="hidden xs:inline sm:inline">Fastest Routing</span>
                          </div>
                        </motion.div>
                      )}

                      {/* Call To Action triggers */}
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="pt-2 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
                      >
                        <button
                          onClick={() => {
                            if (currentBanner.buttonLink === "#menu") {
                              onOrderNow();
                            } else {
                              // Standard internal anchor support
                              const el = document.querySelector(currentBanner.buttonLink);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth" });
                              } else {
                                onOrderNow();
                              }
                            }
                          }}
                          className="px-6 py-4 sm:px-8 sm:py-4 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 text-white font-black text-xs sm:text-sm uppercase rounded-full shadow-lg shadow-red-950/20 hover:scale-[1.03] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer relative overflow-hidden group/btn"
                        >
                          <span className="absolute inset-0 bg-white/20 scale-x-0 group-hover/btn:scale-x-100 transition-transform origin-left duration-300" />
                          <span className="relative z-10 flex items-center gap-2">
                            {currentBanner.buttonText || "Order Now"}
                            <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                          </span>
                        </button>
                        
                        {currentBanner.stylePattern === "attached" && (
                          <span className="text-[10px] sm:text-[11px] font-black text-yellow-400 uppercase tracking-widest pt-2 sm:pt-0 sm:border-l sm:border-orange-500/20 sm:pl-4 font-mono">
                            TASTE THE DIFFERENCE!
                          </span>
                        )}
                      </motion.div>

                    </div>

                    {/* Flying Topping Graphic Showcase (Right column) */}
                    <div className="hidden lg:col-span-5 h-full relative items-center justify-center lg:flex">
                      
                      {/* Flying Basils & Tomatoes floating around the main Pizza */}
                      <motion.div
                        animate={{ y: [0, -12, 0], rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-12 left-6 text-3xl pointer-events-none"
                      >
                        🌿
                      </motion.div>
                      <motion.div
                        animate={{ y: [0, -15, 0], rotate: [0, -8, 8, 0] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                        className="absolute bottom-16 right-10 text-2xl pointer-events-none"
                      >
                        🍅
                      </motion.div>
                      <motion.div
                        animate={{ y: [0, -8, 0], scale: [1, 1.05, 0.95, 1] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
                        className="absolute top-1/2 right-4 text-3xl pointer-events-none"
                      >
                        🍃
                      </motion.div>

                      {/* Main Rotating / Hovering Pizza Dish Cutout */}
                      <div className="relative w-72 h-72 xl:w-80 xl:h-80 flex items-center justify-center">
                        
                        {/* Shadow underlay */}
                        <div className="absolute w-64 h-64 bg-red-950/20 blur-3xl rounded-full" />

                        {/* Gourmet Pizza spinning or hovering */}
                        <motion.img
                          animate={{ rotate: 360 }}
                          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                          src="/logo-512.png"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover rounded-full border-4 border-yellow-500/20 shadow-2xl scale-125"
                        />

                        {/* Circular insignia badge */}
                        <div className="absolute -top-4 -left-4 bg-yellow-400 text-black text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border-1 border-[var(--pc-gray-900)] shadow-lg rotate-[-12deg]">
                          🍕 Fresh Out Oven!
                        </div>

                        {/* Elegant Diagonal Calligraphy Banner (decorative — no fixed price claim) */}
                        <div className="absolute -bottom-6 -right-6 px-4 py-2 bg-[var(--pc-red-500)] text-white border-1 border-yellow-500/30 rounded-2xl shadow-xl rotate-[12deg] font-playfair font-black text-xs leading-none text-center">
                          <span className="block text-[8px] tracking-widest text-yellow-300 font-bold uppercase mb-0.5">La Margherita</span>
                          Fresh Out Oven
                        </div>

                      </div>

                    </div>

                  </div>

                  {/* Mobile decorative accent - subtle right-edge visual */}
                  <div className="lg:hidden absolute bottom-0 right-0 w-32 h-32 sm:w-48 sm:h-48 opacity-20 pointer-events-none overflow-hidden">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                      className="absolute -bottom-8 -right-8 w-32 h-32 sm:w-48 sm:h-48 rounded-full border-4 border-yellow-500/20"
                    />
                    <motion.div
                      animate={{ y: [0, -6, 0], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute bottom-6 right-12 text-2xl sm:text-3xl opacity-60"
                    >
                      🍕
                    </motion.div>
                  </div>
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Slide Navigation Buttons (Hidden on mobile view, visible on desktop hover) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            aria-label="Previous banner slide"
            className="hidden sm:flex absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 sm:bg-black/40 hover:bg-black/70 border border-white/10 items-center justify-center text-white cursor-pointer opacity-70 sm:opacity-0 group-hover:opacity-100 transition-all z-20 backdrop-blur-xs ml-0"
          >
            <ChevronLeft size={20} />
          </button>
          
          <button
            onClick={handleNext}
            aria-label="Next banner slide"
            className="hidden sm:flex absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/50 sm:bg-black/40 hover:bg-black/70 border border-white/10 items-center justify-center text-white cursor-pointer opacity-70 sm:opacity-0 group-hover:opacity-100 transition-all z-20 backdrop-blur-xs mr-0"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Slide Indicator Dots (Bottom center navigation) */}
      {banners.length > 1 && (
        <div className="absolute bottom-6 left-12 right-12 flex justify-center gap-2 z-20">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setDirection(index > currentIndex ? 1 : -1);
                setCurrentIndex(index);
              }}
              className={`h-2.5 sm:h-2 rounded-full transition-all cursor-pointer ${
                index === currentIndex 
                  ? "w-8 bg-gradient-to-r from-yellow-400 to-[var(--pc-amber-400)]" 
                  : "w-2.5 sm:w-2 bg-white/30 sm:bg-white/20 hover:bg-white/40"
              }`}
              title={`Go to banner slide ${index + 1}`}
              aria-label={`Go to banner slide ${index + 1}`}
            />
          ))}
        </div>
      )}

    </div>
  );
}
