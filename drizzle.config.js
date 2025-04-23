/** @type { import("drizzle-kit").Config } */
export default {
  schema: "./utils/schema.js",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://neondb_owner:Y4magt3NBKSZ@ep-old-paper-a5rjmk6j.us-east-2.aws.neon.tech/miniproject?sslmode=require",
  },
};
