import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Read response body as text first (can only read stream once)
    const text = await res.text();

    try {
      // Try to parse as JSON
      const errorData = JSON.parse(text);

      // If error has validation data (guidance, errors, matchRate), preserve it
      if (errorData.guidance || errorData.errors || errorData.matchRate !== undefined) {
        const error = new Error(errorData.message || `${res.status}: Request failed`);
        // Attach validation data to the error object
        Object.assign(error, errorData);
        throw error;
      }

      // Otherwise throw a standard error with the message
      throw new Error(errorData.message || `${res.status}: Request failed`);
    } catch (parseError) {
      // If JSON parsing fails, use the raw text
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
