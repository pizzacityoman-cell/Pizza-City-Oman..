import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import mongoose, { Mongoose } from "mongoose";
import fs from "fs";
import dns from "dns";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import {
  buildR2Key,
  isR2Configured,
  normalizeMediaKind,
  optimizeImage,
  uploadToR2,
} from "./src/server/r2.js";

import { getEffectiveBasePrice, getOptimizedUnitPrice, getDefaultSizes } from "./shared/priceUtils.js";
import type { MenuItemSize } from "./shared/priceUtils.js";

dotenv.config();

// Force DNS servers that support SRV lookups (needed for mongodb+srv:// on some Windows networks)
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// Global uncaught exception and unhandled rejection handlers to prevent server crashes
// Uses a size-capped, rotating error log instead of an unbounded append file.
const ERROR_LOG_FILE = "error_log.txt";
const ERROR_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file
const ERROR_LOG_KEEP = 5; // number of rotated backups to retain

function writeRotatingErrorLog(message: string) {
  try {
    if (fs.existsSync(ERROR_LOG_FILE) && fs.statSync(ERROR_LOG_FILE).size > ERROR_LOG_MAX_BYTES) {
      for (let i = ERROR_LOG_KEEP - 1; i >= 1; i--) {
        const from = `${ERROR_LOG_FILE}.${i - 1}`;
        const to = `${ERROR_LOG_FILE}.${i}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
      fs.renameSync(ERROR_LOG_FILE, `${ERROR_LOG_FILE}.0`);
    }
    fs.writeFileSync(ERROR_LOG_FILE, message, { flag: "a" });
  } catch (err) {
    console.error("Failed to write error log:", err);
  }
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("🟢 [Server Process] Unhandled Promise Rejection:", reason);
  writeRotatingErrorLog("Unhandled Rejection: " + (reason instanceof Error ? reason.stack : String(reason)) + "\n");
});
process.on("uncaughtException", (error) => {
  console.error("🟢 [Server Process] Uncaught Exception:", error);
  writeRotatingErrorLog("Uncaught Exception: " + error.stack + "\n");
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const isProduction = process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"],
      imgSrc: ["'self'", "https:", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://wa.me", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
    }
  } : false,
  crossOriginEmbedderPolicy: false // Allows external images to load without issues
}));
app.use(compression());
app.use(cors({
  origin: isProduction
    ? (process.env.ALLOWED_ORIGIN || "https://pizzacityoman.com")
    : true,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Rate limiting for order creation endpoint
const orderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 orders per window
  message: { error: "Too many orders placed from this IP, please try again after 15 minutes." }
});

// Rate limiting for login endpoint (stricter — prevent brute-force)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 attempts per window
  message: { error: "Too many login attempts from this IP, please try again after 15 minutes." }
});

// ==========================================
// DB MODEL DEFINITIONS & DATA LAYER SEEDING
// ==========================================

const SEED_MENU_ITEMS = [
  {
  name: "Sea Food Pizza",
  category: "pizza",
  price: 3.6,
  description: "HOMEMADE PIZZA SAUCE.\nGREEN PEPPER PRAWNS CALAMARI",
  image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1784997532/restaurant_banners/ihtck4pfz24g0xapusku.gif",
  available: true,
  sizes: [
    { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
    { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
    { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
  ],
  },
  {
   name: "Chicken BBQ Pizza",
   category: "pizza",
   price: 3.6,
   description: "RANCH SAUCE MOZZARELLA CHEESE GRILL CHICKEN MUSHROOMS FRESH ONION.BBQ SOUCE",
   image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1784997379/restaurant_banners/cj2hccfpwabeealwgtqg.gif",
   available: true,
   sizes: [
     { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
     { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
     { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
   ],
  },
  {
    name: "Inferno Diavola",
   category: "pizza",
   price: 5,
   description: "Spicy salami, nduja paste, Calabrian chillies & mozzarella.",
   image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1784920590/restaurant_banners/ggqugkucybe9ckt0tub1.jpg",
   available: true,
   sizes: [
     { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
     { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
     { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
   ],
  },
  {
    name: "Garden Primavera",
    category: "pizza",
    price: 2.8,
    description: "Roasted peppers, artichoke, pesto base & ricotta dollops.",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
      { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
      { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
    ],
  },
  {
    name: "Truffle Fungi Lusso",
    category: "pizza",
    price: 4.0,
    description: "Wild mushrooms, black truffle cream & parmesan shavings.",
    image: "https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
      { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
      { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
    ],
  },
  {
    name: "Four Cheese Bianca",
    category: "pizza",
    price: 3.3,
    description: "White garlic cream, mozzarella, gorgonzola, fontina & rosemary.",
    image: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Small", label: 'Small (8")', multiplier: 0.8, inch: 8, slices: 4 },
      { name: "Medium", label: 'Medium (11")', multiplier: 1.0, inch: 11, slices: 6 },
      { name: "Large", label: 'Large (14")', multiplier: 1.35, inch: 14, slices: 8 },
    ],
  },
  {
    name: "Cheesy Garlic Bread",
    category: "sides",
    price: 0.8,
    description: "Toasted baguette with garlic butter, herbs & melted mozzarella.",
    image: "https://images.unsplash.com/photo-1541014741259-de529411b96a?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Crispy Chicken Wings",
    category: "sides",
    price: 1.5,
    description: "6 wings tossed in smoky BBQ or buffalo sauce. Served with ranch.",
    image: "https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Fresh Lemonade",
    category: "drinks",
    price: 0.5,
    description: "Freshly squeezed lemons, mint & a hint of ginger. Chilled.",
    image: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Soft Drinks",
    category: "drinks",
    price: 0.3,
    description: "Pepsi, 7UP, Mirinda or water — chilled & refreshing.",
    image: "https://images.unsplash.com/photo-1543253687-c931c8e01820?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Nutella Dessert Pizza",
    category: "dessert",
    price: 2.0,
    description: "Warm pizza base, Nutella, sliced banana, powdered sugar & strawberry.",
    image: "https://images.unsplash.com/photo-1519915028121-7d3463d5b1ff?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Classic Tiramisu",
    category: "dessert",
    price: 1.2,
    description: "Espresso-soaked ladyfingers layered with mascarpone cream.",
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Classic Tomato Drink",
    category: "drinks",
    price: 1.2,
    description: "Rich tomato-based refresher blended with herbs, spices & a squeeze of lemon. Chilled.",
    image: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?auto=format&fit=crop&w=400&q=80",
    available: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
      { name: "Large", label: "Large", multiplier: 1.2 },
    ],
  },
  {
    name: "Family Feast Combo",
    category: "combo",
    price: 5.500,
    description: "1 Large Pizza of your choice + 6 Chicken Wings + 2 Soft Drinks. Perfect for 3-4 people.",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=400&q=80",
    available: true,
    pinnedFeatured: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
    ],
  },
  {
    name: "Duo Pizza Deal",
    category: "combo",
    price: 6.800,
    description: "Any 2 Large Pizzas + Garlic Bread + 1.5L Drink. Ultimate sharing experience.",
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80",
    available: true,
    pinnedFeatured: true,
    sizes: [
      { name: "Regular", label: "Regular", multiplier: 1.0 },
    ],
  },
];

const SEED_CATEGORIES = [
  {
    name: "Pizzas",
    slug: "pizza",
    description: "48-hour sourdough, oven-baked hot.",
    displayOrder: 1,
    active: true,
    showOnMenu: true,
    seoTitle: "Handcrafted Pizzas | Pizza City Oman",
    seoDescription: "Explore our range of handcrafted sourdough pizzas freshly baked in Oman."
  },
  {
    name: "Combo Deals",
    slug: "combo",
    description: "More food, smarter OMR value for groups.",
    displayOrder: 2,
    active: true,
    showOnMenu: true,
    seoTitle: "Combo Deals & Special Offers | Pizza City Oman",
    seoDescription: "Value-packed meal deals and pizza combos at Pizza City Oman."
  },
  {
    name: "Sides & Appetizers",
    slug: "sides",
    description: "Garlic bread, wings and more to start.",
    displayOrder: 3,
    active: true,
    showOnMenu: true,
    seoTitle: "Savoury Sides & Appetizers | Pizza City Oman",
    seoDescription: "Delicious garlic breads, fries, and appetizers to complete your meal."
  },
  {
    name: "Cold Drinks",
    slug: "drinks",
    description: "Chilled drinks to go with every slice.",
    displayOrder: 4,
    active: true,
    showOnMenu: true,
    seoTitle: "Ice Cold Drinks & Beverages | Pizza City Oman",
    seoDescription: "Refreshing soft drinks and beverages at Pizza City Oman."
  },
  {
    name: "Desserts",
    slug: "dessert",
    description: "Desserts to close the meal right.",
    displayOrder: 5,
    active: true,
    showOnMenu: true,
    seoTitle: "Heavenly Sweet Desserts | Pizza City Oman",
    seoDescription: "Sweet treats and dessert pies to wrap up your meal at Pizza City Oman."
  },
];

// MongoDB is the only data store — there are no in-memory/mock collections.
// (Removed: inMemMenuItems, inMemBanners, inMemPromoCodes, inMemOrders,
// inMemBranches and the dead data-local JSON persistence.)
const SEED_BANNERS = [
  {
   title: "Bold Flavours. Unforgotable Moments.",
   subtitle: "Authentic Arabic & Italian flavours crafted with premium ingredients and passion.",
   badge: "Arabic & Italian Flavour",
   image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1784420420/restaurant_banners/bfuygklmwmdridzknxo9.jpg",
   buttonText: "Order Now",
   buttonLink: "#menu",
   isActive: true,
   stylePattern: "fullImage",
   type: "hero",
  },
  {
    title: "THE ULTIMATE SHARING COMPANION",
    subtitle: "Bake your family gatherings with our customized sizing options. Big flavors, smart savings!",
    badge: "Buy More, Save More",
    image: "https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=80",
    buttonText: "Configure Sizing",
    buttonLink: "#menu",
    isActive: true,
    stylePattern: "classic",
    type: "offer"
  }
];

// NOTE: SEED_* arrays below are seed-only — they populate a fresh MongoDB via
// seedMongoIfEmpty() and are NEVER served directly. All routes require MongoDB:
// public reads return [] in dev / 503 in production when down (see requireDb,
// dbUnavailableInProd); writes/admin/track always return 503 when down.

const SEED_PROMOS = [
  { code: "PIZZA10", discountType: "percentage", discountValue: 10, minOrderAmount: 0, isActive: true },
  { code: "WELCOME50", discountType: "percentage", discountValue: 50, minOrderAmount: 5, isActive: true },
  { code: "OMAN30", discountType: "percentage", discountValue: 30, minOrderAmount: 0, isActive: true },
  { code: "FLAT1OMR", discountType: "flat", discountValue: 1.0, minOrderAmount: 5, isActive: true }
];

// Configuration variables
const SEED_BRANCHES = [
  { name: "Nizwa", phone: "+968 96928714", whatsapp: "+968 96928714", address: "Nizwa 611, Oman.", map: "https://maps.app.goo.gl/y6cnhd1N6XvHcpGR7", geo: "Nizwa", hours: "Daily 10 AM – 1 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1787987586/restaurant_banners/hrutdvdixlp8mmdoalrx.jpg", altText: "Pizza City Nizwa Outlet in Nizwa, Oman." },
  { name: "Samail", phone: "+968 96928716", whatsapp: "+968 96928716", address: "Al Jarda-Saumara Rd, Samail, Ad Dakhiliyah Governorate, Oman", map: "https://maps.app.goo.gl/tBUSRtDM4dDb8NUU6", geo: "Samail", hours: "Daily 11 AM – 1 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788001009/restaurant_banners/ybaxkzas3oyzcr4nluyw.jpg", altText: "Pizza City Samail Outlet." },
  { name: "Sur", phone: "+968 96928717", whatsapp: "+968 96928717", address: "Sur Al Sharqiyah Government, City 411, Oman", map: "https://maps.app.goo.gl/KVc8BGDoQoH9jQ4G6", geo: "Sur", hours: "Daily 11 AM – 1 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788000815/restaurant_banners/ygyetjw6i9lc5wk5rfv7.jpg", altText: "Pizza City Sur Outlet." },
  { name: "Quriyat", phone: "+968 91446573", whatsapp: "+968 91446573", address: "Lake Park, Qurayyat 120, Oman.", map: "https://maps.app.goo.gl/25HD9trNYvp3ZkfG8", geo: "Quriyat", hours: "Daily 11 AM – 1 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788000406/restaurant_banners/qssk5fr1augcyhaimm1y.jpg", altText: "Pizza City Quriyat Outlet in Quriyat, Oman." },
  { name: "Fanja", phone: "+968 96749772", whatsapp: "+968 96749772", address: "opposite Hour Shopping Center, Fanja 623, Oman", map: "https://maps.app.goo.gl/NHzt85nLu6jG8EZn6", geo: "Fanja", hours: "Daily 10 AM – 1 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788000191/restaurant_banners/tzmeuhwpyblukjokj8nl.jpg", altText: "Pizza City Outlet in Fanja, Oman." },
  { name: "Al Khoud", phone: "+968 96928715", whatsapp: "+968 96928715", address: "Al Khoud 6, Muscat, Oman", map: "https://www.google.com/maps/place/Pizza+City+Al+khud+06/@23.5753021,58.179791,17z/data=!3m1!4b1!4m6!3m5!1s0x3e8de30001646f7d:0x8ffc20c1c162ff1e!8m2!3d23.5752972!4d58.1823659!16s%2Fg%2F11nq95z6px?entry=ttu&g_ep=EgoyMDI2MDcwNy4wIKXMDSoASAFQAw%3D%3D", geo: "Al Khoud", hours: "Daily 11 AM – 11 PM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788000844/restaurant_banners/gq0zbhq9633pwes7hvrl.jpg", altText: "Pizza City Al Khoud Outlet in Muscat, Oman." },
  { name: "Ibri", phone: "+968 96928719", whatsapp: "+968 96928719", address: "Ibri, Oman", map: "https://maps.app.goo.gl/RcfYoHZfo1w5BHFu5", geo: "Ibri", hours: "Daily 11 AM – 02 AM", delivery: false, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1787910939/restaurant_banners/fkq4fucarx3k9yfdwd2t.jpg", altText: "Pizza City Ibri Outlet in Ibri, Oman." },
  { name: "Mabela", phone: "+968 96928720", whatsapp: "+968 96928720", address: "Al Maabilaah, Saeeb, Oman", map: "https://maps.app.goo.gl/h7dcRr2ZMrkupj7q8", geo: "Mabela", hours: "Daily 11 AM – 02 AM", delivery: true, isActive: true, image: "https://res.cloudinary.com/dc6pr0lxh/image/upload/v1788090589/restaurant_banners/svno1zdh4qxcodn6grqb.jpg", altText: "Pizza City Mabela Outlet in Saeeb, Oman." },
];

// Configuration variables
const MONGODB_URI = process.env.MONGODB_URI;
let useMongoDB = false;

// Declare Mongoose Models conditionally
const MenuItemSizeSubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  label: { type: String, required: true },
  multiplier: { type: Number, required: true },
  price: { type: Number },
  inch: { type: Number },
  slices: { type: Number },
}, { _id: false });

const BundleGroupSubSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  minSelections: { type: Number, required: true, default: 0 },
  maxSelections: { type: Number, required: true, default: 1 },
  required: { type: Boolean, default: false },
  allowDuplicates: { type: Boolean, default: false },
  optionItemIds: [{ type: String }],
}, { _id: false, id: false });

const BundleConfigSubSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  groups: [BundleGroupSubSchema],
}, { _id: false, id: false });

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  displayOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  showOnMenu: { type: Boolean, default: true },
  seoTitle: { type: String, default: "" },
  seoDescription: { type: String, default: "" },
}, { timestamps: true });

CategorySchema.index({ displayOrder: 1 });

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  categoryId: { type: String, default: "" },
  displayOrder: { type: Number, default: 0 },
  price: { type: Number, required: true },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  altText: { type: String, default: "" },
  available: { type: Boolean, default: true },
  subCategory: { type: String, default: "" },
  badge: { type: String, default: "" },
  featured: { type: Boolean, default: false },
  pinnedFeatured: { type: Boolean, default: false },
  discountPrice: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  sizes: [MenuItemSizeSubSchema],
  bundleConfig: BundleConfigSubSchema,
});

MenuItemSchema.index({ displayOrder: 1 });
MenuItemSchema.index({ categoryId: 1 });
MenuItemSchema.index({ category: 1 });

const PromoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, required: true, enum: ["percentage", "flat"] },
  discountValue: { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

const BundleSelectionItemSubSchema = new mongoose.Schema({
  menuItemId: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
}, { _id: false, id: false });

const BundleSelectionSubSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  groupTitle: { type: String, required: true },
  items: [BundleSelectionItemSubSchema],
}, { _id: false, id: false });

const OrderSchema = new mongoose.Schema({
  items: [
    {
      menuItemId: { type: String, required: true },
      name: { type: String, required: true },
      size: { type: String },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true },
      bundleSelections: [BundleSelectionSubSchema],
    },
  ],
  customer: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    notes: { type: String },
  },
  outlet: { type: String, required: true },
  status: { type: String, default: "pending", enum: ["pending", "preparing", "out-for-delivery", "delivered", "cancelled"] },
  subtotal: { type: Number, required: true },
  discountAmt: { type: Number, default: 0 },
  promoCode: { type: String },
  total: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

OrderSchema.index({ outlet: 1, timestamp: -1 });
OrderSchema.index({ status: 1 });

const MongoCategory = mongoose.model("Category", CategorySchema);
const MongoMenuItem = mongoose.model("MenuItem", MenuItemSchema);
const MongoOrder = mongoose.model("Order", OrderSchema);
const MongoPromoCode = mongoose.model("PromoCode", PromoCodeSchema);

const BannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  badge: { type: String, default: "" },
  image: { type: String, default: "" },
  altText: { type: String, default: "" },
  buttonText: { type: String, default: "Order Now" },
  buttonLink: { type: String, default: "#menu" },
  isActive: { type: Boolean, default: true },
  stylePattern: { type: String, default: "attached" },
  type: { type: String, default: "all" },
});

const MongoBanner = mongoose.model("Banner", BannerSchema);

const BranchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  whatsapp: { type: String, required: true },
  address: { type: String, required: true },
  map: { type: String, default: "" },
  geo: { type: String, default: "" },
  hours: { type: String, default: "Daily 11 AM – 1 AM" },
  delivery: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  image: { type: String, default: "" },
  altText: { type: String, default: "" },
});

const MongoBranch = mongoose.model("Branch", BranchSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["superadmin", "moderator"], default: "moderator" },
  outletAccess: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
});

const MongoUser = mongoose.model("User", UserSchema);

// Establish database connection gracefully
const isUriValid = MONGODB_URI &&
  (MONGODB_URI.startsWith("mongodb://") || MONGODB_URI.startsWith("mongodb+srv://")) &&
  !MONGODB_URI.includes("...") &&
  !MONGODB_URI.includes("MY_MONGODB_URI");

// Bind error handlers on the default connection object BEFORE connect is called to prevent unhandled crashing
mongoose.connection.on("error", (err) => {
  console.error("🟢 [Database Mongoose Error Event]:", err);
  useMongoDB = false;
});

mongoose.connection.on("disconnected", () => {
  console.log("🟢 [Database Mongoose Informative]: Connection disconnected. Waiting for automatic reconnection...");
});

mongoose.connection.on("reconnected", () => {
  console.log("🟢 [Database Mongoose Informative]: Reconnected to MongoDB.");
  useMongoDB = true;
});

async function seedMongoIfEmpty() {
  try {
    const catCount = await MongoCategory.countDocuments();
    if (catCount === 0) {
      await MongoCategory.insertMany(SEED_CATEGORIES);
      console.log("Seeded database with default Pizza City categories.");
    }

    const count = await MongoMenuItem.countDocuments();
    if (count === 0) {
      await MongoMenuItem.insertMany(SEED_MENU_ITEMS);
      console.log("Seeded database with default Pizza City menu items.");
    }

    // Safe Backfill/Migration: ensure all menu items have valid categoryId and displayOrder
    const categories = await MongoCategory.find().lean();
    const catBySlug = new Map<string, any>();
    const catByName = new Map<string, any>();
    categories.forEach((c: any) => {
      if (c.slug) catBySlug.set(c.slug.toLowerCase(), c);
      if (c.name) catByName.set(c.name.toLowerCase(), c);
    });

    const menuItemsToMigrate = await MongoMenuItem.find({
      $or: [
        { categoryId: { $exists: false } },
        { categoryId: "" },
        { categoryId: null },
        { displayOrder: { $exists: false } },
        { displayOrder: null },
      ],
    });

    if (menuItemsToMigrate.length > 0) {
      console.log(`Migrating ${menuItemsToMigrate.length} menu items for categoryId & displayOrder...`);
      for (let i = 0; i < menuItemsToMigrate.length; i++) {
        const item = menuItemsToMigrate[i];
        const rawCat = (item.category || "").toLowerCase().trim();
        let matchedCat = catBySlug.get(rawCat) || catByName.get(rawCat);

        if (!matchedCat && rawCat) {
          const newSlug = rawCat.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
          const newCat = await MongoCategory.create({
            name: rawCat.charAt(0).toUpperCase() + rawCat.slice(1),
            slug: newSlug || `cat-${Date.now()}`,
            description: "",
            displayOrder: categories.length + 1,
            active: true,
            showOnMenu: true,
          });
          matchedCat = newCat;
          catBySlug.set(newCat.slug, newCat);
          catByName.set(newCat.name.toLowerCase(), newCat);
        }

        const updates: any = {};
        if (matchedCat && (!item.categoryId || item.categoryId === "")) {
          updates.categoryId = matchedCat._id.toString();
        }
        if (item.displayOrder === undefined || item.displayOrder === null) {
          updates.displayOrder = i + 1;
        }

        if (Object.keys(updates).length > 0) {
          await MongoMenuItem.updateOne({ _id: item._id }, { $set: updates });
        }
      }
      console.log("Menu items category migration completed successfully.");
    }

    const bannerCount = await MongoBanner.countDocuments();
    if (bannerCount === 0) {
      await MongoBanner.insertMany(SEED_BANNERS);
      console.log("Seeded database with default Pizza City live advertising banners.");
    }

    const promoCount = await MongoPromoCode.countDocuments();
    if (promoCount === 0) {
      await MongoPromoCode.insertMany(SEED_PROMOS);
      console.log("Seeded database with default Pizza City promo codes.");
    }

    const branchCount = await MongoBranch.countDocuments();
    if (branchCount === 0) {
      await MongoBranch.insertMany(SEED_BRANCHES);
      console.log("Seeded database with default Pizza City branches.");
    }

    if ((await MongoUser.countDocuments()) === 0) {
      const superUsername = process.env.ADMIN_USERNAME;
      const superPassword = process.env.ADMIN_PASSWORD;
      if (superUsername && superPassword) {
        const passwordHash = await bcrypt.hash(superPassword, 12);
        await MongoUser.create({
          username: superUsername,
          passwordHash,
          role: "superadmin",
          outletAccess: [],
          isActive: true,
        });
        console.log("Seeded database with default superadmin user.");
      } else {
        console.warn("No ADMIN_USERNAME / ADMIN_PASSWORD env vars; cannot seed superadmin.");
      }
    }
  } catch (seedErr) {
    console.error("Warning: DB Seed operation ran into data constraints:", seedErr);
  }
}

async function connectMongoDBWithRetry() {
  try {
    await mongoose.connect(MONGODB_URI as string, {
      // M0/M2 shared tiers often need >5s after idle (cold start) — 5s turned
      // a slow-but-healthy DB into a 503 that blanked Promo codes/Locations.
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 60000,
      heartbeatFrequencyMS: 10000,
      // 50 connections overwhelms an M0/M2 (~100 max for the whole cluster);
      // 15 is plenty for this traffic and reduces pool contention.
      maxPoolSize: 15,
      minPoolSize: 2,
      tls: true,
      retryWrites: true,
    } as mongoose.ConnectOptions);
    console.log("Connected to MongoDB successfully!");
    useMongoDB = true;

    await seedMongoIfEmpty();
  } catch (err) {
    console.error("MongoDB Connection Failed! Retrying in 10 seconds...", err);
    useMongoDB = false;
    setTimeout(connectMongoDBWithRetry, 10000);
  }
}

if (isUriValid) {
  connectMongoDBWithRetry();
} else {
  console.log("No valid MONGODB_URI set in environmental secrets. Running on robust, active local mock-store.");
  useMongoDB = false;
}

// Canonical outlet aliases for backward compatibility (old names/slugs -> canonical Branch.name).
// All outlet validation and RBAC matching MUST go through normalizeOutletName().
const OUTLET_ALIASES: Record<string, string> = {  "ibri outlet": "Ibri",
  "mabela outlet": "Mabela",
  "alkhoud": "Al Khoud",
  "al khoud": "Al Khoud",
  "al-khoud": "Al Khoud",
  "al khud": "Al Khoud",
  "maabilaah": "Mabela",
  "al maabilaah": "Mabela",
};

// Aliases already warned about this process lifetime (log sampling).
const loggedOutletAliases = new Set<string>();

function normalizeOutletName(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return trimmed;
  const canonical = OUTLET_ALIASES[trimmed.toLowerCase()];
  if (canonical) {
    // Sampled: one log line per unique alias per process (hot path — never log every hit).
    if (!loggedOutletAliases.has(trimmed.toLowerCase())) {
      loggedOutletAliases.add(trimmed.toLowerCase());
      console.warn(`[outlets] alias "${trimmed}" normalized to "${canonical}" — update stored outletAccess/order data.`);
    }
    return canonical;
  }
  return trimmed;
}

function outletEquals(a: unknown, b: unknown): boolean {
  return normalizeOutletName(a).toLowerCase() === normalizeOutletName(b).toLowerCase();
}

// All stored spellings that resolve to the same canonical outlet (for DB queries
// covering pre-normalization documents, e.g. "Ibri Outlet" vs "Ibri").
function outletNameVariants(canonical: string): string[] {
  const norm = normalizeOutletName(canonical);
  const variants = new Set<string>([norm]);
  for (const [alias, target] of Object.entries(OUTLET_ALIASES)) {
    if (target.toLowerCase() === norm.toLowerCase()) {
      variants.add(alias);
    }
  }
  return [...variants];
}

function outletRegexVariants(canonical: string): RegExp[] {
  return outletNameVariants(canonical).map(
    (v) => new RegExp(`^${escapeRegex(v)}$`, "i")
  );
}

// Production safety: never serve mock/in-memory data as if it were real in production.
// When MongoDB is unreachable in production, DB-dependent routes must return 503.
function dbUnavailableInProd(): boolean {
  return process.env.NODE_ENV === "production" && !useMongoDB;
}

// All routes require MongoDB — there are no in-memory/mock fallbacks.
// Writes, admin, auth, and tracking endpoints use this: 503 in every env when down.
const requireDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!useMongoDB) {
    return res.status(503).json({ error: "Database unavailable. Please try again later." });
  }
  next();
};

// Public catalog reads (menu/banners/promos/branches) stay available in dev without
// a database by returning [] (frontends render empty states); in production they
// return 503 like everything else. Returns true when it already responded.
function respondDbDownForRead(res: express.Response): boolean {
  if (useMongoDB) return false;
  if (dbUnavailableInProd()) {
    res.status(503).json({ error: "Database unavailable. Please try again later." });
  } else {
    res.json([]);
  }
  return true;
}

const SHEETS_CONFIG_PATH = path.join(process.cwd(), "sheets-config.json");

interface SheetsConfig {
  webAppUrl: string;
  autoSyncEnabled: boolean;
}

function loadSheetsConfig(): SheetsConfig {
  try {
    if (fs.existsSync(SHEETS_CONFIG_PATH)) {
      const data = fs.readFileSync(SHEETS_CONFIG_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading sheets-config.json:", err);
  }
  return { webAppUrl: "", autoSyncEnabled: false };
}

function saveSheetsConfig(config: SheetsConfig) {
  try {
    fs.writeFileSync(SHEETS_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing sheets-config.json:", err);
  }
}

async function sendToGoogleSheets(payload: any) {
  const config = loadSheetsConfig();
  if (!config.webAppUrl) return;

  try {
    const response = await fetch(config.webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error("Google Sheets Webapp returned non-ok response:", response.status);
    } else {
      const resData = await response.json().catch(() => ({}));
      console.log("Google Sheets Webapp sync result:", resData);
    }
  } catch (err) {
    console.error("Failed to send order to Google Sheets:", err);
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        role: "superadmin" | "moderator";
        outletAccess: string[];
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("CRITICAL: JWT_SECRET environment variable is not set. Server cannot start securely.");
  process.exit(1);
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET + "_refresh");
if (!process.env.JWT_REFRESH_SECRET) {
  if (isProduction) {
    console.error("CRITICAL: JWT_REFRESH_SECRET environment variable is not set. Server cannot start securely in production.");
    process.exit(1);
  }
  console.warn("WARNING: JWT_REFRESH_SECRET is not set. Deriving a dev-only refresh secret from JWT_SECRET. Set a separate JWT_REFRESH_SECRET in production.");
}

function getCookie(req: express.Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(";").reduce((acc, c) => {
    const [k, v] = c.trim().split("=");
    acc[k] = v;
    return acc;
  }, {} as Record<string, string>);
  return cookies[name];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Token Verification Middleware
const verifyToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access Denied. Authorization token required." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

// Superadmin Role Guard Middleware
const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user || req.user.role !== "superadmin") {
    return res.status(403).json({ error: "Access Denied. Superadmin privileges required." });
  }
  next();
};

// Outlet Access Guard Middleware
const checkOutletAccess = (paramKey: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (req.user.role === "superadmin") {
      return next();
    }
    const outlet = req.params[paramKey];
    if (!outlet) {
      return res.status(400).json({ error: "Outlet parameter missing." });
    }
    const hasAccess = req.user.outletAccess.some(
      (accessible) => outletEquals(accessible, outlet)
    );
    if (!hasAccess) {
      return res.status(403).json({ error: `Access Denied. You do not have access to the ${outlet} outlet.` });
    }
    next();
  };
};

// ==========================================
// REST API ROUTES
// ==========================================

// POST /api/auth/login — authenticate user and issue JWT
app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    if (!useMongoDB) {
      // No database connection — never mint mock admin tokens in any environment.
      return res.status(503).json({ error: "Database unavailable. Please try again later." });
    }
    const user = await MongoUser.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid username or password, or user is inactive." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    user.lastLogin = new Date();
    await user.save();

    const payload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role as "superadmin" | "moderator",
      outletAccess: user.outletAccess,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
    const refreshToken = jwt.sign({ userId: user._id.toString() }, JWT_REFRESH_SECRET, { expiresIn: "7d" });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({ token: accessToken, user: payload });
  } catch (err: any) {
    return res.status(500).json({ error: "Server login error: " + err.message });
  }
});

// POST /api/auth/refresh — issue new accessToken using refreshToken cookie
app.post("/api/auth/refresh", requireDb, async (req, res) => {
  const refreshToken = getCookie(req, "refreshToken");
  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required." });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
    const userId = decoded.userId;

    const user = await MongoUser.findById(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid user or inactive." });
    }

    const payload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role as "superadmin" | "moderator",
      outletAccess: user.outletAccess,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
    return res.json({ token: accessToken, user: payload });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired refresh token." });
  }
});

// POST /api/auth/logout — clear the refreshToken cookie
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  return res.json({ success: true });
});

// ==========================================
// USER MANAGEMENT ROUTES (superadmin only)
// ==========================================

// GET /admin/api/users — list all users
app.get("/admin/api/users", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  try {
    const users = await MongoUser.find({}, { passwordHash: 0 }).sort({ username: 1 });
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch users: " + err.message });
  }
});

// POST /admin/api/users — create a new user
app.post("/admin/api/users", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { username, password, role, outletAccess } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password and role are required." });
  }

  try {
    const existingUser = await MongoUser.findOne({ username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await MongoUser.create({
      username,
      passwordHash,
      role,
      outletAccess: outletAccess || [],
      isActive: true,
    });

    const userObj = user.toObject() as any;
    delete userObj.passwordHash;
    return res.json({ success: true, user: userObj });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create user: " + err.message });
  }
});

// PATCH /admin/api/users/:id — update user
app.patch("/admin/api/users/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  const { username, password, role, outletAccess, isActive } = req.body;

  try {
    const user = await MongoUser.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (username) {
      const existingUser = await MongoUser.findOne({
        username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
        _id: { $ne: id }
      });
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists." });
      }
      user.username = username;
    }

    if (password) {
      user.passwordHash = await bcrypt.hash(password, 12);
    }

    if (role) user.role = role;
    if (outletAccess) user.outletAccess = outletAccess;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    const userObj = user.toObject() as any;
    delete userObj.passwordHash;
    return res.json({ success: true, user: userObj });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to update user: " + err.message });
  }
});

// DELETE /admin/api/users/:id — delete user
app.delete("/admin/api/users/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await MongoUser.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    return res.json({ success: true, message: "User deleted successfully." });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete user: " + err.message });
  }
});

// PATCH /admin/api/users/:id/toggle — toggle user active status
app.patch("/admin/api/users/:id/toggle", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await MongoUser.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    user.isActive = !user.isActive;
    await user.save();
    return res.json({ success: true, isActive: user.isActive });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to toggle user status: " + err.message });
  }
});

// Server configuration health check & setup diagnostics (always responds, even when DB is down)
app.get("/api/health", async (req, res) => {
  let activeOutlets: number | undefined;
  try {
    if (useMongoDB) {
      activeOutlets = await MongoBranch.countDocuments({ isActive: true });
    }
  } catch {
    activeOutlets = undefined;
  }
  res.json({
    status: useMongoDB ? "ok" : "degraded",
    database: useMongoDB ? "MongoDB Atlas" : "unavailable",
    active_outlets: activeOutlets,
    seeding: "complete",
  });
});

// GET /api/categories — fetch active categories for the menu
app.get("/api/categories", async (req, res) => {
  if (respondDbDownForRead(res)) return;
  try {
    const categories = await MongoCategory.find({ active: { $ne: false } })
      .sort({ displayOrder: 1, _id: 1 })
      .lean();
    res.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(categories);
  } catch (error: any) {
    return res.status(500).json({ error: "Error retrieving categories: " + error.message });
  }
});

// GET /api/menu — fetch all menu items (filter by category)
app.get("/api/menu", async (req, res) => {
  if (respondDbDownForRead(res)) return;
  const { category, categoryId } = req.query;

  try {
    const query: any = {};
    if (categoryId) {
      query.categoryId = String(categoryId);
    } else if (category) {
      query.$or = [{ category: String(category) }, { categoryId: String(category) }];
    }
    const items = await MongoMenuItem.find(query).sort({ displayOrder: 1, _id: 1 });
    // Dynamic catalog, but changes are admin-driven and infrequent — allow a
    // minute of edge caching with stale-while-revalidate for repeat visits.
    res.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(items);
  } catch (error: any) {
    return res.status(500).json({ error: "Error retrieving menu catalog: " + error.message });
  }
});

// GET /api/promos/list — retrieve active promo codes for customer checkout
app.get("/api/promos/list", async (req, res) => {
  if (respondDbDownForRead(res)) return;
  try {
    const promos = await MongoPromoCode.find({ isActive: true });
    res.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(promos);
  } catch (error: any) {
    return res.status(500).json({ error: "Error retrieving promos: " + error.message });
  }
});

// POST /api/promos/validate — validate and calculate promo code discounts
app.post("/api/promos/validate", requireDb, async (req, res) => {
  const { code, cartTotal } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: "Promo code is blank." });
  }

  try {
    const promo = await MongoPromoCode.findOne({ code: new RegExp(`^${escapeRegex(code.trim())}$`, "i"), isActive: true });

    if (!promo) {
      return res.status(200).json({ success: false, error: "Invalid, expired, or non-existent coupon code." });
    }

    const minAmount = (promo as any).minOrderAmount || 0;
    if (cartTotal < minAmount) {
      return res.status(200).json({
        success: false,
        error: `Cart total must be at least OMR ${minAmount.toFixed(3)} to apply "${(promo as any).code}".`
      });
    }

    return res.json({ success: true, promo });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Validation mistake: " + error.message });
  }
});

// GET /api/banners — fetch all active banners
app.get("/api/banners", async (req, res) => {
  if (respondDbDownForRead(res)) return;
  try {
    const banners = await MongoBanner.find({ isActive: true });
    res.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(banners);
  } catch (error: any) {
    return res.status(500).json({ error: "Error retrieving active banners: " + error.message });
  }
});

// POST /api/orders — place new order, save to DB, trigger pre-filled WhatsApp link URL (with rate limiting)
app.post("/api/orders", orderRateLimiter, requireDb, async (req, res) => {
  const { items, customer, outlet, promoCode } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order must contain at least one pizza or menu item." });
  }
  if (!customer || !customer.name || !customer.phone) {
    return res.status(400).json({ error: "Customer name and active WhatsApp phone number are required." });
  }
  if (!outlet) {
    return res.status(400).json({ error: "Outlet/Branch name is required." });
  }

  try {
    // 1. Look up each item in active DB and recalculate pricing server-side (NEVER trust client price)
    const computedItems: Array<{
      menuItemId: string;
      name: string;
      size?: string;
      price: number;
      quantity: number;
      bundleSelections?: Array<{
        groupId: string;
        groupTitle: string;
        items: Array<{ menuItemId: string; name: string; quantity?: number }>;
      }>;
    }> = [];
    let subtotal = 0;

    // Single batched fetch: collect main menuItemIds and all optionItemIds in bundle selections
    const requestedIds: string[] = [];
    for (const item of items) {
      if (item && item.menuItemId) requestedIds.push(String(item.menuItemId));
      if (item && Array.isArray(item.bundleSelections)) {
        for (const g of item.bundleSelections) {
          if (g && Array.isArray(g.items)) {
            for (const opt of g.items) {
              if (opt && opt.menuItemId) requestedIds.push(String(opt.menuItemId));
            }
          }
        }
      }
    }

    const objectIds = requestedIds
      .filter((id: any) => id && mongoose.Types.ObjectId.isValid(id))
      .map((id: string) => new mongoose.Types.ObjectId(id));
    const stringIds = requestedIds.filter(
      (id: any) => id && !mongoose.Types.ObjectId.isValid(id)
    );
    const orClauses: any[] = [];
    if (objectIds.length) orClauses.push({ _id: { $in: objectIds } });
    if (stringIds.length) orClauses.push({ _id: { $in: stringIds } });
    const menuDocs = orClauses.length
      ? await MongoMenuItem.find({ $or: orClauses }).lean()
      : [];
    const menuById = new Map(
      menuDocs.map((d: any) => [String(d._id), d])
    );

    for (const item of items) {
      const menuItemId = item.menuItemId;
      const quantity = Math.max(1, Number(item.quantity) || 1);

      if (!menuItemId) {
        return res.status(400).json({ error: "Each order item must reference a valid menuItemId." });
      }

      const foundItem: any = menuById.get(String(menuItemId));

      if (!foundItem) {
        return res.status(400).json({ error: `Menu item with ID "${menuItemId}" was not found.` });
      }
      if (foundItem.available === false) {
        return res.status(400).json({ error: `Menu item "${foundItem.name}" is currently unavailable.` });
      }

      const rawPrice = Number(foundItem.price);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
        return res.status(400).json({ error: `Menu item "${foundItem.name}" has an invalid price in the database.` });
      }
      const basePrice = getEffectiveBasePrice(rawPrice, Number(foundItem.discountPrice) || 0);
      const itemSizes = foundItem.sizes || getDefaultSizes(foundItem.category);
      const requestedSize = item.size || itemSizes[0]?.name || "Medium";
      const validSize = itemSizes.find((s: MenuItemSize) => s.name === requestedSize);
      const size = validSize ? validSize.name : itemSizes[0]?.name || "Medium";
      const unitPrice = getOptimizedUnitPrice(basePrice, size, itemSizes, quantity);
      if (!Number.isFinite(unitPrice)) {
        return res.status(400).json({ error: `Could not compute a valid price for "${foundItem.name}".` });
      }
      const lineTotal = Number((unitPrice * quantity).toFixed(3));
      subtotal += lineTotal;

      // Bundle validation if menu item has bundle mode enabled
      let validatedBundleSelections: Array<{
        groupId: string;
        groupTitle: string;
        items: Array<{ menuItemId: string; name: string; quantity?: number }>;
      }> | undefined = undefined;

      if (foundItem.bundleConfig?.enabled && Array.isArray(foundItem.bundleConfig.groups) && foundItem.bundleConfig.groups.length > 0) {
        const submittedSelections: any[] = Array.isArray(item.bundleSelections) ? item.bundleSelections : [];
        const selectionMap = new Map(submittedSelections.map((s: any) => [String(s.groupId), s]));

        // Reject unknown groups
        const knownGroupIds = new Set(foundItem.bundleConfig.groups.map((g: any) => String(g.id)));
        for (const s of submittedSelections) {
          if (!knownGroupIds.has(String(s.groupId))) {
            return res.status(400).json({ error: `Unknown bundle group "${s.groupId}" submitted for "${foundItem.name}".` });
          }
        }

        const cleanSelections: Array<{
          groupId: string;
          groupTitle: string;
          items: Array<{ menuItemId: string; name: string; quantity?: number }>;
        }> = [];

        for (const group of foundItem.bundleConfig.groups) {
          const sel = selectionMap.get(String(group.id));
          const selItems: any[] = (sel && Array.isArray(sel.items)) ? sel.items : [];

          // Total selection count in this group
          const totalSelectedCount = selItems.reduce((acc: number, it: any) => acc + Math.max(1, Number(it.quantity) || 1), 0);

          // Enforce required
          if (group.required && totalSelectedCount < (group.minSelections || 1)) {
            return res.status(400).json({
              error: `Selection group "${group.title}" is required. Please select at least ${group.minSelections || 1} item(s).`,
            });
          }

          // Enforce min selections
          if (totalSelectedCount > 0 && totalSelectedCount < (group.minSelections || 0)) {
            return res.status(400).json({
              error: `Selection group "${group.title}" requires a minimum of ${group.minSelections} item(s).`,
            });
          }

          // Enforce max selections
          if (totalSelectedCount > group.maxSelections) {
            return res.status(400).json({
              error: `Selection group "${group.title}" allows a maximum of ${group.maxSelections} item(s). You selected ${totalSelectedCount}.`,
            });
          }

          // Enforce duplicates
          if (!group.allowDuplicates) {
            const seenOptionIds = new Set<string>();
            for (const it of selItems) {
              const optId = String(it.menuItemId);
              if (seenOptionIds.has(optId) || (Number(it.quantity) || 1) > 1) {
                return res.status(400).json({
                  error: `Duplicate selections are not allowed for "${group.title}".`,
                });
              }
              seenOptionIds.add(optId);
            }
          }

          // Validate options against group.optionItemIds and database availability
          const allowedOptionIds = new Set((group.optionItemIds || []).map((id: any) => String(id)));
          const validatedItems: Array<{ menuItemId: string; name: string; quantity?: number }> = [];

          for (const it of selItems) {
            const optId = String(it.menuItemId);
            if (!allowedOptionIds.has(optId)) {
              return res.status(400).json({
                error: `Option "${it.name || optId}" is not allowed in group "${group.title}".`,
              });
            }

            const optionDoc: any = menuById.get(optId);
            if (!optionDoc) {
              return res.status(400).json({
                error: `Option item with ID "${optId}" was not found.`,
              });
            }
            if (optionDoc.available === false) {
              return res.status(400).json({
                error: `Selected option "${optionDoc.name}" is currently unavailable.`,
              });
            }

            validatedItems.push({
              menuItemId: optId,
              name: optionDoc.name,
              quantity: Math.max(1, Number(it.quantity) || 1),
            });
          }

          if (validatedItems.length > 0) {
            cleanSelections.push({
              groupId: group.id,
              groupTitle: group.title,
              items: validatedItems,
            });
          }
        }

        validatedBundleSelections = cleanSelections;
      }

      const hasMultipleSizes = itemSizes.length > 1;
      computedItems.push({
        menuItemId,
        name: hasMultipleSizes ? `${foundItem.name} [Size: ${size}]` : foundItem.name,
        size: hasMultipleSizes ? size : undefined,
        price: unitPrice,
        quantity,
        bundleSelections: validatedBundleSelections,
      });
    }

    subtotal = Number(subtotal.toFixed(3));

    // Validate computed items have valid prices before saving
    const invalidItem = computedItems.find(i => !Number.isFinite(i.price) || i.price <= 0);
    if (invalidItem) {
      return res.status(400).json({ error: `Invalid price computed for "${invalidItem.name}". Please contact support.` });
    }

    // 2. Recompute promo code discount server-side if provided
    let discountAmt = 0;
    let appliedCode: string | undefined;

    if (promoCode && typeof promoCode === "string" && promoCode.trim()) {
      const cleanCode = promoCode.trim().toUpperCase();
      const promo: any = await MongoPromoCode.findOne({ code: new RegExp(`^${escapeRegex(cleanCode)}$`, "i"), isActive: true });

      if (!promo) {
        return res.status(400).json({ error: `Promo code "${cleanCode}" is invalid or expired.` });
      }

      const minAmount = promo.minOrderAmount || 0;
      if (subtotal < minAmount) {
        return res.status(400).json({
          error: `Subtotal must be at least OMR ${minAmount.toFixed(3)} to use promo code "${cleanCode}".`
        });
      }

      appliedCode = promo.code;
      if (promo.discountType === "percentage") {
        discountAmt = Number((subtotal * (promo.discountValue / 100)).toFixed(3));
      } else {
        discountAmt = Math.min(Number(promo.discountValue), subtotal);
      }
      discountAmt = Number(discountAmt.toFixed(3));
    }

    const total = Math.max(0, Number((subtotal - discountAmt).toFixed(3)));

    let targetPhone = "";
    const requestedOutlet = normalizeOutletName(outlet);
    let foundBranchName = requestedOutlet;

    // Look up branch in MongoDB to get WhatsApp/Phone number.
    // Phone is ALWAYS sourced from the branch record — never a static map.
    const dbBranch = await MongoBranch.findOne({ name: { $regex: new RegExp(`^${escapeRegex(requestedOutlet)}$`, "i") } });
    if (dbBranch) {
      targetPhone = dbBranch.whatsapp || dbBranch.phone;
      foundBranchName = dbBranch.name;
    }

    if (!targetPhone) {
      return res.status(400).json({ error: `Valid branch is required. Could not find active branch matching "${outlet}".` });
    }

    const newOrder = new MongoOrder({
      items: computedItems,
      customer,
      outlet: foundBranchName,
      subtotal,
      discountAmt,
      promoCode: appliedCode,
      total,
      status: "pending",
      timestamp: new Date(),
    });
    const savedOrder: any = await newOrder.save();

    // Build the WhatsApp message trigger block per outlet
    const cleanPhone = targetPhone.replace(/\s+/g, "").replace("+", "");
    const itemsText = computedItems
      .map((i) => {
        let line = `• ${i.quantity}x ${i.name} (OMR ${i.price.toFixed(3)})`;
        if (i.bundleSelections && i.bundleSelections.length > 0) {
          for (const grp of i.bundleSelections) {
            line += `\n  ${grp.groupTitle}:`;
            for (const item of grp.items) {
              const qtyStr = (item.quantity && item.quantity > 1) ? `${item.quantity}x ` : "";
              line += `\n  • ${qtyStr}${item.name}`;
            }
          }
        }
        return line;
      })
      .join("\n");

    const messageTemplate =
      `Hi Pizza City ${foundBranchName}! 🍕\n\n` +
      `New Web Order Placed (ID: ${savedOrder._id.toString().slice(-6)})\n` +
      `-----------------------------\n` +
      `${itemsText}\n` +
      `-----------------------------\n` +
      (appliedCode ? `💰 Subtotal: OMR ${subtotal.toFixed(3)}\n🎟️ Promo Applied: ${appliedCode} (-OMR ${discountAmt.toFixed(3)})\n` : "") +
      `💰 Total: OMR ${total.toFixed(3)}\n\n` +
      `👤 Customer Name: ${customer.name}\n` +
      `📞 Phone Number: ${customer.phone}\n` +
      (customer.email ? `📧 Email: ${customer.email}\n` : "") +
      (customer.notes ? `📝 Special Notes: ${customer.notes}\n` : "") +
      `\n` +
      `Please confirm receipt and start preparing my perfect slice! Thank you.`;

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageTemplate)}`;

    // Optional Google Sheets automatic sync trigger
    const config = loadSheetsConfig();
    if (config.webAppUrl && config.autoSyncEnabled) {
      const orderPayload = {
        orderId: savedOrder._id.toString(),
        timestamp: new Date(savedOrder.timestamp).toISOString(),
        outlet: savedOrder.outlet,
        customerName: savedOrder.customer.name,
        phone: savedOrder.customer.phone,
        email: savedOrder.customer.email || "",
        items: computedItems.map(i => {
          let str = `${i.quantity}x ${i.name}`;
          if (i.bundleSelections && i.bundleSelections.length > 0) {
            const details = i.bundleSelections.map(g => `${g.groupTitle}: ${g.items.map(it => ((it.quantity && it.quantity > 1) ? `${it.quantity}x ` : "") + it.name).join(", ")}`);
            str += ` (${details.join("; ")})`;
          }
          return str;
        }).join(", "),
        total: savedOrder.total,
        status: savedOrder.status,
        notes: savedOrder.customer.notes || ""
      };
      sendToGoogleSheets(orderPayload).catch(err => console.error("Sheets sync error:", err));
    }

    return res.status(201).json({
      success: true,
      order: savedOrder,
      whatsappUrl,
      targetPhone,
    });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to place order: " + error.message });
  }
});

// GET /api/orders/track/:id — Public order tracker status endpoint
app.get("/api/orders/track/:id", requireDb, async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Order reference number or ID is required" });
  }
  const cleanId = id.trim();
  if (!cleanId) {
    return res.status(400).json({ error: "Order reference number or ID is required" });
  }

  try {
    let order: any;
    // 1) Full ObjectId lookup — only if valid 24-hex ObjectId
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      try {
        order = await MongoOrder.findById(cleanId);
      } catch {
        // ignore CastError, will try suffix search below
      }
    }

    // 2) Suffix search for 6-char codes — case-insensitive, most-recent first
    //    Previous logic did findOne({_id: id}) BEFORE suffix check, which throws
    //    CastError for 6-char strings and prevents suffix search from ever running.
    //    Also limited to last 100 orders and was case-sensitive + returned oldest match on collision.
    if (!order && cleanId.length === 6) {
      const normalized = cleanId.toLowerCase();
      try {
        // Efficient DB-side suffix match using $regexMatch on stringified _id
        // Sort by timestamp desc to return most recent order if suffix collides
        order = await MongoOrder.findOne({
          $expr: {
            $regexMatch: {
              input: { $toString: "$_id" },
              regex: normalized + "$",
              options: "i",
            },
          },
        }).sort({ timestamp: -1 } as any);
      } catch {
        // Fallback if $regexMatch/$toString not supported by Mongo version
      }
      if (!order) {
        // Fallback scan — 500 recent orders, case-insensitive, most recent wins
        const recentOrders = await MongoOrder.find().sort({ timestamp: -1 }).limit(500);
        order = recentOrders.find((o) => o._id.toString().slice(-6).toLowerCase() === normalized);
      }
    }

    if (!order) {
      return res.status(404).json({ error: "Order not found. Please verify your reference ID." });
    }

    return res.json({
      success: true,
      order: {
        _id: order._id,
        items: order.items,
        customer: {
          name: order.customer.name,
        },
        outlet: order.outlet,
        status: order.status,
        total: order.total,
        timestamp: order.timestamp,
      }
    });
  } catch (error: any) {
    console.error("Order tracking error:", error);
    return res.status(500).json({ error: "Failed to track order: " + error.message });
  }
});

