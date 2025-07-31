import axios from "axios";

export async function fetchQlooInsights(state: any) {
  const preferences = state.userPreferences;

  // You'll need to convert your preferences into Qloo's UUIDs
  // For now, assume you're using a sample UUID as in their example
  const interestEntityId = "FCE8B172-4795-43E4-B222-3B550DC05FD9"; // You need to map this from preferences

  const url = `https://api.qloo.com/v2/insights/?filter.type=urn:entity:place&signal.interests.entities=${interestEntityId}&filter.location.query=New%20York`;

  try {
    const { data } = await axios.get(url, {
      headers: {
        "X-Api-Key": process.env.QLOO_API_KEY!,
      },
    });

    return {
      ...state,
      qlooInsights: data,
    };
  } catch (error: any) {
    console.error("Qloo API error:", error?.response?.data || error.message);
    throw error;
  }
}
