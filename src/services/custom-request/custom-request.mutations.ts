import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customRequestService } from "./custom-request.api";
import {
  CANCEL_CUSTOM_REQUEST_KEY,
  CONFIRM_CUSTOM_REQUEST_QUOTE_KEY,
  CREATE_CUSTOM_REQUEST_KEY,
  GET_CUSTOM_REQUEST_BY_ID_KEY,
  GET_CUSTOM_REQUEST_LIST_KEY,
} from "@/constants/api";
import {
  CreateCustomFlowerRequestInput,
  CustomFlowerRequest,
} from "@/types/custom-request.types";

export function useCreateCustomRequest() {
  const queryClient = useQueryClient();

  return useMutation<CustomFlowerRequest, Error, CreateCustomFlowerRequestInput>({
    mutationKey: [CREATE_CUSTOM_REQUEST_KEY],
    mutationFn: (input) => customRequestService.createRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [GET_CUSTOM_REQUEST_LIST_KEY] });
    },
  });
}

export function useCancelCustomRequest() {
  const queryClient = useQueryClient();

  return useMutation<CustomFlowerRequest, Error, string>({
    mutationKey: [CANCEL_CUSTOM_REQUEST_KEY],
    mutationFn: (id) => customRequestService.cancelRequest(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [GET_CUSTOM_REQUEST_LIST_KEY] });
      queryClient.setQueryData([GET_CUSTOM_REQUEST_BY_ID_KEY, updated.id], updated);
    },
  });
}

export function useConfirmCustomRequestQuote() {
  const queryClient = useQueryClient();

  return useMutation<CustomFlowerRequest, Error, string>({
    mutationKey: [CONFIRM_CUSTOM_REQUEST_QUOTE_KEY],
    mutationFn: (id) => customRequestService.confirmQuote(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: [GET_CUSTOM_REQUEST_LIST_KEY] });
      queryClient.setQueryData([GET_CUSTOM_REQUEST_BY_ID_KEY, updated.id], updated);
    },
  });
}
