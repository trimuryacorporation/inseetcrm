# Candidate fields

Candidate source, qualification and skills are shared MongoDB options with case-insensitive uniqueness. Authorized recruitment staff can add options; additions are audited. Skills support multiple selections (maximum 50), saved as an array. Skills suggestions use the workspace catalog, not Google web scraping.

Current salary and expected salary accept digits only, up to 12 digits. Notice period is whole days, up to 4 digits. Validation also applies to REST creates, updates and CSV imports. Existing schema stores these as digit strings to avoid changing existing records.

Current city and preferred location search is debounced. Without a provider key, Indian cities from country-state-city are offered and clearly labeled. Manual entry remains available.

For Google city predictions, enable billing and Places API (New) in Google Cloud, restrict a server-side API key appropriately, put GOOGLE_PLACES_API_KEY in backend/.env, and restart the backend. Never put it in frontend/VITE variables. Calls go through the authenticated backend, use cities-only predictions, have a seven-second timeout and are not cached. Google attribution is shown with Google results. No Google requests have been verified against a live key in this environment.

Google reference: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

Endpoints: GET /api/candidate-options; POST /api/candidate-options {kind: source|qualification|skill, name}; GET /api/candidate-options/skills?q=; GET /api/candidate-options/locations?q=.
