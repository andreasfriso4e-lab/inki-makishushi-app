module.exports = {
  apps: [
    {
      name: "inki-print-bridge",
      script: "scripts/print-bridge.mjs",
      cwd: "/Users/tanddem/Documents/New project/pos-frontend",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PRINT_BRIDGE_POLL_MS: "1500",
      },
    },
  ],
};

