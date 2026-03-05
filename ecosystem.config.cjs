module.exports = {
  apps: [
    {
      name: "oss-scaler",
      script: "scripts/bun-run.sh",
      cwd: __dirname,
      interpreter: "bash",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 30000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
