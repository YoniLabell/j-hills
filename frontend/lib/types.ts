export type Locale = "en" | "he";

export interface ImageInfo {
  id: number;
  url: string;
  alt_text: string;
  is_cover: boolean;
  sort_order: number;
  width?: number | null;
  height?: number | null;
}

export interface Amenity {
  id: number;
  key: string;
  name: string;
  icon: string;
}

export interface ApartmentCard {
  id: number;
  slug: string;
  name: string;
  neighborhood: string;
  short_description: string;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  price_per_night: number;
  cleaning_fee: number;
  currency: string;
  featured: boolean;
  cover_image: ImageInfo | null;
  rating: number | null;
  reviews_count: number | null;
  /** A few localized amenity names for the card. */
  highlights: string[];
}

export interface ApartmentDetail extends ApartmentCard {
  description: string;
  house_rules: string;
  min_nights: number;
  check_in_time: string;
  check_out_time: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string;
  /** Apartment owner's WhatsApp, or the site-wide number. */
  whatsapp_number: string;
  /** Apartment owner's email, or the site-wide email. */
  contact_email: string;
  images: ImageInfo[];
  amenities: Amenity[];
  seo_title: string;
  seo_description: string;
}

export interface SiteSettings {
  site_name: string;
  site_name_he: string;
  logo_url: string;
  hero_image_url: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  instagram_url: string;
  facebook_url: string;
  default_currency: string;
  currency_symbol: string;
  about_text_en: string;
  about_text_he: string;
  footer_text_en: string;
  footer_text_he: string;
  rating: number | null;
  reviews_count: number | null;
  host_since_year: number | null;
}

export interface Neighborhood {
  value: string;
  label: string;
  count: number;
}

export interface Period {
  start_date: string;
  end_date: string;
}

export interface Availability {
  apartment_id: number;
  start_date: string;
  end_date: string;
  min_nights: number;
  blocked: Period[];
}
