import {
  CreateCustomFlowerRequestInput,
  CustomFlowerRequest,
} from "@/types/custom-request.types";
import { generateRequestCode, mockCustomFlowerRequests } from "./custom-request.mock";

let requests: CustomFlowerRequest[] = [...mockCustomFlowerRequests];

export const customRequestService = {
  getRequests: async (): Promise<CustomFlowerRequest[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...requests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  getRequestById: async (id: string): Promise<CustomFlowerRequest> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const request = requests.find((r) => r.id === id);
    if (!request) {
      throw new Error(`Không tìm thấy yêu cầu với ID ${id}`);
    }
    return request;
  },

  createRequest: async (
    input: CreateCustomFlowerRequestInput,
  ): Promise<CustomFlowerRequest> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const now = new Date().toISOString();
    const newRequest: CustomFlowerRequest = {
      id: `req-${Date.now()}`,
      requestCode: generateRequestCode(),
      status: "NEW",
      referenceImages: input.referenceImages ?? [],
      quotes: [],
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    requests = [newRequest, ...requests];
    return newRequest;
  },

  cancelRequest: async (id: string): Promise<CustomFlowerRequest> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const index = requests.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Không tìm thấy yêu cầu với ID ${id}`);
    }
    const current = requests[index];
    if (current.status === "CONVERTED_TO_ORDER" || current.status === "CANCELLED") {
      throw new Error("Không thể hủy yêu cầu ở trạng thái hiện tại");
    }
    const updated: CustomFlowerRequest = {
      ...current,
      status: "CANCELLED",
      updatedAt: new Date().toISOString(),
    };
    requests[index] = updated;
    return updated;
  },

  confirmQuote: async (id: string): Promise<CustomFlowerRequest> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const index = requests.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Không tìm thấy yêu cầu với ID ${id}`);
    }
    const updated: CustomFlowerRequest = {
      ...requests[index],
      status: "CONFIRMED",
      updatedAt: new Date().toISOString(),
    };
    requests[index] = updated;
    return updated;
  },
};
