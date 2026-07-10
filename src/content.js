import {
  ArrowUpRight,
  Atom,
  Blocks,
  Bot,
  Braces,
  Flower2,
  GitBranch,
  Layers3,
  Orbit,
  PenTool,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Telescope,
  Waves
} from "lucide-react";

export const navItems = [
  { label: "Studio", href: "#studio" },
  { label: "Services", href: "#services" },
  { label: "Work", href: "#work" },
  { label: "Contact", href: "#contact" }
];

export const heroProof = [
  { label: "AI-native platforms", icon: Bot },
  { label: "Cinematic web", icon: Sparkles },
  { label: "Product systems", icon: Orbit }
];

export const services = [
  {
    key: "strategy",
    title: "Product strategy",
    icon: Telescope,
    accent: "#ed3b31",
    summary:
      "We turn early signals, technical constraints, and market pressure into a clear product path.",
    details: [
      "Opportunity mapping",
      "Narrative prototypes",
      "Launch architecture"
    ]
  },
  {
    key: "ai",
    title: "AI interfaces",
    icon: Bot,
    accent: "#c8ff24",
    summary:
      "We design AI workflows that feel legible, controlled, and useful beyond the demo.",
    details: ["Agent UX", "Evaluation loops", "Human handoff"]
  },
  {
    key: "web",
    title: "Web engineering",
    icon: Braces,
    accent: "#f5f0e8",
    summary:
      "We build fast, cinematic frontends and resilient systems without sacrificing maintainability.",
    details: ["React surfaces", "Motion systems", "Production hardening"]
  },
  {
    key: "brand",
    title: "Brand systems",
    icon: PenTool,
    accent: "#b99048",
    summary:
      "We create expressive visual systems that hold together across product, web, and launch moments.",
    details: ["Identity worlds", "Design tokens", "Content systems"]
  }
];

export const workflow = [
  {
    step: "01",
    title: "Sense",
    icon: Radar,
    body:
      "We immerse in the problem, map the terrain, and identify the signal worth building around."
  },
  {
    step: "02",
    title: "Shape",
    icon: Flower2,
    body:
      "We prototype the product, brand, and technical spine until the experience has a distinct center of gravity."
  },
  {
    step: "03",
    title: "Ship",
    icon: Rocket,
    body:
      "We build the system, tune the motion, verify the edge cases, and launch with room to evolve."
  }
];

export const capabilities = [
  { label: "Product maps", icon: GitBranch },
  { label: "AI agents", icon: Atom },
  { label: "Design systems", icon: Layers3 },
  { label: "Motion language", icon: Waves },
  { label: "Launch stacks", icon: Blocks },
  { label: "Quality gates", icon: ShieldCheck }
];

export const projects = [
  {
    name: "Nebula Ledger",
    type: "AI finance intelligence",
    image: "/assets/nebula-ledger-interface.png",
    body:
      "A real-time decision layer for finance teams that blends autonomous research with human review.",
    accent: "#ed3b31",
    icon: ArrowUpRight
  },
  {
    name: "BloomGrid",
    type: "Sensor operations platform",
    image: "/assets/bloomgrid-interface.png",
    body:
      "A living operations interface for growers, connecting sensor streams, recommendations, and field teams.",
    accent: "#b99048",
    icon: Flower2
  },
  {
    name: "OrbitCare",
    type: "Clinical coordination",
    image: "/assets/orbitcare-interface.png",
    body:
      "A calm workflow surface for care teams coordinating handoffs, patient updates, and escalations.",
    accent: "#c8ff24",
    icon: Orbit
  }
];

export const contactLinks = [
  { label: "auralis.careers@proton.me", href: "mailto:auralis.careers@proton.me" },
  { label: "Studio deck", href: "#studio" }
];
