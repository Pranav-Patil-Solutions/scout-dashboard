#!/usr/bin/env python3
"""Master profile for Pranav Patil — single source of truth for every CV/cover letter.

Job specs (jobs/*.json) override only the parts that need tailoring:
headline, summary, skills, core_focus, project emphasis, and the cover-letter body.
Everything else (experience, education, contact, languages, tools) stays stable here.
"""

# Contact card. Email/phone are placeholders here so no personal data ships in git;
# real values live in contact_local.py (gitignored). Copy contact_local.example.py
# to contact_local.py and fill it in — it overrides the placeholders below at import.
CONTACT = {
    "name": "Pranav Patil",
    "headline": "AI & Automation Strategist, Process Transformation & Data-Driven Operations",
    "email": "you@example.com",
    "phone": "+00 000 000 0000",
    "phone_tel": "+0000000000000",
    "location": "Berlin, Germany",
    "linkedin": "linkedin.com/in/your-handle",
    "linkedin_url": "https://linkedin.com/in/your-handle",
    "github": "github.com/Pranav-Patil-Solutions",
    "github_url": "https://github.com/Pranav-Patil-Solutions",
}

try:
    from contact_local import CONTACT as _CONTACT_LOCAL
    CONTACT.update(_CONTACT_LOCAL)
except ImportError:
    pass  # placeholders above are used if no local override exists

# Sidebar summary — the default; job specs usually override this line.
SUMMARY = (
    "AI & automation strategist with a proven track record designing, building, and "
    "scaling end-to-end automation across finance, operations, and data systems. Deep "
    "expertise in workflow automation, process optimization, data analytics, and "
    "organizational change. MSc in International Business + Executive MBA in Operations. "
    "Berlin-based; driven by measurable impact, cost reduction, speed, quality, and team efficiency."
)

# Main column — Professional Experience. Each entry: dates, loc, role, company, bullets.
# A bullet is a list of (text, bold) fragments so key phrases render in navy.
EXPERIENCE = [
    {
        "dates": "Nov 2023 – Mar 2025", "loc": "Pune, India",
        "role": "Sourcing Executive", "company": "Beijer Electronics",
        "bullets": [
            [("Project lead", True), (" on consolidating 3 separate ERP systems into a single unified platform, aligned data models, processes, and cross-functional stakeholders through migration and cutover", False)],
            [("Strategic supplier intelligence and competitive market analysis across global networks; drove cost optimization and risk mitigation through data-informed negotiation", False)],
            [("Evaluated emerging market opportunities and regulatory developments; translated findings into actionable recommendations for senior leadership", False)],
        ],
    },
    {
        "dates": "Oct 2022 – Nov 2023", "loc": "Maharashtra, India",
        "role": "Operations & Supply Chain Executive", "company": "Mahindra Logistics",
        "bullets": [
            [("Managed complex logistics infrastructure (160 vehicles/day, 4.8M parts, just-in-time) with zero-tolerance constraints; led a team of 50–60 across warehouses, transport, and supplier coordination", False)],
            [("Analyzed node relationships and failure points, designed optimization levers, and built real-time dashboards for operational visibility; maintained 99.7% on-time delivery to production lines", False)],
        ],
    },
    {
        "dates": "Jun 2019 – Jun 2020", "loc": "Pune, India",
        "role": "Development Team Intern, Manufacturing Operations", "company": "Amphenol Interconnect",
        "bullets": [
            [("Worked in the development team on precision interconnect programs for flagship aerospace & defense missions, including a ", False), ("SpaceX", True), (" launch program, ", False), ("DRDO", True), (" defense systems, and ", False), ("ISRO's Chandrayaan", True), (" lunar mission", False)],
            [("Held production schedules to plan in a high-volume precision plant without compromising quality", False)],
        ],
    },
]

# AI & Automation Projects — single entry, bullets are the shipped projects.
# Job specs can override PROJECTS to reorder/emphasize per JD.
PROJECTS_ENTRY = {
    "dates": "2025 – Present", "loc": "Berlin, Germany",
    "role": "AI & Automation Lead", "company": "Personal Projects",
}
PROJECTS = [
    [("RevenueOS (Finance Automation):", True), (" end-to-end bookkeeping & GST-compliance automation; local-first architecture with AI row extraction from khata photos and double-entry ledger, 80% less manual data entry", False)],
    [("scout-dashboard (Job Intelligence):", True), (" AI job-scraping pipeline (198+ live sources), Turso real-time backend, and analytics dashboards with full data lineage and cost tracking", False)],
    [("AgentOS (Agent Fleet Management):", True), (" multi-tenant SaaS for AI agent orchestration and monitoring; real-time dashboards for agent performance, cost, and quality", False)],
    [("PetraOS & Granitopia (E-Commerce):", True), (" end-to-end platforms with automated data pipelines, real-time inventory sync, and customer analytics; deployed with CI/CD and full observability", False)],
]

EDUCATION = [
    {"dates": "2025 – 2026", "loc": "Berlin, Germany", "role": "MSc, International Business",
     "company": "Gisma University of Applied Sciences",
     "desc": "Dissertation: Supply Chain Resilience & Supplier Persistence in European Industrial Supply Networks."},
    {"dates": "2023 – 2025", "loc": "India", "role": "Executive MBA, Operations Management",
     "company": "MIT School of Distance Education", "desc": None},
    {"dates": "2016 – 2022", "loc": "India", "role": "B.E., Mechanical Engineering",
     "company": "DY Patil University", "desc": None},
]

LANGUAGES = [
    ("English", ": Proficient (C1)"),
    ("German", ": Basic (A2, active)"),
    ("Hindi", ": Native"),
    ("Marathi", ": Native"),
]

# Tools & Technology — (label_or_None, text)
TOOLS = [
    ("Automation:", " n8n, Zapier, Make"),
    ("AI / LLM:", " LLM integration, RPA, process mining"),
    ("Data & Analytics:", " SQL, ETL, DWH design"),
    (None, "Tableau, Quicksight"),
    (None, "CI/CD, API integration, observability"),
    ("ERP:", " SAP MM, ERP consolidation"),
    (None, "GitHub"),
]

SKILLS = [
    "Workflow automation & orchestration",
    "AI / LLM integration",
    "ERP consolidation & migration",
    "Data pipelines & analytics",
    "Process & cost optimization",
    "Operations & supply chain",
    "Cross-functional stakeholder alignment",
    "First-principles problem-solving",
]

CORE_FOCUS = [
    "End-to-end process transformation",
    "Aerospace & defense precision programs",
    "Real-time dashboards & visibility",
    "Measurable KPI impact",
]
