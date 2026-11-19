export type Role = 'buyer' | 'supplier' | 'admin';
export type RequestStatus = 'open' | 'awarded' | 'cancelled' | 'closed';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type OrderStatus = 'confirmed' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type Plan = 'trial' | 'basic' | 'pro';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  company_name: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  bio: string | null;
  website: string | null;
  category_ids: number[];
  currency: string;
  language: 'en' | 'tr';
  plan: Plan | null;
  trial_ends_at: string | null;
  is_demo: boolean;
  is_suspended: boolean;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  role: Role;
  full_name: string;
  company_name: string;
  country: string | null;
  city: string | null;
  bio: string | null;
  website: string | null;
  category_ids: number[];
  is_demo: boolean;
  created_at: string;
  avg_rating: number;
  review_count: number;
  completed_orders: number;
}

export interface Category {
  id: number;
  slug: string;
  name_en: string;
  name_tr: string;
  icon: string;
  sort: number;
}

export interface SupplyRequest {
  id: string;
  buyer_id: string;
  category_id: number;
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  photo_path: string | null;
  country: string;
  city: string;
  delivery_address: string;
  needed_within_hours: number;
  currency: string;
  budget: number | null;
  status: RequestStatus;
  is_featured: boolean;
  is_demo: boolean;
  accepted_offer_id: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  request_id: string;
  supplier_id: string;
  price: number;
  currency: string;
  delivery_minutes: number;
  note: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  request_id: string;
  offer_id: string;
  buyer_id: string;
  supplier_id: string;
  price: number;
  currency: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderEvent {
  id: number;
  order_id: string;
  status: OrderStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  request_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  data: Record<string, unknown>;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  buyer_id: string;
  supplier_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  supplier_id: string;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  unit: string | null;
  created_at: string;
}