// ==========================================
// GOOGLE SHEETS SYNC ENDPOINTS
// ==========================================

app.get("/api/sheets/config", verifyToken, requireSuperAdmin, (req, res) => {
  const config = loadSheetsConfig();
  return res.json(config);
});

app.post("/api/sheets/config", verifyToken, requireSuperAdmin, (req, res) => {
  const { webAppUrl, autoSyncEnabled } = req.body;

  if (webAppUrl !== undefined && typeof webAppUrl !== "string") {
    return res.status(400).json({ error: "webAppUrl must be a string." });
  }
  if (autoSyncEnabled !== undefined && typeof autoSyncEnabled !== "boolean") {
    return res.status(400).json({ error: "autoSyncEnabled must be a boolean." });
  }

  const current = loadSheetsConfig();
  const updated = {
    webAppUrl: webAppUrl !== undefined ? webAppUrl.trim() : current.webAppUrl,
    autoSyncEnabled: autoSyncEnabled !== undefined ? autoSyncEnabled : current.autoSyncEnabled,
  };

  saveSheetsConfig(updated);
  return res.json({ success: true, config: updated });
});

app.post("/api/sheets/sync-all", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const config = loadSheetsConfig();
  if (!config.webAppUrl) {
    return res.status(400).json({ error: "Google Sheets Web App URL is not configured." });
  }

  try {
    const allOrders: any[] = await MongoOrder.find({}).sort({ timestamp: -1 });

    if (allOrders.length === 0) {
      return res.json({ success: true, message: "No orders found to sync.", count: 0 });
    }

    const payloadOrders = allOrders.map((o: any) => ({
      orderId: o._id.toString(),
      timestamp: new Date(o.timestamp).toISOString(),
      outlet: o.outlet,
      customerName: o.customer.name,
      phone: o.customer.phone,
      email: o.customer.email || "",
      items: o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", "),
      total: o.total,
      status: o.status,
      notes: o.customer.notes || ""
    }));

    const response = await fetch(config.webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orders: payloadOrders }),
    });

    if (!response.ok) {
      throw new Error(`Google Sheets Webapp returned Response Code ${response.status}`);
    }

    const result = await response.json();
    return res.json({ success: true, result });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to perform bulk sync: " + error.message });
  }
});

