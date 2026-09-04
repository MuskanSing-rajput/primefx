module.exports = {
  apps: [
    {
      name: 'lp-backend',
      cwd: '/var/www/lp/apps/api',
      script: 'dist/apps/api/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/var/log/pm2/lp-backend-error.log',
      out_file: '/var/log/pm2/lp-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    },
    {
      name: 'lp-frontend',
      cwd: '/var/www/lp/apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/lp-frontend-error.log',
      out_file: '/var/log/pm2/lp-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    }
  ]
};
