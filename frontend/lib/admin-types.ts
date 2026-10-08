export interface AdminImage {
  id: number;
  url: string;
  alt_text: string;
  is_cover: boolean;
  sort_order: number;
  width?: number | null;
  height?: number | null;
  cloudinary_public_id?: string | null;
}

export interface Translation {
  name?: string | null;
  short_description?: string | null;
  description?: string | null;
  house_rules?: string | null;
  neighborhood?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
}

export interface AdminApartment {
  id: number;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  house_rules: string;
  neighborhood: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string;
  owner_whatsapp: string;
  owner_email: string;
  rating: number | null;
  reviews_count: number | null;
  max_guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  price_per_night: number;
  cleaning_fee: number;
  min_nights: number;
  check_in_time: string;
  check_out_time: string;
  seo_title: string;
  seo_description: string;
  airbnb_ical_url: string;
  ical_export_url: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  translations: Record<string, Translation>;
  amenity_ids: number[];
  images: AdminImage[];
  cover_image: AdminImage | null;
  last_sync_at: string | null;
  last_sync_success: boolean | null;
  last_sync_error: string | null;
  last_sync_events: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAmenity {
  id: number;
  key: string;
  name_en: string;
  name_he: string;
  icon: string;
}

export interface Inquiry {
  id: number;
  apartment_id: number;
  apartment_name: string;
  apartment_slug: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  full_name: string;
  phone: string;
  email: string;
  message: string;
  locale: string;
  channel: "form" | "whatsapp" | "email";
  status: "NEW" | "CONTACTED" | "CONFIRMED" | "CANCELLED";
  estimated_total: number | null;
  currency: string;
  admin_notes: string;
  booking_id: number | null;
  created_at: string;
}

export interface BookingRow {
  kind: "booking" | "block";
  id: number;
  apartment_id: number;
  apartment_name: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number | null;
  source: string;
  status: string;
  total_price: number | null;
  currency: string | null;
  notes: string;
  created_at: string;
}

export interface Block {
  id: number;
  apartment_id: number;
  start_date: string;
  end_date: string;
  source: "airbnb" | "website_booking" | "manual";
  reason: string;
  external_uid: string | null;
  booking_id: number | null;
}

export interface SyncLog {
  id: number;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  success: boolean;
  events_imported: number;
  events_created: number;
  events_updated: number;
  events_removed: number;
  error: string | null;
}

export interface Dashboard {
  apartments_total: number;
  apartments_active: number;
  new_inquiries: number;
  upcoming_bookings: number;
  upcoming_checkins: { apartment_id: number; apartment_name: string; guest_name: string; check_in: string; check_out: string; source: string }[];
  occupancy_percent_30d: number;
  sync_status: {
    apartment_id: number;
    apartment_name: string;
    has_feed: boolean;
    last_sync_at: string | null;
    last_sync_success: boolean | null;
    last_sync_error: string | null;
    last_sync_events: number | null;
  }[];
}
