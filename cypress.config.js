const { defineConfig } = require("cypress");
const { installHttpCache } = require("./src/index");

module.exports = defineConfig({
  allowCypressEnv: false,
  e2e: {
    supportFile: false,
    async setupNodeEvents(on, config) {
      return installHttpCache(on, config);
    },
    baseUrl: "http://localhost:3000"
  },
});
