export const ROLE_CONFIG = Object.freeze(
  [
    {
      slug: "senior-ai-product-engineer",
      title: "Senior AI Product Engineer",
      rateMin: 85,
      rateMax: 120,
      portfolioRequired: false
    },
    {
      slug: "senior-creative-frontend-developer",
      title: "Senior Creative Frontend Developer",
      rateMin: 65,
      rateMax: 95,
      portfolioRequired: true
    },
    {
      slug: "senior-full-stack-product-engineer",
      title: "Senior Full-Stack Product Engineer",
      rateMin: 70,
      rateMax: 105,
      portfolioRequired: false
    },
    {
      slug: "senior-product-designer",
      title: "Senior Product Designer",
      rateMin: 60,
      rateMax: 90,
      portfolioRequired: true
    },
    {
      slug: "senior-brand-visual-systems-designer",
      title: "Senior Brand and Visual Systems Designer",
      rateMin: 55,
      rateMax: 85,
      portfolioRequired: true
    },
    {
      slug: "senior-product-strategy-delivery-lead",
      title: "Senior Product Strategy and Delivery Lead",
      rateMin: 80,
      rateMax: 115,
      portfolioRequired: false
    }
  ].map((role) =>
    Object.freeze({
      ...role,
      currency: "EUR",
      engagement: "Independent contractor",
      location: "Remote worldwide"
    })
  )
);

export function getRoleBySlug(slug) {
  return ROLE_CONFIG.find((role) => role.slug === slug) ?? null;
}
