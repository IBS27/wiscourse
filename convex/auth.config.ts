export default {
  providers: [
    {
      // Set CLERK_FRONTEND_API_URL in the Convex dashboard (from the Clerk
      // dashboard's Convex integration or the Clerk "Frontend API" URL).
      domain: process.env.CLERK_FRONTEND_API_URL,
      applicationID: "convex",
    },
  ],
};
