module.exports = {
  apps: [
    {
      name: "backend",
      cwd: "./",
      // Max CPU threads
      exec_mode: "cluster",
      instances: "max",
      // Script to run ts-node
      script: "dist/index.js"
    }
  ]
}