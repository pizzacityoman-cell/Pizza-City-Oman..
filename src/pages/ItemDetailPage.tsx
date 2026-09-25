import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { MenuItem, BundleSelection } from "../types";
import { getItemDetailData, itemSlug } from "../lib/itemSlug";
import { SITE_URL } from "../lib/seo";
import Seo from "../components/Seo";
import ItemDetailContent from "../components/ItemDetailContent";

interface ItemDetailPageProps {
  menuItems: MenuItem[];
  isLoadingMenu: boolean;
  onAdd: (item: MenuItem, size: string, quantity: number, bundleSelections?: BundleSelection[]) => void;
  onConfigure: (item: MenuItem) => void;
  onQuickView: (item: MenuItem) => void;
  displayToast?: (msg: string) => void;
}

export default function ItemDetailPage({
  menuItems,
  isLoadingMenu,
  onAdd,
  onConfigure,
  onQuickView,
  displayToast,
}: ItemDetailPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const { item, related } = useMemo(
    () => getItemDetailData(menuItems, slug || ""),
    [menuItems, slug]
  );

  if (isLoadingMenu && !item) {
    return (
      <div className="container mx-auto px-4 md:px-8 pt-20 md:pt-8 pb-16">
        <div className="skeleton-card max-w-3xl mx-auto mt-6">
          <div className="skeleton-card__image skeleton" />
          <div className="skeleton-card__body">
            <div className="skeleton-card__title skeleton" />
            <div className="skeleton-card__desc skeleton" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container mx-auto px-4 md:px-8 pt-20 md:pt-8 pb-16">
        <Seo
          title="Dish Not Found | Pizza City Oman"
          description="This dish is no longer on the menu. Browse the full Pizza City Oman menu."
          canonical={`${SITE_URL}/menu`}
          noindex
        />
        <div className="max-w-xl mx-auto text-center py-16 space-y-4">
          <span className="text-4xl block">🍕</span>
          <h1 className="font-playfair font-black text-2xl text-[var(--pc-gray-700)]">
            Dish not found
          </h1>
          <p className="text-sm text-[var(--pc-gray-500)]">
            It may have been removed from the menu. Have a look at everything else.
          </p>
          <Link
            to="/menu"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white text-sm font-bold"
          >
            <ArrowLeft size={16} /> Back to Menu
          </Link>
        </div>
      </div>
    );
  }

  const canonical = `${SITE_URL}/menu/${itemSlug(item)}`;
  const unavailable = item.available === false;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "MenuItem",
      name: item.name,
      description: item.description || undefined,
      image: item.image || undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Menu", item: `${SITE_URL}/menu` },
        { "@type": "ListItem", position: 3, name: item.name },
      ],
    },
  ];

  return (
    <div className="container mx-auto px-4 md:px-8 pt-24 md:pt-8 pb-16 animate-fadeIn">
      <Seo
        title={`${item.name} — Price & Order Online | Pizza City Oman`}
        description={`${item.name}: ${(item.description || "").replace(/\s+/g, " ").trim().slice(0, 120)} Order online from Pizza City Oman via WhatsApp.`}
        canonical={canonical}
        ogImage={item.image || undefined}
        noindex={unavailable}
        schema={schema}
        schemaId="menuitem-schema"
      />
      <Link
        to="/menu"
        className="inline-flex items-center gap-1.5 mt-4 mb-4 text-sm font-bold text-[var(--pc-gray-500)] hover:text-[var(--pc-red-500)] transition-colors"
      >
        <ArrowLeft size={16} /> Back to Menu
      </Link>
      <ItemDetailContent
        item={item}
        related={related}
        onAdd={onAdd}
        onConfigure={onConfigure}
        onQuickView={onQuickView}
        displayToast={displayToast}
        menuItems={menuItems}
      />
    </div>
  );
}
