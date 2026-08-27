export interface ApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string | undefined>;
}

export interface ApiErrorPayload {
  message: string;
  error_code?: string;
}

export interface ApiJsonResult<TResponse> {
  data: TResponse;
  headers: Headers;
  status: number;
}
