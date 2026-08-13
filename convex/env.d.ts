// The Convex runtime exposes deployment environment variables on
// process.env without the rest of the Node globals.
declare const process: {
  env: Record<string, string | undefined>;
};
