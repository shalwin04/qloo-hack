import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export async function fetchQlooInsights(state: any) {
  // Replace with actual mapping logic if needed
  const interestEntityId = "FCE8B172-4795-43E4-B222-3B550DC05FD9";

  const url = `https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:place&signal.interests.entities=${interestEntityId}&filter.location.query=New%20York`;

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
