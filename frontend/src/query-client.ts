// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Import it for cache calls outside components, for example
// queryClient.invalidateQueries or setQueryData in websocket or push
// handlers; inside components useQueryClient() returns this same instance.
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Family sharing: keep pantry/shopping/recipes/meals in sync across devices via light polling.
      refetchInterval: 8000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  },
});