// GET /api/orders/:outletId/summary — fetch operational counts and revenue totals (Requires basic auth)
app.get("/api/orders/:outletId/summary", verifyToken, checkOutletAccess("outletId"), requireDb, async (req, res) => {
  const { outletId } = req.params;

  try {
    const match =
      normalizeOutletName(outletId).toLowerCase() === "all"
        ? {}
        : { outlet: { $in: outletRegexVariants(outletId) } };

    // Single aggregation (was: load every order into Node and reduce in JS).
    const [result] = await MongoOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: {
            $sum: { $ifNull: ["$total", { $ifNull: ["$totalAmount", 0] }] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          preparing: {
            $sum: { $cond: [{ $eq: ["$status", "preparing"] }, 1, 0] },
          },
          outForDelivery: {
            $sum: { $cond: [{ $eq: ["$status", "out-for-delivery"] }, 1, 0] },
          },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
    ]);

    const totals = {
      totalOrders: result?.totalOrders ?? 0,
      totalRevenue: result?.totalRevenue ?? 0,
    };
    const breakdown = [
      { _id: "pending", count: result?.pending ?? 0 },
      { _id: "preparing", count: result?.preparing ?? 0 },
      { _id: "out-for-delivery", count: result?.outForDelivery ?? 0 },
      { _id: "delivered", count: result?.delivered ?? 0 },
      { _id: "cancelled", count: result?.cancelled ?? 0 },
    ];

    return res.json({ totals, breakdown });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to generate dynamic summary: " + error.message });
  }
});

