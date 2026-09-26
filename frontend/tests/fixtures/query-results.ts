import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";

// Real observer results keep the hook state complete; fixture payloads remain
// type checked instead of being hidden inside an `as never` return value.
export function queryResult<T>(data: T) {
  return new QueryObserver<T>(new QueryClient(), {
    queryKey: ["fixture"],
    queryFn: async () => data,
    initialData: data,
    enabled: false,
  }).getCurrentResult();
}

export function idleQueryResult<T>() {
  return new QueryObserver<T>(new QueryClient(), {
    queryKey: ["fixture"],
    enabled: false,
  }).getCurrentResult();
}

export function errorQueryResult<T>(error: Error) {
  const observer = new QueryObserver<T>(new QueryClient(), {
    queryKey: ["fixture"],
    enabled: false,
  });
  observer.getCurrentQuery().setState({ status: "error", error });
  observer.updateResult();
  return observer.getCurrentResult();
}

export function loadingQueryResult<T>() {
  const client = new QueryClient();
  void client.fetchQuery({
    queryKey: ["fixture"],
    queryFn: () =>
      new Promise<T>(() => {
        // Keep this fixture in the loading state without a network request.
      }),
  });
  return new QueryObserver<T>(client, { queryKey: ["fixture"] }).getCurrentResult();
}

export function mutationResult<T, V>(mutateAsync: (variables: V) => Promise<T>) {
  return {
    ...new MutationObserver<T, Error, V>(new QueryClient(), {
      mutationFn: mutateAsync,
    }).getCurrentResult(),
    mutateAsync,
  };
}
