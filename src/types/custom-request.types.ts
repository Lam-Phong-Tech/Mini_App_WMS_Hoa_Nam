export type CustomFlowerRequestStatus =
  | "NEW"
  | "CONSULTING"
  | "SAMPLE_SENT"
  | "WAITING_CUSTOMER_CONFIRMATION"
  | "CONFIRMED"
  | "CONVERTED_TO_ORDER"
  | "CANCELLED";

export interface CustomFlowerQuote {
  id: string;
  createdAt: string | Date;
  price: number;
  etaLabel: string;
  note?: string;
  sampleImage?: string;
}

export interface CustomFlowerRequest {
  id: string;
  requestCode: string;
  status: CustomFlowerRequestStatus;
  occasion: string;
  recipient: string;
  budget: string;
  flowerType?: string;
  colorPreference?: string;
  stylePreference?: string;
  size?: string;
  referenceImages: string[];
  cardMessage?: string;
  deliveryDate: string;
  deliveryTimeSlot: string;
  deliveryAddress: string;
  specialRequest?: string;
  quotes: CustomFlowerQuote[];
  convertedOrderId?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateCustomFlowerRequestInput {
  occasion: string;
  recipient: string;
  budget: string;
  flowerType?: string;
  colorPreference?: string;
  stylePreference?: string;
  size?: string;
  referenceImages?: string[];
  cardMessage?: string;
  deliveryDate: string;
  deliveryTimeSlot: string;
  deliveryAddress: string;
  specialRequest?: string;
}
