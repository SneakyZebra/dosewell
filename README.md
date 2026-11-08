# dosewell
Dosewell by Williams Industries. A personal medication planner with dose reminders and a local medication log.

## Optional DrugBank interaction search

The web planner includes a separate online checker for DrugBank product matches and drug interactions. Its controls appear only when a gateway is configured. Visitors choose which names to search and confirm a product for each before checking the list. The offline report operates independently.

1. Obtain DrugBank access for Medication Search and Drug-Drug Interactions covering a public, account-free U.S. patient website. Confirm the permitted patient display, attribution and usage limits with DrugBank. Start with a development key and synthetic products.
2. Deploy the gateway to your own Cloudflare Workers account with Wrangler 4.36 or newer. From the repository root run `npx wrangler deploy -c wrangler.drugbank.jsonc`, then `npx wrangler secret put DRUGBANK_API_KEY -c wrangler.drugbank.jsonc`. Enter the key at the secret prompt. Without the secret the Worker returns an unavailable response.
3. In a review build, set the `dosewell-drugbank-gateway` meta tag in `index.html` to the HTTPS origin of that Worker, with no path. The gateway allows requests from `https://sneakyzebra.github.io`. Use a separate Worker with the review site's origin for testing elsewhere. Keep keys out of the HTML, repository, app and URL.
4. Verify a known result and the unavailable and unmatched paths against the licensed service. Set the production secret through the same private prompt and publish the origin on the web planner after those checks. The Android offline installer and optional native iPhone project are separate releases.

`drugbank-gateway.mjs` accepts only product search and interaction check requests, uses U.S. product concepts, and rejects incomplete interaction reports. The gateway sends only the entered search name or confirmed product IDs upstream. It does not persist request bodies. The included Worker setting limits requests per client per minute at each Cloudflare location. Review your provider quotas before enabling a public deployment.