// R2 media uploads: memory buffer -> sharp WebP optimize -> Cloudflare R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB input cap (output WebP is ~80-150KB)
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, WebP, and GIF images are allowed."));
  },
});

// POST /admin/api/upload — optimize to WebP + upload to Cloudflare R2 (Requires JWT auth)
// Query: ?type=banner|menu|branch|misc (defaults to misc -> 800px; banner -> 1920px)
app.post(
  "/admin/api/upload",
  verifyToken,
  requireSuperAdmin,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        return res.status(400).json({ error: "Upload failed: " + err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "No file uploaded." });
      }
      if (!isR2Configured()) {
        return res.status(503).json({
          error:
            "Media storage is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL in .env.",
        });
      }

      const kind = normalizeMediaKind((req.query as any)?.type);
      const optimized = await optimizeImage(req.file.buffer, kind);
      const key = buildR2Key(kind, (req.file as any).originalname);
      const url = await uploadToR2(optimized, key);

      return res.json({ success: true, url });
    } catch (error: any) {
      console.error("Upload error:", error);
      return res.status(500).json({ error: "Failed to upload image: " + error.message });
    }
  }
);

// GET /admin/api/promos — fetch all promo codes (Requires basic auth)
app.get("/admin/api/promos", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  try {
    const promos = await MongoPromoCode.find({});
    return res.json(promos);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch promo codes: " + error.message });
  }
});

