# Client form options and GSTIN checks

The client form loads its industries, payment models, states and cities from MongoDB through authenticated REST endpoints. Authorized client managers can use inline Add controls to create and immediately select a new option. Option names are case-insensitively unique within their kind and state scope.

## Payment models

1. Model 1 – Monthly Salary-Based: placement fee percentage of monthly salary.
2. Model 2 – Annual CTC-Based: placement fee percentage of annual CTC.
3. Model 3 – Fixed Fee Per Joining: fixed amount in INR, stored as integer `fixedFeePaise`.

Custom payment models choose either a percentage fee or fixed amount. The server derives `feeType` from the saved model rather than trusting the browser. These are client agreement fields, not automatic invoice or incentive calculations. Existing free-text payment terms are retained as selectable legacy models during the first seed.

## Locations

The initial seed imports all 36 Indian states/union territories and their available city/town lists from the installed country-state-city dataset. This community-maintained dataset is not a guarantee that every settlement is included. Missing cities can be added under the selected state, and custom states/regions can also be added. Changing the selected state clears the old city. The backend rejects a city that does not belong to its selected state.

Dataset/package reference: https://github.com/harpreetkhalsagtbit/country-state-city . The dependency is GPL-3.0; its license is retained in `docs/licenses/country-state-city-LICENSE.txt`. The package credits https://github.com/dr5hn/countries-states-cities-database as its data source. See that source's license for database attribution and reuse terms. Geography lookup runs on the backend, so the worldwide dataset is not bundled into the frontend.

## GSTIN

Validate checks the 15-character GSTIN structure and base-36 checksum on the backend. Client save also rejects an invalid supplied GSTIN, even if the button was bypassed. Input is normalized to uppercase.

A successful format/checksum result does not mean that a GST registration exists, is active, or belongs to the company. The response explicitly returns `registrationVerified:false` and the form links to the official GST Portal for registration verification. No external GST provider has been configured or claimed to work.

Official taxpayer search documentation: https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_Taxpayer_manual.htm . Government GSTIN structure reference: https://dor.gov.in/files/inline-documents/Registration_29102015.pdf .

## REST endpoints

- `GET /api/client-options`: industries, payment models, states, and write capability.
- `GET /api/client-options/cities?state=Maharashtra`: all saved cities for that state.
- `POST /api/client-options`: `{kind,name,state?,feeType?}`. `kind` is `industry`, `paymentModel`, `state` or `city`. A city requires a saved state; a payment model requires `feeType:percentage|fixed`. Mutations are audited.
- `POST /api/client-options/gstin/validate`: `{gstin}`. Returns validity, format/checksum checks, registration-verification status and the official portal link.
- Existing `POST/PATCH /api/clients` accept `paymentTerms`, `placementFee`, `feeType` and `fixedFeePaise` along with the industry/state/city/GSTIN fields. The server validates selected options and relationships.

The first startup seeds the master catalog idempotently and preserves custom options. No candidate/client contact records or passwords are changed by this catalog seed.
