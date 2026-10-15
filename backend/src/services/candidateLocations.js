import { City } from "country-state-city";
export async function locationSuggestions(query, apiKey, fetcher = fetch) {
  if (apiKey) {
    const response = await fetcher(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        signal: AbortSignal.timeout(7000),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.text.text,suggestions.placePrediction.placeId",
        },
        body: JSON.stringify({
          input: query,
          includedPrimaryTypes: ["(cities)"],
          languageCode: "en",
        }),
      },
    );
    if (!response.ok) throw new Error("Location provider unavailable");
    const data = await response.json();
    return {
      provider: "google",
      items: (data.suggestions || [])
        .flatMap((s) =>
          s.placePrediction?.text?.text
            ? [
                {
                  name: s.placePrediction.text.text,
                  id: s.placePrediction.placeId,
                },
              ]
            : [],
        )
        .slice(0, 10),
    };
  }
  const needle = query.toLowerCase();
  return {
    provider: "local",
    items: City.getCitiesOfCountry("IN")
      .filter((c) => c.name.toLowerCase().startsWith(needle))
      .slice(0, 10)
      .map((c) => ({ name: c.name + ", " + c.stateCode + ", India" })),
  };
}