// POST /admin/api/promos — add a new promo code (Requires basic auth)
app.post("/admin/api/promos", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { code, discountType, discountValue, minOrderAmount, isActive } = req.body;

  if (!code || !discountType || discountValue === undefined) {
    return res.status(400).json({ error: "Promo code properties are incomplete." });
  }

  try {
    const uppercaseCode = code.trim().toUpperCase();
    const existing = await MongoPromoCode.findOne({ code: uppercaseCode });
    if (existing) {
      return res.status(400).json({ error: "Promo code with this code already exists." });
    }

    const newPromo = new MongoPromoCode({
      code: uppercaseCode,
      discountType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount) || 0,
      isActive: isActive !== false
    });
    await newPromo.save();
    return res.json(newPromo);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to add promo: " + error.message });
  }
});

// PATCH /admin/api/promos/:id — update or toggle promo code (Requires basic auth)
app.patch("/admin/api/promos/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  const allowedPromoFields = ["code", "discountType", "discountValue", "minOrderAmount", "isActive"];
  const updates: Record<string, any> = {};
  for (const key of allowedPromoFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }
  if (updates.discountValue !== undefined) {
    const parsed = Number(updates.discountValue);
    if (!isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: "discountValue must be a non-negative number." });
    }
    updates.discountValue = parsed;
  }
  if (updates.minOrderAmount !== undefined) {
    const parsed = Number(updates.minOrderAmount);
    if (!isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: "minOrderAmount must be a non-negative number." });
    }
    updates.minOrderAmount = parsed;
  }

  try {
    const updatedPromo = await MongoPromoCode.findByIdAndUpdate(id, updates, { returnDocument: "after" });
    if (!updatedPromo) {
      return res.status(404).json({ error: "Promo not found." });
    }
    return res.json(updatedPromo);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update promo: " + error.message });
  }
});

// DELETE /admin/api/promos/:id — delete promo code (Requires basic auth)
app.delete("/admin/api/promos/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await MongoPromoCode.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Promo not found." });
    }
    return res.json({ success: true, message: "Promo code deleted." });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to delete promo: " + error.message });
  }
});

// GET /admin/api/banners — fetch all banners (for admin management; Basic Auth)
app.get("/admin/api/banners", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  try {
    const banners = await MongoBanner.find({});
    return res.json(banners);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch admin banners: " + error.message });
  }
});

// PATCH /admin/api/banners/:id/toggle — toggle banner active state (Requires basic auth)
app.patch("/admin/api/banners/:id/toggle", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const current = await MongoBanner.findById(id);
    if (!current) {
      return res.status(404).json({ error: "Banner not found." });
    }
    current.isActive = !current.isActive;
    const updatedBanner = await current.save();
    return res.json(updatedBanner);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to toggle banner active state: " + error.message });
  }
});

// POST /admin/api/banners — add a new banner (Requires basic auth)
app.post("/admin/api/banners", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { title, subtitle, badge, image, altText, buttonText, buttonLink, isActive, stylePattern, type } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Banner title is required." });
  }

  try {
    const newBanner = new MongoBanner({
      title,
      subtitle: subtitle || "",
      badge: badge || "",
      image: image || "",
      altText: altText || "",
      buttonText: buttonText || "Order Now",
      buttonLink: buttonLink || "#menu",
      isActive: isActive !== false,
      stylePattern: stylePattern || "attached",
      type: type || "all",
    });
    const savedBanner = await newBanner.save();
    return res.status(201).json(savedBanner);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to create new banner: " + error.message });
  }
});

