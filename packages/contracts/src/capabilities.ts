export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export interface DraftOrderInput {
  customerId: string;
  lines: readonly OrderLineInput[];
}

export interface DraftOrder {
  currency: string;
  id: string;
  lines: readonly OrderLineInput[];
  status: "draft";
  totalMinor: number;
}

export interface OrderStatus {
  id: string;
  status: string;
  updatedAt: string;
}
