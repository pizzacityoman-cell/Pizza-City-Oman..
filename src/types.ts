import { MenuItemSize } from "./lib/priceUtils";

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  displayOrder: number;
  active: boolean;
  showOnMenu: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

export interface MenuItem {
  _id: string;
  name: string;
  category: string;
  categoryId?: string;
  displayOrder?: number;
  price: number;
  description: string;
  image: string;
  altText?: string;
  available: boolean;
  discountPrice?: number;
  discountPercentage?: number;
  featured?: boolean;
  pinnedFeatured?: boolean;
  sizes?: MenuItemSize[];
  bundleConfig?: BundleConfig;
}

export interface BundleGroup {
  id: string;
  title: string;
  description?: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  allowDuplicates: boolean;
  optionItemIds: string[];
}

export interface BundleConfig {
  enabled: boolean;
  groups: BundleGroup[];
}

export interface BundleSelectionItem {
  menuItemId: string;
  name: string;
  quantity?: number;
}

export interface BundleSelection {
  groupId: string;
  groupTitle: string;
  items: BundleSelectionItem[];
}

export interface PromoCode {
  _id: string;
  code: string;
  discountType: "percentage" | "flat";
  discountValue: number;
  minOrderAmount?: number;
  isActive: boolean;
}

export interface CartEntry {
  item: MenuItem;
  quantity: number;
  size: string;
  unitPrice: number;
  bundleSelections?: BundleSelection[];
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  size?: string;
  quantity: number;
  price: number;
  bundleSelections?: BundleSelection[];
}

export interface Customer {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export type OrderType = "delivery" | "pickup";

export interface CustomerLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  source: "gps" | "manual";
  timestamp: number;
  orderType?: OrderType;
  selectedBranchName?: string;
}

export interface DeliveryLocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  source: "gps" | "manual";
  distanceKm?: number;
}

export interface Order {
  _id: string;
  items: OrderItem[];
  customer: Customer;
  outlet: string; // Branch.name — source of truth is /api/branches (MongoDB)
  status: 'pending' | 'preparing' | 'out-for-delivery' | 'delivered' | 'cancelled';
  total: number;
  timestamp: string;
  orderType?: OrderType;
  deliveryLocation?: DeliveryLocationData;
}

export interface Branch {
  _id?: string;
  id?: string;
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  map?: string;
  geo?: string;
  hours?: string;
  delivery?: boolean;
  isActive?: boolean;
  image?: string;
  altText?: string;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm?: number;
}

// Outlet names are dynamic — the single source of truth is /api/branches (MongoDB).
// There is intentionally no hardcoded OUTLETS constant (it previously capped the
// system at 5 outlets while the database holds 8+). Use Branch.name directly.
export type OutletName = string;

export interface HeroBanner {
  _id: string;
  title: string;
  subtitle: string;
  badge: string;
  image: string;
  altText?: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  stylePattern?: "attached" | "classic" | "modern" | "fullImage";
  type?: "hero" | "offer" | "all";
}