// PATCH /admin/api/banners/:id — update existing banner (Requires basic auth)
app.patch("/admin/api/banners/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  const allowedBannerFields = ["title", "subtitle", "badge", "image", "altText", "buttonText", "buttonLink", "isActive", "stylePattern", "type"];
  const updates: Record<string, any> = {};
  for (const key of allowedBannerFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  try {
    const updatedBanner = await MongoBanner.findByIdAndUpdate(id, updates, { returnDocument: "after" });
    if (!updatedBanner) {
      return res.status(404).json({ error: "Banner not found." });
    }
    return res.json(updatedBanner);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update banner: " + error.message });
  }
});

// DELETE /admin/api/banners/:id — delete banner (Requires basic auth)
app.delete("/admin/api/banners/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await MongoBanner.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Banner not found." });
    }
    return res.json({ success: true, message: "Banner deleted successfully." });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to delete banner: " + error.message });
  }
});

// PATCH /admin/api/menu/:id/toggle — toggle menu item availability (Requires basic auth)
app.patch("/admin/api/menu/:id/toggle", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const item = await MongoMenuItem.findById(id);
    if (item) {
      item.available = !item.available;
      const updatedItem = await item.save();
      return res.json({ success: true, available: updatedItem.available });
    }

    return res.status(404).json({ error: "Menu item not found." });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to toggle menu item: " + error.message });
  }
});

// POST /admin/api/menu — add a new menu item to catalog (Requires basic auth)
app.post("/admin/api/menu", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { name, category, categoryId, displayOrder, price, description, image, altText, available, subCategory, badge, featured, discountPrice, discountPercentage, sizes, pinnedFeatured, bundleConfig } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: "Menu item name and price are required." });
  }

  const parsedPrice = Number(price);
  if (!isFinite(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ error: "Price must be a positive number greater than 0." });
  }

  if (discountPrice !== undefined && discountPrice !== null && discountPrice !== 0) {
    const parsedDiscount = Number(discountPrice);
    if (!isFinite(parsedDiscount) || parsedDiscount <= 0) {
      return res.status(400).json({ error: "Discount price must be a positive number greater than 0." });
    }
  }

  try {
    let resolvedCategoryId = categoryId || "";
    let resolvedCategorySlug = category || "pizza";

    if (resolvedCategoryId) {
      const catDoc = await MongoCategory.findById(resolvedCategoryId);
      if (catDoc) {
        resolvedCategorySlug = catDoc.slug;
      }
    } else if (resolvedCategorySlug) {
      const catDoc = await MongoCategory.findOne({
        $or: [{ slug: resolvedCategorySlug.toLowerCase() }, { name: new RegExp(`^${resolvedCategorySlug}$`, "i") }]
      });
      if (catDoc) {
        resolvedCategoryId = catDoc._id.toString();
        resolvedCategorySlug = catDoc.slug;
      }
    }

    let itemOrder = 0;
    if (displayOrder !== undefined && displayOrder !== null) {
      itemOrder = Number(displayOrder) || 0;
    } else {
      const highest = await MongoMenuItem.findOne({
        $or: [{ categoryId: resolvedCategoryId }, { category: resolvedCategorySlug }]
      }).sort({ displayOrder: -1 }).lean() as any;
      itemOrder = highest?.displayOrder ? highest.displayOrder + 1 : 1;
    }

    const payload = {
      name,
      category: resolvedCategorySlug,
      categoryId: resolvedCategoryId,
      displayOrder: itemOrder,
      price: parsedPrice,
      description: description || "",
      image: image || "",
      altText: altText || "",
      available: available !== false,
      subCategory: subCategory || "",
      badge: badge || "",
      featured: !!featured,
      pinnedFeatured: !!pinnedFeatured,
      discountPrice: discountPrice ? Number(discountPrice) : 0,
      discountPercentage: discountPercentage ? Number(discountPercentage) : 0,
      sizes: sizes || undefined,
      bundleConfig: bundleConfig || undefined,
    };

    const newItem = new MongoMenuItem(payload);
    const savedItem = await newItem.save();

    return res.status(201).json({ success: true, item: savedItem });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to add menu item: " + error.message });
  }
});

// PATCH /admin/api/menu/reorder — bulk reorder menu items
app.patch("/admin/api/menu/reorder", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { orders } = req.body; // Array of { id: string, displayOrder: number }
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: "orders array is required." });
  }
  try {
    const bulkOps = orders.map((item: any) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { displayOrder: Number(item.displayOrder) || 0 } },
      },
    }));
    if (bulkOps.length > 0) {
      await MongoMenuItem.bulkWrite(bulkOps);
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to reorder menu items: " + error.message });
  }
});

// PATCH /admin/api/menu/:id — update existing menu item (Requires basic auth)
app.patch("/admin/api/menu/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  const allowedMenuFields = ["name", "category", "categoryId", "displayOrder", "price", "description", "image", "altText", "available", "subCategory", "badge", "featured", "pinnedFeatured", "discountPrice", "discountPercentage", "sizes", "bundleConfig"];
  const updates: Record<string, any> = {};
  for (const key of allowedMenuFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (updates.price !== undefined) {
    const parsedPrice = Number(updates.price);
    if (!isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "Price must be a positive number greater than 0." });
    }
    updates.price = parsedPrice;
  }

  if (updates.discountPrice !== undefined && updates.discountPrice !== null && updates.discountPrice !== 0) {
    const parsedDiscount = Number(updates.discountPrice);
    if (!isFinite(parsedDiscount) || parsedDiscount <= 0) {
      return res.status(400).json({ error: "Discount price must be a positive number greater than 0." });
    }
    updates.discountPrice = parsedDiscount;
  }

  if (updates.displayOrder !== undefined) {
    updates.displayOrder = Number(updates.displayOrder) || 0;
  }

  try {
    if (updates.categoryId) {
      const catDoc = await MongoCategory.findById(updates.categoryId);
      if (catDoc) {
        updates.category = catDoc.slug;
      }
    } else if (updates.category) {
      const catDoc = await MongoCategory.findOne({
        $or: [{ slug: updates.category.toLowerCase() }, { name: new RegExp(`^${updates.category}$`, "i") }]
      });
      if (catDoc) {
        updates.categoryId = catDoc._id.toString();
        updates.category = catDoc.slug;
      }
    }

    const doc = await MongoMenuItem.findById(id);
    if (!doc) {
      return res.status(404).json({ error: "Menu item not found." });
    }
    doc.set(updates);
    if (updates.sizes !== undefined) {
      doc.sizes = updates.sizes;
      doc.markModified("sizes");
    }
    if (updates.bundleConfig !== undefined) {
      doc.bundleConfig = updates.bundleConfig;
      doc.markModified("bundleConfig");
    }
    const updatedItem = await doc.save();
    console.log(`[Admin Menu PATCH] Saved item "${updatedItem.name}" with bundleConfig:`, JSON.stringify(updatedItem.bundleConfig));

    return res.json({ success: true, item: updatedItem });
  } catch (error: any) {
    console.error("[Admin Menu PATCH] Error:", error);
    return res.status(500).json({ error: "Failed to update menu item: " + error.message });
  }
});

// DELETE /admin/api/menu/:id — delete menu item (Requires basic auth)
app.delete("/admin/api/menu/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await MongoMenuItem.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: "Menu item not found to delete." });
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to delete menu item: " + error.message });
  }
});

// ─── ADMIN CATEGORY MANAGEMENT ENDPOINTS ───────────────────────────

// GET /admin/api/categories — fetch all categories for admin console
app.get("/admin/api/categories", verifyToken, requireDb, async (req, res) => {
  try {
    const categories = await MongoCategory.find().sort({ displayOrder: 1, _id: 1 }).lean();
    return res.json(categories);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch admin categories: " + error.message });
  }
});

// POST /admin/api/categories — create category
app.post("/admin/api/categories", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { name, slug, description, image, displayOrder, active, showOnMenu, seoTitle, seoDescription } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Category name is required." });
  }

  const cleanSlug = (slug || name).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!cleanSlug) {
    return res.status(400).json({ error: "A valid URL slug is required." });
  }

  try {
    const existing = await MongoCategory.findOne({ slug: cleanSlug });
    if (existing) {
      return res.status(400).json({ error: `Category slug "${cleanSlug}" is already in use.` });
    }

    let order = 0;
    if (displayOrder !== undefined && displayOrder !== null) {
      order = Number(displayOrder) || 0;
    } else {
      const highest = await MongoCategory.findOne().sort({ displayOrder: -1 }).lean() as any;
      order = highest?.displayOrder ? highest.displayOrder + 1 : 1;
    }

    const newCategory = new MongoCategory({
      name: name.trim(),
      slug: cleanSlug,
      description: description || "",
      image: image || "",
      displayOrder: order,
      active: active !== false,
      showOnMenu: showOnMenu !== false,
      seoTitle: seoTitle || "",
      seoDescription: seoDescription || "",
    });

    const saved = await newCategory.save();
    return res.status(201).json({ success: true, category: saved });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to create category: " + error.message });
  }
});

// PATCH /admin/api/categories/reorder — bulk reorder categories
app.patch("/admin/api/categories/reorder", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const list = req.body.orders || req.body.categories;
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: "orders or categories array is required." });
  }
  try {
    const bulkOps = list.map((item: any) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { displayOrder: Number(item.displayOrder) || 0 } },
      },
    }));
    if (bulkOps.length > 0) {
      await MongoCategory.bulkWrite(bulkOps);
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to reorder categories: " + error.message });
  }
});

// PATCH /admin/api/categories/:id — update category
app.patch("/admin/api/categories/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, image, displayOrder, active, showOnMenu, seoTitle, seoDescription } = req.body;

  try {
    const doc = await MongoCategory.findById(id);
    if (!doc) {
      return res.status(404).json({ error: "Category not found." });
    }

    if (name !== undefined) doc.name = name.trim();
    if (slug !== undefined) {
      const cleanSlug = slug.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (cleanSlug && cleanSlug !== doc.slug) {
        const existing = await MongoCategory.findOne({ slug: cleanSlug, _id: { $ne: id } });
        if (existing) {
          return res.status(400).json({ error: `Category slug "${cleanSlug}" is already in use.` });
        }
        doc.slug = cleanSlug;
      }
    }
    if (description !== undefined) doc.description = description;
    if (image !== undefined) doc.image = image;
    if (displayOrder !== undefined) doc.displayOrder = Number(displayOrder) || 0;
    if (active !== undefined) doc.active = !!active;
    if (showOnMenu !== undefined) doc.showOnMenu = !!showOnMenu;
    if (seoTitle !== undefined) doc.seoTitle = seoTitle;
    if (seoDescription !== undefined) doc.seoDescription = seoDescription;

    const updated = await doc.save();

    // If slug changed, keep associated menu items' category string updated
    if (slug !== undefined) {
      await MongoMenuItem.updateMany(
        { categoryId: doc._id.toString() },
        { $set: { category: doc.slug } }
      );
    }

    return res.json({ success: true, category: updated });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update category: " + error.message });
  }
});

