import { defineConfig } from "cypress";
import { installHttpCache } from "cypress-http-cache";

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    supportFile: false,
    async setupNodeEvents(on, config) {
      return installHttpCache(on, config);
    },
    baseUrl: "http://localhost:3000"
  },
});
