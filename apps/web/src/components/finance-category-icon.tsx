import {
  Utensils, Cookie, Shirt, Bus, Plane, Baby, PawPrint, Phone, Wine, BookOpen,
  ShoppingBasket, House, Sparkles, HeartPulse, Gift, Fuel, Gamepad2, PartyPopper,
  Camera, Dumbbell, Grid2X2, Zap, HandHeart, WashingMachine, Leaf, Coffee,
  ShoppingBag, ShieldCheck, Receipt, BriefcaseBusiness, Banknote, Wallet, Clock,
  TrendingUp, Award, Landmark, Coins, Laptop, Music, Bike,
} from "lucide-react";
import type { FinanceCategoryIconName } from "@renewlet/shared/schemas/finance";

const icons = {
  utensils: Utensils, cookie: Cookie, shirt: Shirt, bus: Bus, plane: Plane, baby: Baby,
  "paw-print": PawPrint, phone: Phone, wine: Wine, "book-open": BookOpen,
  "shopping-basket": ShoppingBasket, house: House, sparkles: Sparkles, "heart-pulse": HeartPulse,
  gift: Gift, fuel: Fuel, "gamepad-2": Gamepad2, "party-popper": PartyPopper, camera: Camera,
  dumbbell: Dumbbell, "grid-2x2": Grid2X2, zap: Zap, "hand-heart": HandHeart,
  "washing-machine": WashingMachine, leaf: Leaf, coffee: Coffee, "shopping-bag": ShoppingBag,
  "shield-check": ShieldCheck, receipt: Receipt, "briefcase-business": BriefcaseBusiness,
  banknote: Banknote, wallet: Wallet, clock: Clock, "trending-up": TrendingUp, award: Award,
  landmark: Landmark, coins: Coins, laptop: Laptop, music: Music, bike: Bike,
} satisfies Record<FinanceCategoryIconName, typeof Utensils>;

export function FinanceCategoryIcon({ name, className = "size-6" }: { name: FinanceCategoryIconName; className?: string }) {
  const Icon = icons[name] ?? Grid2X2;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.8} data-finance-icon={name} />;
}