// DELETE /admin/api/categories/:id — delete category
app.delete("/admin/api/categories/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    const category = await MongoCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: "Category not found." });
    }
    const itemCount = await MongoMenuItem.countDocuments({
      $or: [{ categoryId: id }, { category: category.slug }]
    });
    if (itemCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category "${category.name}" because ${itemCount} menu items are currently assigned to it. Reassign or delete those items first.`
      });
    }
    await MongoCategory.findByIdAndDelete(id);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to delete category: " + error.message });
  }
});

// GET /api/branches — get active branches for public customer site
app.get("/api/branches", async (req, res) => {
  if (respondDbDownForRead(res)) return;
  try {
    const branches = await MongoBranch.find({ isActive: true });
    // Branches change ~never — cache longer than the catalog endpoints.
    res.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.json(branches);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch branches: " + error.message });
  }
});

// GET /admin/api/branches — get all branches for admin console (Requires basic auth)
app.get("/admin/api/branches", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  try {
    const branches = await MongoBranch.find({});
    return res.json(branches);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch admin branches: " + error.message });
  }
});

// PATCH /admin/api/branches/:id/toggle — toggle branch active status (Requires basic auth)
app.patch("/admin/api/branches/:id/toggle", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const branch = await MongoBranch.findById(id);
    if (!branch) {
      return res.status(404).json({ error: "Branch not found." });
    }
    branch.isActive = !branch.isActive;
    const updatedBranch = await branch.save();
    return res.json({ success: true, isActive: updatedBranch.isActive });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to toggle branch status: " + error.message });
  }
});

// POST /admin/api/branches — add a new branch (Requires basic auth)
app.post("/admin/api/branches", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { name, phone, whatsapp, address, map, geo, hours, delivery, isActive, image, altText } = req.body;
  if (!name || !phone || !whatsapp || !address) {
    return res.status(400).json({ error: "Branch name, phone, whatsapp, and address are required." });
  }

  try {
    const payload = {
      name,
      phone,
      whatsapp,
      address,
      map: map || "",
      geo: geo || "",
      hours: hours || "Daily 11 AM – 1 AM",
      delivery: delivery !== false,
      isActive: isActive !== false,
      image: image || "",
      altText: altText || "",
    };

    const newBranch = new MongoBranch(payload);
    const savedBranch = await newBranch.save();
    return res.status(201).json(savedBranch);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to create new branch: " + error.message });
  }
});

// PATCH /admin/api/branches/:id — update existing branch (Requires basic auth)
app.patch("/admin/api/branches/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  const allowedBranchFields = ["name", "phone", "whatsapp", "address", "map", "geo", "hours", "delivery", "isActive", "image", "altText"];
  const updates: Record<string, any> = {};
  for (const key of allowedBranchFields) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  try {
    const updatedBranch = await MongoBranch.findByIdAndUpdate(id, updates, { returnDocument: "after" });

    if (!updatedBranch) {
      return res.status(404).json({ error: "Branch not found." });
    }
    return res.json(updatedBranch);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update branch: " + error.message });
  }
});

// DELETE /admin/api/branches/:id — delete branch (Requires basic auth)
app.delete("/admin/api/branches/:id", verifyToken, requireSuperAdmin, requireDb, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await MongoBranch.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ error: "Branch not found to delete." });
    }
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to delete branch: " + error.message });
  }
});

// GET /api/orders/:outletId — get orders for a specific outlet or "all" (Requires basic auth)
app.get("/api/orders/:outletId", verifyToken, checkOutletAccess("outletId"), requireDb, async (req, res) => {
  const { outletId } = req.params;
  const { status } = req.query; // optional status filter

  try {
    const query: any = {};
    if (normalizeOutletName(outletId).toLowerCase() !== "all") {
      query.outlet = { $in: outletRegexVariants(outletId) };
    }
    if (status && typeof status === "string") {
      query.status = status;
    }
    const orders = await MongoOrder.find(query).sort({ timestamp: -1 });
    return res.json(orders);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to query outlet orders: " + error.message });
  }
});

// PATCH /api/orders/:id/status — update active order status + build WhatsApp notification URL
app.patch("/api/orders/:id/status", verifyToken, requireDb, async (req, res) => {
  const { id } = req.params;
  const { status, outletName } = req.body;

  const validStatuses = ["pending", "preparing", "out-for-delivery", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Incorrect target order status." });
  }

  try {
    // First fetch the order to check outlet access
    const orderDoc: any = await MongoOrder.findById(id);

    if (!orderDoc) {
      return res.status(404).json({ error: "Order not found." });
    }

    // Check outlet access for moderator role (alias-aware: "Ibri Outlet" == "Ibri")
    if (req.user && req.user.role !== "superadmin") {
      const orderOutlet = orderDoc.outlet || orderDoc.branch || "";
      const hasAccess = req.user.outletAccess.some(
        (o: string) => outletEquals(o, orderOutlet)
      );
      if (!hasAccess) {
        return res.status(403).json({ error: "Access Denied. You do not have access to this order's outlet." });
      }
    }

    const updatedOrder = await MongoOrder.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: "after" }
    );

    // Optional Google Sheets status update trigger
    const config = loadSheetsConfig();
    if (config.webAppUrl && config.autoSyncEnabled) {
      const statusPayload = {
        action: "update_status",
        orderId: updatedOrder._id.toString(),
        status: status
      };
      sendToGoogleSheets(statusPayload).catch(err => console.error("Sheets update_status error:", err));
    }

    // ── Build WhatsApp notification ──
    let whatsappUrl: string | null = null;
    let notificationReady = false;
    let notificationStatus = status;

    const customerPhone = updatedOrder.customer?.phone || "";
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const customerName = updatedOrder.customer?.name || "Valued Customer";
    const orderRef = updatedOrder._id.toString().slice(-6);
    const total = typeof updatedOrder.total === "number" ? updatedOrder.total.toFixed(3) : "0.000";
    const outlet = outletName || updatedOrder.outlet || "Pizza City";

    const templateTexts: Record<string, string> = {
      confirmed: `confirmed ✅ and we're starting to prepare your order now!`,
      preparing: `— our chefs are working on it! 👨‍🍳`,
      "out-for-delivery": `is on the way 🚚 — expect delivery in 15-30 minutes!`,
      delivered: `has been delivered! 🍕 Enjoy your meal and please leave us a Google review!`,
      cancelled: `was cancelled ❌. We're sorry — please contact the outlet for assistance.`,
    };

    const templateKey = status === "preparing" ? "confirmed" : status;
    const msgBody = templateTexts[templateKey] || `has been updated to "${status}".`;

    const message =
      `Hi ${customerName},\n\n` +
      `Your order #${orderRef} from ${outlet} ${msgBody}\n\n` +
      `Total: OMR ${total}\n\n` +
      `Thank you for choosing Pizza City Oman! 🍕`;

    if (cleanPhone) {
      whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      notificationReady = true;
      const displayMap: Record<string, string> = {
        preparing: "confirmed",
        "out-for-delivery": "out-for-delivery",
        delivered: "delivered",
        cancelled: "cancelled",
      };
      notificationStatus = displayMap[status] || status;
    }

    return res.json({
      success: true,
      order: updatedOrder,
      whatsappUrl,
      notificationReady,
      notificationStatus,
      customerName,
    });
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update order status: " + error.message });
  }
});

// ==========================================
// DYNAMIC SEO: SITEMAP & OUTLET METADATA PRE-RENDERING
// ==========================================

function toSlug(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Shareable menu-item slug — mirrors src/lib/itemSlug.ts (keep the two in sync). */
function toItemSlug(name: string, id: unknown): string {
  const base = toSlug(name) || "item";
  const suffix = String(id ?? "").slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "");
  return suffix ? `${base}-${suffix}` : base;
}

function findMenuItemBySlug(items: any[], slug: string): any | null {
  if (!slug) return null;
  const clean = slug.toLowerCase();
  return (
    items.find((it) => toItemSlug(it.name, it._id) === clean) ||
    items.find((it) => toSlug(it.name) === clean) ||
    items.find((it) => String(it._id || "").toLowerCase() === clean) ||
    null
  );
}

// Dynamic real-time sitemap reflecting all active outlets from DB
app.get("/sitemap.xml", async (req, res) => {
  try {
    // DB-driven only — no seed/mock fallback. Without a database the sitemap
    // still serves static pages, just without branch/menu slugs.
    let branchesList: any[] = [];
    if (useMongoDB) {
      branchesList = await MongoBranch.find({ isActive: { $ne: false } }).lean();
    }

    const today = new Date().toISOString().split("T")[0];
    const baseUrl = "https://pizzacityoman.com";

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${baseUrl}/menu</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${baseUrl}/locations</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${baseUrl}/contact</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${baseUrl}/faq</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${baseUrl}/track-order</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.4</priority>\n  </url>\n`;

    for (const b of branchesList) {
      const slug = toSlug(b.name);
      if (!slug) continue;
      xml += `  <url>\n    <loc>${baseUrl}/locations/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    try {
      let categoriesList: any[] = [];
      if (useMongoDB) {
        categoriesList = await MongoCategory.find({ active: { $ne: false }, showOnMenu: { $ne: false } }).sort({ displayOrder: 1 }).lean();
      }
      for (const c of categoriesList) {
        if (!c || !c.slug) continue;
        xml += `  <url>\n    <loc>${baseUrl}/menu/${c.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
      }
    } catch (catErr) {
      console.error("Error adding categories to sitemap:", catErr);
    }

    try {
      let menuList: any[] = [];
      if (useMongoDB) {
        menuList = await MongoMenuItem.find({ available: { $ne: false } }).lean();
      }
      for (const m of menuList) {
        if (!m || !m.name) continue;
        const slug = toItemSlug(m.name, m._id);
        xml += `  <url>\n    <loc>${baseUrl}/menu/${slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      }
    } catch (menuErr) {
      console.error("Error adding menu items to sitemap:", menuErr);
    }

    xml += `</urlset>`;

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.header("Cache-Control", "public, max-age=1800");
    return res.send(xml);
  } catch (err: any) {
    console.error("Error generating dynamic sitemap:", err);
    return res.status(500).send("Error generating sitemap");
  }
});

// SEO template cache — index.html is read once and reused until modified.
// Crawler bursts previously did a synchronous disk read per request.
const seoTemplateCache = new Map<string, { mtimeMs: number; content: string }>();
function readSeoTemplate(indexPath: string): string {
  try {
    const mtimeMs = fs.statSync(indexPath).mtimeMs;
    const cached = seoTemplateCache.get(indexPath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.content;
    const content = fs.readFileSync(indexPath, "utf-8");
    seoTemplateCache.set(indexPath, { mtimeMs, content });
    return content;
  } catch {
    return fs.readFileSync(indexPath, "utf-8");
  }
}

async function renderLocationPage(req: express.Request, res: express.Response, next: express.NextFunction, vite?: any) {  try {
    const slug = (req.params.slug || "").toLowerCase();
    // DB-driven only — without a database (or an unknown slug) the branch
    // lookup misses and the 404 template below is served. No seed fallback.
    let branchesList: any[] = [];
    if (useMongoDB) {
      branchesList = await MongoBranch.find().lean();
    }

    const branch = branchesList.find(b => toSlug(b.name) === slug || toSlug(b._id?.toString() || "") === slug);

    const isProd = process.env.NODE_ENV === "production";
    const indexPath = isProd 
      ? path.join(process.cwd(), "dist", "index.html")
      : path.join(process.cwd(), "index.html");

    if (!fs.existsSync(indexPath)) {
      return next();
    }

    let template = fs.readFileSync(indexPath, "utf-8");

    if (vite) {
      template = await vite.transformIndexHtml(req.originalUrl, template);
    }

    if (!branch) {
      template = template.replace(
        "<head>",
        `<head>\n  <meta name="robots" content="noindex, nofollow" />\n  <title>Location Not Found — Pizza City Oman</title>`
      );
      return res.status(404).send(template);
    }

    const isActive = branch.isActive !== false;
    const branchName = branch.name;
    const branchGeo = branch.geo || branch.name;
    const pageTitle = isActive
      ? `Pizza City ${branchName} – Order Pizza Delivery in ${branchGeo}, Oman`
      : `Pizza City ${branchName} – Temporarily Closed`;
    const pageDesc = isActive
      ? `Order fresh handcrafted oven-baked pizzas from Pizza City ${branchName} (${branch.address}). ${branch.delivery !== false ? "Fast delivery" : "Pick up"} available. Call ${branch.phone}. Open ${branch.hours || "Daily 11 AM – 11 PM"}.`
      : `Pizza City ${branchName} in ${branchGeo}, Oman is currently closed.`;
    const canonicalUrl = `https://pizzacityoman.com/locations/${slug}`;
    const branchImg = branch.image || "https://pizzacityoman.com/og-image.png";

    const restaurantSchema = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "@id": canonicalUrl,
      name: `Pizza City ${branchName}`,
      telephone: branch.phone,
      url: canonicalUrl,
      image: branchImg,
      hasMap: branch.map || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: branch.address,
        addressLocality: branchGeo,
        addressRegion: "Oman",
        addressCountry: "OM",
      },
      servesCuisine: ["Pizza", "Italian", "Fast Food", "Halal"],
      priceRange: "OMR 2 - OMR 7",
      amenityFeature: {
        "@type": "LocationFeatureSpecification",
        name: "Food Delivery",
        value: branch.delivery !== false
      }
    };

    template = template.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}</title>`);

    if (template.includes('name="description"')) {
      template = template.replace(
        /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
        `<meta name="description" content="${pageDesc}" />`
      );
    }

    if (template.includes('rel="canonical"')) {
      template = template.replace(
        /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i,
        `<link rel="canonical" href="${canonicalUrl}" />`
      );
    } else {
      template = template.replace("</head>", `  <link rel="canonical" href="${canonicalUrl}" />\n</head>`);
    }

    if (!isActive) {
      template = template.replace(
        /<meta\s+name="robots"\s+content=".*?"\s*\/?>/i,
        `<meta name="robots" content="noindex, nofollow" />`
      );
    }

    template = template.replace(
      /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:title" content="${pageTitle}" />`
    );
    template = template.replace(
      /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:description" content="${pageDesc}" />`
    );
    template = template.replace(
      /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    );
    template = template.replace(
      /<meta\s+property="og:image"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:image" content="${branchImg}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:title" content="${pageTitle}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:description" content="${pageDesc}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:image" content="${branchImg}" />`
    );

    const schemaScript = `\n  <script type="application/ld+json" id="location-schema">\n  ${JSON.stringify(restaurantSchema, null, 2)}\n  </script>\n`;
    template = template.replace("</head>", `${schemaScript}</head>`);

    return res.send(template);
  } catch (err) {
    console.error("Error rendering dynamic location meta:", err);
    return next();
  }
}

