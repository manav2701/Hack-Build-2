/**
 * Dynamic Food Image Resolver
 * 
 * Returns the backend's image_url if provided by context.dev / backend verdict.
 * Otherwise dynamically resolves a high-res food image based on dish title keywords.
 */
export function getFoodImage(name: string = "", restaurant: string = "", rawImageUrl?: string | null): string {
  if (rawImageUrl && rawImageUrl.startsWith("http")) {
    return rawImageUrl;
  }

  const query = `${name} ${restaurant}`.toLowerCase();

  if (query.includes("wrap") || query.includes("cigkofte") || query.includes("shawarma")) {
    return "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=800&q=80"; // Turkish Wrap / Shawarma
  }
  if (query.includes("wonton") || query.includes("dumpling") || query.includes("dim sum")) {
    return "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80"; // Sichuan Wontons
  }
  if (query.includes("biryani") || query.includes("rice") || query.includes("pulao")) {
    return "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80"; // Biryani
  }
  if (query.includes("burger") || query.includes("smash")) {
    return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80"; // Gourmet Burger
  }
  if (query.includes("taco") || query.includes("mexican")) {
    return "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80"; // Tacos
  }
  if (query.includes("sushi") || query.includes("roll")) {
    return "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80"; // Sushi
  }
  if (query.includes("pizza")) {
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80"; // Pizza
  }
  if (query.includes("pasta") || query.includes("noodle")) {
    return "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80"; // Pasta / Noodles
  }
  if (query.includes("salad") || query.includes("bowl") || query.includes("healthy") || query.includes("green")) {
    return "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80"; // Salad Bowl
  }

  // Default vibrant culinary dish
  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80";
}
