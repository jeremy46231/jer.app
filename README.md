# jer.app

## Deploy

Cloudflare makes it super easy to deploy a working app in literally 56 seconds (yes, from clicking the button to being on the deployed app, I timed it :D). Just follow these steps:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jeremy46231/jer.app)

1. Click the "Deploy to Cloudflare" button above, and sign into Cloudflare if needed.
2. Optionally, tweak the project name, database name, or the Git repository that Cloudflare will create for you. All other settings can be left as-is.
3. Click "Create and deploy" at the bottom.
4. Wait 30 seconds (yep, I timed it) until you see the "Success! Your project is deployed to Region: Earth" header.
5. You're done! The project is now available at the URL on screen.

By default, the project will be available at a long `.workers.dev` domain, the dashboard will be available with no authentication, and the root URL will redirect to the dashboard. You can configure this by setting variables in Cloudflare:

1. Navigate to your project on Cloudflare. (If you just deployed, click "Continue to project".)
2. Under the "Settings" tab, find the "Variables and Secrets" section.
3. To add authentication, create two Secret variables named `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
4. To change where the root URL redirects, create a Text variable named `REDIRECT_URL`.
5. To add a custom domain:
   1. Scroll up to the "Domains & Routes" section and click "Add".
   2. Select "Custom domain" and enter the domain or subdomain you want to use.
   3. Click "Add domain". If you own the domain on Clouflare, it will be set up automatically. If not, follow the instructions to set up DNS records.
