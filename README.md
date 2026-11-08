# dosewell
Dosewell by Williams Industries. A personal medication planner with dose reminders and a local medication log.

## Free local interaction search

Dosewell includes an offline adaptation of all eight CSV files on the [DDInter 2.0 download page](https://ddinter2.scbdd.com/download/). The exports contain 160,235 distinct unordered drug pairs across 1,939 drug entries. Source release May 14, 2024. Files retrieved November 8, 2026. These exports are a subset of the full DDInter website. Dosewell merges duplicate records and packs the original pair ratings into a local lookup index. It preserves the source’s unknown ratings. An unlisted combination has no safety determination.

DDInter 2.0 © Computational Biology & Drug Design Group, Tian Y. et al., [Nucleic Acids Research](https://doi.org/10.1093/nar/gkae726). The source database and Dosewell’s adapted data in `ddinter-data.js` are available under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [DDInter terms and disclaimer](https://ddinter2.scbdd.com/terms/). No endorsement is implied. The data may contain errors or omissions.

## Medication names

The shared offline resolver uses U.S. National Library of Medicine [RxTerms](https://lhncbc.nlm.nih.gov/RxNav/applications/RxTerms.html) and [RxNorm Current Prescribable Content](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html), November 2026. It maps names to ingredient sets and retains available formulation information. Earlier brand names are included when their recorded generic product still maps to a current catalog entry. These terminology resources identify medicines. The interaction sources and coverage are separate. NLM provides the terminology and does not endorse Dosewell.

To rebuild the index using the corresponding NLM archives, run `python build-rxnames.py RxTerms202611.zip RxNorm_full_prescribe_11022026.zip`. Run `node test-medication-names.mjs` and `node test-nimodipine.mjs` with Node.js 22.7 or newer to verify it.

## Optional DrugBank interaction search

The web planner includes a separate online checker for DrugBank product matches and drug interactions. Its controls appear only when a gateway is configured. Visitors choose which names to search and confirm a product for each before checking the list. The offline report operates independently.

1. Obtain DrugBank access for Medication Search and Drug-Drug Interactions covering a public, account-free U.S. patient website. Confirm the permitted patient display, attribution and usage limits with DrugBank. Start with a development key and synthetic products.
2. Deploy the gateway to your own Cloudflare Workers account with Wrangler 4.36 or newer. From the repository root run `npx wrangler deploy -c wrangler.drugbank.jsonc`, then `npx wrangler secret put DRUGBANK_API_KEY -c wrangler.drugbank.jsonc`. Enter the key at the secret prompt. Without the secret the Worker returns an unavailable response.
3. In a review build, set the `dosewell-drugbank-gateway` meta tag in `index.html` to the HTTPS origin of that Worker, with no path. The gateway allows requests from `https://sneakyzebra.github.io`. Use a separate Worker with the review site's origin for testing elsewhere. Keep keys out of the HTML, repository, app and URL.
4. Verify a known result and the unavailable and unmatched paths against the licensed service. Set the production secret through the same private prompt and publish the origin on the web planner after those checks. The Android offline installer and optional native iPhone project are separate releases.

`drugbank-gateway.mjs` accepts only product search and interaction check requests, uses U.S. product concepts, and rejects incomplete interaction reports. The gateway sends only the entered search name or confirmed product IDs upstream. It does not persist request bodies. The included Worker setting limits requests per client per minute at each Cloudflare location. Review your provider quotas before enabling a public deployment.
