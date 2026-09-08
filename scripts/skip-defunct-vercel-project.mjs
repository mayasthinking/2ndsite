// Exit 0 skips the Vercel build. Used to ignore the defunct 2ndsitev2 project
// that is still connected to this GitHub repo.
const haystack = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
].join(" ");

process.exit(/2ndsitev2/i.test(haystack) ? 0 : 1);
