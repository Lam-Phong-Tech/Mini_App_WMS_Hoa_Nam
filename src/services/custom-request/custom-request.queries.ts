import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { customRequestService } from "./custom-request.api";
import {
  GET_CUSTOM_REQUEST_BY_ID_KEY,
  GET_CUSTOM_REQUEST_LIST_KEY,
} from "@/constants/api";
import { CustomFlowerRequest } from "@/types/custom-request.types";

export function useCustomRequests() {
  return useQuery<CustomFlowerRequest[]>({
    queryKey: [GET_CUSTOM_REQUEST_LIST_KEY],
    queryFn: customRequestService.getRequests,
    placeholderData: keepPreviousData,
  });
}

export function useCustomRequestById(id: string, enabled = true) {
  return useQuery<CustomFlowerRequest>({
    queryKey: [GET_CUSTOM_REQUEST_BY_ID_KEY, id],
    queryFn: () => customRequestService.getRequestById(id),
    enabled: enabled && !!id,
    placeholderData: keepPreviousData,
  });
}
