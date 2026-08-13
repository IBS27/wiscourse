import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function MissingEnv({ names }: { names: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md space-y-3 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">Setup needed</h1>
        <p className="text-sm text-muted-foreground">
          Add the missing environment variables to <code>.env.local</code>,
          then restart the dev server:
        </p>
        <ul className="list-inside list-disc font-mono text-sm">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          See the README for where each value comes from.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!convex || !clerkPublishableKey) {
    return (
      <MissingEnv
        names={[
          ...(convexUrl ? [] : ["VITE_CONVEX_URL"]),
          ...(clerkPublishableKey ? [] : ["VITE_CLERK_PUBLISHABLE_KEY"]),
        ]}
      />
    );
  }
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <RouterProvider router={router} />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