// Static per-page SEO metadata (multi-page SPA routing — SSR-injected for crawlers)
const STATIC_SEO: Record<string, { title: string; description: string; canonical: string }> = {
  "/menu": {
    title: "Pizza Menu Oman — Prices & 30-Min Delivery | Pizza City",
    description: "Full Pizza City Oman menu with prices in OMR: handcrafted pizzas, combos, sides, drinks & desserts. 30-min delivery. Order via WhatsApp.",
    canonical: "https://pizzacityoman.com/menu",
  },
  "/locations": {
    title: "Pizza Locations Oman — Find Us Near You | Pizza City",
    description: "Find Pizza City outlets near you: Nizwa, Samail, Sur, Quriyat, Fanja, Al Khoud, Ibri & Mabela. Addresses, hours, phone & delivery info.",
    canonical: "https://pizzacityoman.com/locations",
  },
  "/contact": {
    title: "Contact Pizza City Oman — Phone, WhatsApp & Hours",
    description: "Call +968 9692 8714 or WhatsApp your order. Email info@pizzacityoman.com. Open daily 11 AM – 2 AM in Muscat, Oman.",
    canonical: "https://pizzacityoman.com/contact",
  },
  "/faq": {
    title: "Pizza Delivery FAQs — Halal, Ordering & Areas | Pizza City",
    description: "Halal ingredients? Delivery time & areas? Payment methods? Pizza City Oman answers: 30-min delivery, custom toppings, freshness & more.",
    canonical: "https://pizzacityoman.com/faq",
  },
  "/track-order": {
    title: "Track Your Order | Pizza City Oman",
    description: "Track your Pizza City Oman order live — enter your order ID to see preparation and delivery status.",
    canonical: "https://pizzacityoman.com/track-order",
  },
  "/privacy": {
    title: "Privacy Policy | Pizza City Oman",
    description: "How Pizza City Oman collects and uses order and contact information, and how to request deletion.",
    canonical: "https://pizzacityoman.com/privacy",
  },
  "/terms": {
    title: "Terms of Service | Pizza City Oman",
    description: "Ordering, pricing, delivery estimates and promo rules for Pizza City Oman online ordering.",
    canonical: "https://pizzacityoman.com/terms",
  },
};

async function renderStaticSeoPage(req: express.Request, res: express.Response, next: express.NextFunction, vite?: any) {
  try {
    const seo = STATIC_SEO[req.path];
    if (!seo) return next();
    const isProd = process.env.NODE_ENV === "production";
    const indexPath = isProd
      ? path.join(process.cwd(), "dist", "index.html")
      : path.join(process.cwd(), "index.html");
    if (!fs.existsSync(indexPath)) return next();
    let template = fs.readFileSync(indexPath, "utf-8");
    if (vite) {
      template = await vite.transformIndexHtml(req.originalUrl, template);
    }
    template = template.replace(/<title>.*?<\/title>/i, `<title>${seo.title}</title>`);
    if (template.includes('name="description"')) {
      template = template.replace(
        /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
        `<meta name="description" content="${seo.description}" />`
      );
    }
    if (template.includes('rel="canonical"')) {
      template = template.replace(
        /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i,
        `<link rel="canonical" href="${seo.canonical}" />`
      );
    }
    template = template.replace(
      /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:title" content="${seo.title}" />`
    );
    template = template.replace(
      /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:description" content="${seo.description}" />`
    );
    template = template.replace(
      /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:url" content="${seo.canonical}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:title" content="${seo.title}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:description" content="${seo.description}" />`
    );
    return res.send(template);
  } catch (err) {
    console.error("Error rendering static SEO page:", err);
    return next();
  }
}

async function renderMenuItemPage(req: express.Request, res: express.Response, next: express.NextFunction, vite?: any) {
  try {
    const slug = (req.params.slug || "").toLowerCase();

    // 1. Check if slug matches an active Category
    let categoryDoc: any = null;
    if (useMongoDB) {
      categoryDoc = await MongoCategory.findOne({ slug, active: { $ne: false } }).lean();
    }

    const isProd = process.env.NODE_ENV === "production";
    const indexPath = isProd
      ? path.join(process.cwd(), "dist", "index.html")
      : path.join(process.cwd(), "index.html");

    if (!fs.existsSync(indexPath)) {
      return next();
    }

    let template = fs.readFileSync(indexPath, "utf-8");

    if (vite) {
      template = await vite.transformIndexHtml(req.originalUrl, template);
    }

    if (categoryDoc) {
      const pageTitle = categoryDoc.seoTitle || `${categoryDoc.name} | Pizza City Oman`;
      const pageDesc = categoryDoc.seoDescription || categoryDoc.description || `Browse our delicious ${categoryDoc.name} at Pizza City Oman. Order online with quick delivery.`;
      const canonicalUrl = `https://pizzacityoman.com/menu/${categoryDoc.slug}`;

      const categoryBreadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://pizzacityoman.com" },
          { "@type": "ListItem", position: 2, name: "Menu", item: "https://pizzacityoman.com/menu" },
          { "@type": "ListItem", position: 3, name: categoryDoc.name },
        ],
      };

      template = template.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}</title>`);

      if (template.includes('name="description"')) {
        template = template.replace(
          /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
          `<meta name="description" content="${pageDesc}" />`
        );
      }

      if (template.includes('rel="canonical"')) {
        template = template.replace(
          /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i,
          `<link rel="canonical" href="${canonicalUrl}" />`
        );
      } else {
        template = template.replace("</head>", `  <link rel="canonical" href="${canonicalUrl}" />\n</head>`);
      }

      template = template.replace(
        /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i,
        `<meta property="og:title" content="${pageTitle}" />`
      );
      template = template.replace(
        /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i,
        `<meta property="og:description" content="${pageDesc}" />`
      );
      template = template.replace(
        /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i,
        `<meta property="og:url" content="${canonicalUrl}" />`
      );

      template = template.replace(
        "</head>",
        `  <script type="application/ld+json">\n${JSON.stringify(categoryBreadcrumbSchema, null, 2)}\n  </script>\n</head>`
      );

      return res.send(template);
    }

    // 2. Check if slug matches a Menu Item
    let menuList: any[] = [];
    if (useMongoDB) {
      menuList = await MongoMenuItem.find().lean();
    }
    if (!menuList || menuList.length === 0) {
      return next();
    }

    const item = findMenuItemBySlug(menuList, slug);

    if (!item) {
      template = template.replace(
        "<head>",
        `<head>\n  <meta name="robots" content="noindex, nofollow" />\n  <title>Dish Not Found — Pizza City Oman</title>`
      );
      return res.status(404).send(template);
    }

    const isAvailable = item.available !== false;
    const cleanDesc = String(item.description || "").replace(/\s+/g, " ").trim().slice(0, 140);
    const pageTitle = `${item.name} — Price & Order Online | Pizza City Oman`;
    const pageDesc = cleanDesc
      ? `${item.name}: ${cleanDesc} Order online from Pizza City Oman via WhatsApp.`
      : `Order ${item.name} online from Pizza City Oman via WhatsApp.`;
    const canonicalUrl = `https://pizzacityoman.com/menu/${toItemSlug(item.name, item._id)}`;
    const itemImg = item.image || "https://pizzacityoman.com/og-image.png";

    const menuItemSchema = {
      "@context": "https://schema.org",
      "@type": "MenuItem",
      name: item.name,
      description: cleanDesc || undefined,
      image: itemImg,
    };
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://pizzacityoman.com" },
        { "@type": "ListItem", position: 2, name: "Menu", item: "https://pizzacityoman.com/menu" },
        { "@type": "ListItem", position: 3, name: item.name },
      ],
    };

    template = template.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}</title>`);

    if (template.includes('name="description"')) {
      template = template.replace(
        /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
        `<meta name="description" content="${pageDesc}" />`
      );
    }

    if (template.includes('rel="canonical"')) {
      template = template.replace(
        /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i,
        `<link rel="canonical" href="${canonicalUrl}" />`
      );
    } else {
      template = template.replace("</head>", `  <link rel="canonical" href="${canonicalUrl}" />\n</head>`);
    }

    if (!isAvailable) {
      template = template.replace(
        /<meta\s+name="robots"\s+content=".*?"\s*\/?>/i,
        `<meta name="robots" content="noindex, nofollow" />`
      );
    }

    template = template.replace(
      /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:title" content="${pageTitle}" />`
    );
    template = template.replace(
      /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:description" content="${pageDesc}" />`
    );
    template = template.replace(
      /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    );
    template = template.replace(
      /<meta\s+property="og:image"\s+content=".*?"\s*\/?>/i,
      `<meta property="og:image" content="${itemImg}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:title" content="${pageTitle}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:description" content="${pageDesc}" />`
    );
    template = template.replace(
      /<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/i,
      `<meta name="twitter:image" content="${itemImg}" />`
    );

    const schemaScript = `\n  <script type="application/ld+json" id="menuitem-schema">\n  ${JSON.stringify([menuItemSchema, breadcrumbSchema])}\n  </script>\n`;
    template = template.replace("</head>", `${schemaScript}</head>`);

    return res.send(template);
  } catch (err) {
    console.error("Error rendering dynamic menu item meta:", err);
    return next();
  }
}

// ==========================================
// VITE AND STATIC CONTENT ROUTING
// ==========================================

async function start() {
  if (process.env.NODE_ENV !== "production") {
    // Dev server uses tsx running with Vite dev mode middlewares
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Intercept dynamic location pages before fallback
    app.get("/locations/:slug", (req, res, next) => renderLocationPage(req, res, next, vite));
    app.get("/menu/:slug", (req, res, next) => renderMenuItemPage(req, res, next, vite));
    for (const p of Object.keys(STATIC_SEO)) {
      app.get(p, (req, res, next) => renderStaticSeoPage(req, res, next, vite));
    }
    // Legacy /track alias
    app.get("/track", (req, res) => res.redirect(301, "/track-order"));
    app.use(vite.middlewares);
  } else {
    // Production serves compiled client bundle inside /dist
    const distPath = path.join(process.cwd(), "dist");
    // Serve static files with a strong cache-control header
    app.use(express.static(distPath, { maxAge: "1y", etag: true }));
    // Intercept dynamic location pages before SPA catch-all
    app.get("/locations/:slug", (req, res, next) => renderLocationPage(req, res, next));
    app.get("/menu/:slug", (req, res, next) => renderMenuItemPage(req, res, next));
    for (const p of Object.keys(STATIC_SEO)) {
      app.get(p, (req, res, next) => renderStaticSeoPage(req, res, next));
    }
    // Legacy /track alias
    app.get("/track", (req, res) => res.redirect(301, "/track-order"));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pizza City Backend API Listening on http://0.0.0.0:${PORT}`);
  });
}

start();
export default app;
